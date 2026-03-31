/*
  # Fantasy Player Matching System

  ## Summary
  Extends the existing player name mapping infrastructure with:
  1. New columns on afl.player_name_map: external_name, confidence, is_verified
  2. View v_fantasy_player_matched: shows all unmatched queue rows with auto-match scoring
     and manual override support (is_verified = true wins)
  3. View v_fantasy_unmatched_players: unresolved names with best-match suggestion
  4. View v_match_confidence_log: tracks match quality distribution
  5. Function get_matching_stats(): returns unmatched count + low-confidence stats

  ## Modified Tables
  - afl.player_name_map: adds external_name (TEXT, alias for source_name),
    confidence (NUMERIC default 1.0), is_verified (BOOLEAN default false)

  ## New Views
  - public.v_fantasy_player_matched
  - public.v_fantasy_unmatched_players
  - public.v_match_confidence_log

  ## New Functions
  - public.get_matching_stats()

  ## Security
  - Views readable by authenticated only
  - RPC restricted to authenticated
*/

-- -------------------------------------------------------
-- 1. Extend afl.player_name_map
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'external_name'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN external_name text;
    UPDATE afl.player_name_map SET external_name = source_name WHERE external_name IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN confidence numeric DEFAULT 1.0;
    UPDATE afl.player_name_map SET confidence = 1.0 WHERE confidence IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN is_verified boolean DEFAULT false;
    -- Existing rows were manually entered by admins — mark them verified
    UPDATE afl.player_name_map SET is_verified = true WHERE is_verified IS NULL;
  END IF;
END $$;

-- -------------------------------------------------------
-- 2. v_fantasy_player_matched
-- Source: afl.unmatched_player_names (the staging queue of names not yet resolved)
-- Each row is scored:
--   - manual override (is_verified=true in player_name_map) → confidence from map
--   - exact full-name match → 1.0
--   - exact surname match (unique) → 0.7
--   - partial surname prefix → 0.0 (no match)
-- -------------------------------------------------------
DROP VIEW IF EXISTS public.v_fantasy_player_matched;

CREATE VIEW public.v_fantasy_player_matched
WITH (security_invoker = true)
AS
WITH unmatched AS (
  SELECT
    u.id,
    u.source_name,
    u.normalized_source_name,
    u.example_price,
    u.created_at,
    u.updated_at
  FROM afl.unmatched_player_names u
  WHERE u.resolved = false
),
surname_matches AS (
  -- For each unmatched row, find players sharing the same surname
  SELECT
    u.id,
    p.player_id,
    p.player_name,
    p.position_group,
    COUNT(*) OVER (PARTITION BY u.id) AS surname_match_count,
    CASE
      WHEN lower(u.source_name) = lower(p.player_name) THEN 1.0
      WHEN COUNT(*) OVER (PARTITION BY u.id) = 1        THEN 0.7
      ELSE 0.5
    END AS raw_confidence
  FROM unmatched u
  JOIN afl.players p
    ON lower(
         split_part(u.source_name, ' ', array_length(string_to_array(u.source_name, ' '), 1))
       ) = lower(
         split_part(p.player_name, ' ', array_length(string_to_array(p.player_name, ' '), 1))
       )
  WHERE p.active = true
),
best_auto AS (
  -- Best auto-match per unmatched row
  SELECT DISTINCT ON (id)
    id, player_id, player_name, position_group, raw_confidence AS auto_confidence
  FROM surname_matches
  ORDER BY id, raw_confidence DESC
),
manual_map AS (
  SELECT
    m.external_name,
    m.normalized_source_name,
    m.player_id            AS override_player_id,
    m.player_name          AS override_player_name,
    m.confidence           AS override_confidence,
    m.is_verified
  FROM afl.player_name_map m
  WHERE m.is_verified = true
)
SELECT
  u.id,
  u.source_name                                AS external_name,
  u.normalized_source_name,
  u.example_price,
  -- Final resolved player_id: manual override wins, then auto-match
  COALESCE(mm.override_player_id, ba.player_id)          AS player_id,
  COALESCE(mm.override_player_name, ba.player_name)       AS canonical_name,
  COALESCE(ba.position_group, NULL)                       AS position_group,
  -- Confidence: manual override uses stored confidence, else auto
  COALESCE(mm.override_confidence, ba.auto_confidence, 0.0) AS match_confidence,
  CASE
    WHEN mm.is_verified = true                 THEN 'manual_override'
    WHEN ba.auto_confidence >= 1.0             THEN 'exact'
    WHEN ba.auto_confidence >= 0.6             THEN 'fuzzy_surname'
    ELSE                                            'unmatched'
  END                                                     AS match_method,
  (COALESCE(mm.override_player_id, ba.player_id)) IS NOT NULL AS is_matched,
  CASE
    WHEN mm.is_verified = true                 THEN false
    WHEN COALESCE(ba.auto_confidence, 0.0) < 0.9 THEN true
    ELSE false
  END                                                     AS needs_review,
  u.created_at,
  u.updated_at
FROM unmatched u
LEFT JOIN manual_map  mm ON mm.normalized_source_name = u.normalized_source_name
LEFT JOIN best_auto   ba ON ba.id = u.id;

GRANT SELECT ON public.v_fantasy_player_matched TO authenticated;

-- -------------------------------------------------------
-- 3. v_fantasy_unmatched_players
-- All unresolved names + best suggestion for admin review
-- -------------------------------------------------------
DROP VIEW IF EXISTS public.v_fantasy_unmatched_players;

CREATE VIEW public.v_fantasy_unmatched_players
WITH (security_invoker = true)
AS
SELECT
  fpm.id,
  fpm.external_name,
  fpm.normalized_source_name,
  fpm.example_price,
  fpm.player_id            AS suggested_player_id,
  fpm.canonical_name       AS suggested_player_name,
  fpm.position_group       AS suggested_position,
  fpm.match_confidence     AS suggested_confidence,
  fpm.match_method,
  fpm.needs_review,
  fpm.created_at
FROM public.v_fantasy_player_matched fpm
WHERE fpm.is_matched = false
   OR fpm.needs_review = true
ORDER BY fpm.created_at DESC;

GRANT SELECT ON public.v_fantasy_unmatched_players TO authenticated;

-- -------------------------------------------------------
-- 4. v_match_confidence_log — distribution across confidence bands
-- -------------------------------------------------------
DROP VIEW IF EXISTS public.v_match_confidence_log;

CREATE VIEW public.v_match_confidence_log
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE match_confidence = 1.0)                      AS exact_match_count,
  COUNT(*) FILTER (WHERE match_confidence >= 0.7 AND match_confidence < 1.0) AS high_confidence_count,
  COUNT(*) FILTER (WHERE match_confidence >= 0.5 AND match_confidence < 0.7) AS medium_confidence_count,
  COUNT(*) FILTER (WHERE match_confidence > 0   AND match_confidence < 0.5)  AS low_confidence_count,
  COUNT(*) FILTER (WHERE NOT is_matched)                               AS unmatched_count,
  COUNT(*) FILTER (WHERE needs_review)                                 AS needs_review_count,
  COUNT(*)                                                             AS total_in_queue,
  now()                                                                AS computed_at
FROM public.v_fantasy_player_matched;

GRANT SELECT ON public.v_match_confidence_log TO authenticated;

-- -------------------------------------------------------
-- 5. get_matching_stats() — quick stats for admin header
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_matching_stats();

CREATE FUNCTION public.get_matching_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_unmatched      integer;
  v_low_conf       integer;
  v_verified_maps  integer;
  v_total_maps     integer;
BEGIN
  SELECT COUNT(*) INTO v_unmatched
  FROM afl.unmatched_player_names
  WHERE resolved = false;

  SELECT COUNT(*) INTO v_verified_maps
  FROM afl.player_name_map
  WHERE is_verified = true;

  SELECT COUNT(*) INTO v_total_maps
  FROM afl.player_name_map;

  SELECT COUNT(*) INTO v_low_conf
  FROM afl.player_name_map
  WHERE confidence < 0.7 AND is_verified = false;

  RETURN jsonb_build_object(
    'unmatched_count',      v_unmatched,
    'low_confidence_count', v_low_conf,
    'verified_maps',        v_verified_maps,
    'total_maps',           v_total_maps,
    'computed_at',          now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_matching_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_matching_stats() TO authenticated;
