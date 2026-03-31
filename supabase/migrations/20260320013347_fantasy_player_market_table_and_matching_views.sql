/*
  # Fantasy Player Market — Table, Matching Views, and Logging

  ## Summary
  Creates the canonical fantasy player market table and rebuilds all matching
  views to source from it. This is the single ingestion point for AFL Fantasy
  player data (prices, positions, ownership, etc.) imported by admin.

  ## New Tables
  1. **afl.fantasy_player_market** — staging + canonical fantasy market data
     - external_name: the name exactly as it appears in the fantasy platform
     - full_name / first_name / last_name: parsed name components
     - position, team, price, avg_score, games_played
     - season, round_number, ingested_at
     - player_id: resolved canonical player ID (nullable until matched)

  ## Rebuilt Views (CASCADE drop first)
  1. **public.v_fantasy_player_matched** — all rows from fantasy_player_market
     joined to canonical players with confidence scoring. Manual overrides
     (player_name_map where is_verified=true) always win.
  2. **public.v_fantasy_unmatched_players** — rows with player_id IS NULL
     or match_confidence < 0.9 (needs review)
  3. **public.v_match_confidence_log** — aggregate distribution of confidence bands

  ## New Functions
  - **afl.refresh_fantasy_market_matches()** — re-runs the auto-match logic
    across all unresolved rows in fantasy_player_market, applying player_name_map
    overrides and surname matching. Idempotent. Called by the pipeline.
  - **public.get_match_confidence_log()** — RPC returning the log view
  - **public.get_matching_stats()** — updated to include fantasy_player_market stats

  ## Security
  - RLS enabled on fantasy_player_market (admin write only)
  - Views granted to authenticated
  - RPCs restricted to authenticated
*/

-- ──────────────────────────────────────────────────────────────────────────────
-- 0. Drop dependent views in the right order (CASCADE safe)
-- ──────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_match_confidence_log;
DROP VIEW IF EXISTS public.v_fantasy_unmatched_players;
DROP VIEW IF EXISTS public.v_fantasy_player_matched;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TABLE: afl.fantasy_player_market
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.fantasy_player_market (
  id               bigserial        PRIMARY KEY,
  external_name    text             NOT NULL,
  full_name        text,
  first_name       text,
  last_name        text,
  position         text,
  team             text,
  price            integer,
  avg_score        numeric(6,2),
  games_played     integer,
  season           integer          NOT NULL DEFAULT 2026,
  round_number     integer,
  ingested_at      timestamptz      DEFAULT now(),
  updated_at       timestamptz      DEFAULT now(),

  -- Resolved match fields (populated by refresh_fantasy_market_matches)
  player_id        integer          REFERENCES afl.players(player_id),
  match_confidence numeric(4,3),
  match_method     text
    CHECK (match_method IN ('manual_override','exact','fuzzy_surname','unmatched')),
  match_reviewed   boolean          DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fpm_external_season_round
  ON afl.fantasy_player_market (external_name, season, round_number);

CREATE INDEX IF NOT EXISTS idx_fpm_player_id
  ON afl.fantasy_player_market (player_id);

CREATE INDEX IF NOT EXISTS idx_fpm_unmatched
  ON afl.fantasy_player_market (player_id)
  WHERE player_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_fpm_season_round
  ON afl.fantasy_player_market (season, round_number);

ALTER TABLE afl.fantasy_player_market ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select fantasy_player_market"
  ON afl.fantasy_player_market FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can insert fantasy_player_market"
  ON afl.fantasy_player_market FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update fantasy_player_market"
  ON afl.fantasy_player_market FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. FUNCTION: afl.refresh_fantasy_market_matches()
-- Re-runs auto-match on all rows without a verified override.
-- Priority:  manual_override (is_verified=true) > exact full name > surname unique > surname ambiguous
-- Idempotent — safe to call on every pipeline run.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.refresh_fantasy_market_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_updated   integer := 0;
  v_exact     integer := 0;
  v_fuzzy     integer := 0;
  v_override  integer := 0;
  v_unmatched integer := 0;
  v_rec       record;
  v_player_id integer;
  v_conf      numeric;
  v_method    text;
  v_surname   text;
  v_surname_count integer;
BEGIN

  FOR v_rec IN
    SELECT f.id, f.external_name, f.full_name, f.last_name, f.match_method
    FROM afl.fantasy_player_market f
    WHERE f.match_method IS DISTINCT FROM 'manual_override'
       OR f.player_id IS NULL
  LOOP

    v_player_id := NULL;
    v_conf      := 0.0;
    v_method    := 'unmatched';

    -- 1. Check manual override
    SELECT pnm.player_id, pnm.confidence
    INTO v_player_id, v_conf
    FROM afl.player_name_map pnm
    WHERE pnm.is_verified = true
      AND (
        lower(pnm.external_name)             = lower(v_rec.external_name)
        OR lower(pnm.normalized_source_name) = upper(trim(v_rec.external_name))
        OR lower(pnm.source_name)            = lower(v_rec.external_name)
      )
    LIMIT 1;

    IF v_player_id IS NOT NULL THEN
      v_method   := 'manual_override';
      v_conf     := COALESCE(v_conf, 1.0);
      v_override := v_override + 1;

    ELSE
      -- 2. Exact full-name match
      SELECT p.player_id INTO v_player_id
      FROM afl.players p
      WHERE lower(p.player_name) = lower(v_rec.external_name)
        AND p.active = true
      LIMIT 1;

      IF v_player_id IS NOT NULL THEN
        v_method := 'exact';
        v_conf   := 1.0;
        v_exact  := v_exact + 1;

      ELSE
        -- 3. Surname match
        v_surname := split_part(
          v_rec.external_name, ' ',
          array_length(string_to_array(v_rec.external_name, ' '), 1)
        );

        SELECT COUNT(*) INTO v_surname_count
        FROM afl.players p
        WHERE lower(split_part(p.player_name, ' ', array_length(string_to_array(p.player_name, ' '), 1)))
            = lower(v_surname)
          AND p.active = true;

        IF v_surname_count = 1 THEN
          SELECT p.player_id INTO v_player_id
          FROM afl.players p
          WHERE lower(split_part(p.player_name, ' ', array_length(string_to_array(p.player_name, ' '), 1)))
              = lower(v_surname)
            AND p.active = true;
          v_method := 'fuzzy_surname';
          v_conf   := 0.7;
          v_fuzzy  := v_fuzzy + 1;

        ELSIF v_surname_count > 1 THEN
          SELECT p.player_id INTO v_player_id
          FROM afl.players p
          WHERE lower(split_part(p.player_name, ' ', array_length(string_to_array(p.player_name, ' '), 1)))
              = lower(v_surname)
            AND p.active = true
          ORDER BY p.player_name
          LIMIT 1;
          v_method := 'fuzzy_surname';
          v_conf   := 0.5;
          v_fuzzy  := v_fuzzy + 1;

        ELSE
          v_method    := 'unmatched';
          v_conf      := 0.0;
          v_player_id := NULL;
          v_unmatched := v_unmatched + 1;
        END IF;
      END IF;
    END IF;

    UPDATE afl.fantasy_player_market
    SET
      player_id        = v_player_id,
      match_confidence = v_conf,
      match_method     = v_method,
      updated_at       = now()
    WHERE id = v_rec.id;

    v_updated := v_updated + 1;

  END LOOP;

  -- Sync unmatched into the name resolver queue
  INSERT INTO afl.unmatched_player_names (source_name, normalized_source_name, example_price)
  SELECT f.external_name, upper(trim(f.external_name)), f.price
  FROM afl.fantasy_player_market f
  WHERE f.player_id IS NULL
  ON CONFLICT (normalized_source_name) DO UPDATE
    SET example_price = EXCLUDED.example_price,
        updated_at    = now();

  -- Log
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'fantasy_market_match_refresh',
    'afl.refresh_fantasy_market_matches',
    'info',
    format(
      'Match refresh — updated=%s override=%s exact=%s fuzzy=%s unmatched=%s',
      v_updated, v_override, v_exact, v_fuzzy, v_unmatched
    ),
    jsonb_build_object(
      'updated',   v_updated,
      'override',  v_override,
      'exact',     v_exact,
      'fuzzy',     v_fuzzy,
      'unmatched', v_unmatched
    )
  );

  RETURN jsonb_build_object(
    'updated',   v_updated,
    'override',  v_override,
    'exact',     v_exact,
    'fuzzy',     v_fuzzy,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE ALL ON FUNCTION afl.refresh_fantasy_market_matches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION afl.refresh_fantasy_market_matches() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. VIEW: public.v_fantasy_player_matched
-- ──────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_fantasy_player_matched
WITH (security_invoker = true)
AS
SELECT
  f.id,
  f.external_name,
  f.full_name,
  f.first_name,
  f.last_name,
  f.position,
  f.team,
  f.price,
  f.avg_score,
  f.games_played,
  f.season,
  f.round_number,
  f.ingested_at,
  f.player_id,
  p.player_name                           AS canonical_name,
  p.position_group,
  COALESCE(f.match_confidence, 0.0)       AS match_confidence,
  COALESCE(f.match_method, 'unmatched')   AS match_method,
  f.match_reviewed,
  f.player_id IS NOT NULL                 AS is_matched,
  (f.player_id IS NULL OR COALESCE(f.match_confidence, 0.0) < 0.9) AS needs_review
FROM afl.fantasy_player_market f
LEFT JOIN afl.players p ON p.player_id = f.player_id;

GRANT SELECT ON public.v_fantasy_player_matched TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. VIEW: public.v_fantasy_unmatched_players
-- ──────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_fantasy_unmatched_players
WITH (security_invoker = true)
AS
SELECT
  fpm.id,
  fpm.external_name,
  fpm.full_name,
  fpm.last_name,
  fpm.position,
  fpm.team,
  fpm.price,
  fpm.season,
  fpm.round_number,
  fpm.player_id           AS suggested_player_id,
  fpm.canonical_name      AS suggested_player_name,
  fpm.position_group      AS suggested_position,
  fpm.match_confidence    AS suggested_confidence,
  fpm.match_method,
  fpm.needs_review,
  fpm.ingested_at
FROM public.v_fantasy_player_matched fpm
WHERE fpm.is_matched = false
   OR fpm.needs_review = true
ORDER BY fpm.ingested_at DESC;

GRANT SELECT ON public.v_fantasy_unmatched_players TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. VIEW: public.v_match_confidence_log
-- ──────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_match_confidence_log
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE match_method = 'manual_override')           AS manual_override_count,
  COUNT(*) FILTER (WHERE match_method = 'exact')                     AS exact_match_count,
  COUNT(*) FILTER (WHERE match_method = 'fuzzy_surname'
                      AND match_confidence >= 0.7)                   AS high_confidence_count,
  COUNT(*) FILTER (WHERE match_method = 'fuzzy_surname'
                      AND match_confidence < 0.7)                    AS medium_confidence_count,
  COUNT(*) FILTER (WHERE is_matched = false)                         AS unmatched_count,
  COUNT(*) FILTER (WHERE needs_review = true)                        AS needs_review_count,
  ROUND(AVG(match_confidence) FILTER (WHERE is_matched = true), 3)  AS avg_match_confidence,
  COUNT(*)                                                           AS total_rows,
  now()                                                              AS computed_at
FROM public.v_fantasy_player_matched;

GRANT SELECT ON public.v_match_confidence_log TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RPC: public.get_match_confidence_log()
-- ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_match_confidence_log();

CREATE FUNCTION public.get_match_confidence_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE v_log record;
BEGIN
  SELECT * INTO v_log FROM public.v_match_confidence_log LIMIT 1;
  RETURN jsonb_build_object(
    'manual_override_count',   v_log.manual_override_count,
    'exact_match_count',       v_log.exact_match_count,
    'high_confidence_count',   v_log.high_confidence_count,
    'medium_confidence_count', v_log.medium_confidence_count,
    'unmatched_count',         v_log.unmatched_count,
    'needs_review_count',      v_log.needs_review_count,
    'avg_match_confidence',    v_log.avg_match_confidence,
    'total_rows',              v_log.total_rows,
    'computed_at',             v_log.computed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_confidence_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_confidence_log() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Updated get_matching_stats() — includes fantasy_player_market data
-- ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_matching_stats();

CREATE FUNCTION public.get_matching_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_unmatched_queue  integer;
  v_unmatched_market integer;
  v_low_conf         integer;
  v_verified_maps    integer;
  v_total_maps       integer;
  v_avg_conf         numeric;
BEGIN
  SELECT COUNT(*) INTO v_unmatched_queue
  FROM afl.unmatched_player_names WHERE resolved = false;

  SELECT COUNT(*) INTO v_unmatched_market
  FROM afl.fantasy_player_market WHERE player_id IS NULL;

  SELECT COUNT(*) INTO v_verified_maps
  FROM afl.player_name_map WHERE is_verified = true;

  SELECT COUNT(*) INTO v_total_maps
  FROM afl.player_name_map;

  SELECT COUNT(*) INTO v_low_conf
  FROM afl.fantasy_player_market
  WHERE match_confidence < 0.7 AND player_id IS NOT NULL;

  SELECT ROUND(AVG(match_confidence), 3) INTO v_avg_conf
  FROM afl.fantasy_player_market WHERE player_id IS NOT NULL;

  RETURN jsonb_build_object(
    'unmatched_count',       v_unmatched_queue,
    'unmatched_market',      v_unmatched_market,
    'low_confidence_count',  v_low_conf,
    'verified_maps',         v_verified_maps,
    'total_maps',            v_total_maps,
    'avg_confidence',        v_avg_conf,
    'computed_at',           now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_matching_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_matching_stats() TO authenticated;
