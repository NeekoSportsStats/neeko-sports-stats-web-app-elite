/*
  # Player Volatility Model

  ## Purpose
  Builds a volatility scoring system for AFL fantasy players. Computes boom
  probability, bust probability, and consistency score from actual game-by-game
  fantasy point history. These metrics feed Start/Sit decisions, ranking page
  insights, and AI explanations.

  ## Schema Notes
  The source table afl.player_round_stats_2025 uses:
  - player (text)     — player name, not a numeric ID
  - fantasy_points    — bigint column (not fantasy_score)
  - season            — integer

  Player metadata is resolved via afl.players_canonical which has:
  - canonical_player_id (text)
  - player_name, team, position, season

  The storage table uses TEXT player_name as primary key (alongside season)
  to match the source data, with an optional numeric player_id populated
  from the canonical map where available.

  ## New Objects

  1. afl.player_volatility_model        — persisted storage table
  2. afl.v_player_volatility_features   — live computation view
  3. afl.fn_refresh_player_volatility() — upsert function
  4. afl.v_player_volatility            — frontend-ready view with metadata
  5. public.v_player_volatility_public  — public alias for frontend queries

  ## Volatility Formula
  - boom_probability:    % of games >= 120 fantasy points
  - bust_probability:    % of games <= 60 fantasy points
  - consistency_score:   1 - (std_dev / avg_score), clamped to [0, 100]
    A score of 100 = perfect consistency; 0 = extremely volatile

  ## Safety
  - No existing tables or functions are modified
  - All new objects use CREATE IF NOT EXISTS / CREATE OR REPLACE
  - RLS enabled on the storage table
*/

-- ─── Step 1: Storage table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.player_volatility_model (
  player_name        text        NOT NULL,
  player_id          bigint,
  season             integer     NOT NULL,
  games_sample       integer     NOT NULL DEFAULT 0,
  avg_score          numeric,
  std_dev            numeric,
  boom_threshold     integer     NOT NULL DEFAULT 120,
  bust_threshold     integer     NOT NULL DEFAULT 60,
  boom_probability   numeric,
  bust_probability   numeric,
  consistency_score  numeric,
  team               text,
  position           text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_name, season)
);

CREATE INDEX IF NOT EXISTS idx_pvm_player_id_season
  ON afl.player_volatility_model (player_id, season)
  WHERE player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pvm_season
  ON afl.player_volatility_model (season);

ALTER TABLE afl.player_volatility_model ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volatility model anon select"
  ON afl.player_volatility_model FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "volatility model service insert"
  ON afl.player_volatility_model FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "volatility model service update"
  ON afl.player_volatility_model FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Step 2: Volatility feature view ─────────────────────────────────────────
-- Computes all volatility metrics live from player_round_stats_2025.
-- Covers all seasons present in the table.

CREATE OR REPLACE VIEW afl.v_player_volatility_features AS
SELECT
  s.player                                           AS player_name,
  s.season,

  COUNT(*)::integer                                  AS games_sample,

  ROUND(AVG(s.fantasy_points)::numeric, 2)           AS avg_score,
  ROUND(STDDEV(s.fantasy_points)::numeric, 2)        AS std_dev,

  120                                                AS boom_threshold,
  60                                                 AS bust_threshold,

  ROUND(
    (COUNT(*) FILTER (WHERE s.fantasy_points >= 120)::float
     / NULLIF(COUNT(*), 0))::numeric, 4
  )                                                  AS boom_probability,

  ROUND(
    (COUNT(*) FILTER (WHERE s.fantasy_points <= 60)::float
     / NULLIF(COUNT(*), 0))::numeric, 4
  )                                                  AS bust_probability,

  -- Consistency: 1 - (cv), clamped 0-1, then scaled to 0-100
  ROUND(
    GREATEST(0,
      LEAST(1,
        1 - (COALESCE(STDDEV(s.fantasy_points), 0)
             / NULLIF(AVG(s.fantasy_points), 0))
      )
    )::numeric * 100,
    1
  )                                                  AS consistency_score,

  -- Latest team/position for this player this season
  (
    SELECT s2.team FROM afl.player_round_stats_2025 s2
    WHERE s2.player = s.player AND s2.season = s.season
    ORDER BY s2.round_number DESC LIMIT 1
  )                                                  AS team,

  (
    SELECT s3.position FROM afl.player_round_stats_2025 s3
    WHERE s3.player = s.player AND s3.season = s.season
      AND s3.position IS NOT NULL AND s3.position <> ''
    ORDER BY s3.round_number DESC LIMIT 1
  )                                                  AS position

FROM afl.player_round_stats_2025 s
WHERE s.fantasy_points IS NOT NULL
  AND s.fantasy_points >= 0
GROUP BY s.player, s.season
HAVING COUNT(*) >= 1;

-- ─── Step 3: Refresh function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.fn_refresh_player_volatility()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  INSERT INTO afl.player_volatility_model (
    player_name,
    player_id,
    season,
    games_sample,
    avg_score,
    std_dev,
    boom_threshold,
    bust_threshold,
    boom_probability,
    bust_probability,
    consistency_score,
    team,
    position,
    updated_at
  )
  SELECT
    f.player_name,
    pc.canonical_player_id::bigint,
    f.season,
    f.games_sample,
    f.avg_score,
    f.std_dev,
    f.boom_threshold,
    f.bust_threshold,
    f.boom_probability,
    f.bust_probability,
    f.consistency_score,
    f.team,
    f.position,
    now()
  FROM afl.v_player_volatility_features f
  LEFT JOIN afl.players_canonical pc
    ON pc.player_name = f.player_name
   AND pc.season = f.season
  ON CONFLICT (player_name, season)
  DO UPDATE SET
    player_id         = EXCLUDED.player_id,
    games_sample      = EXCLUDED.games_sample,
    avg_score         = EXCLUDED.avg_score,
    std_dev           = EXCLUDED.std_dev,
    boom_probability  = EXCLUDED.boom_probability,
    bust_probability  = EXCLUDED.bust_probability,
    consistency_score = EXCLUDED.consistency_score,
    team              = EXCLUDED.team,
    position          = EXCLUDED.position,
    updated_at        = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_refresh_player_volatility()
  TO service_role;

-- ─── Step 4: Frontend view ────────────────────────────────────────────────────
-- Joins persisted volatility with current roster metadata.
-- Falls back to stored team/position if roster join misses.

CREATE OR REPLACE VIEW afl.v_player_volatility AS
SELECT
  v.player_name,
  v.player_id,
  COALESCE(pc."Team", v.team)       AS team,
  COALESCE(pc."Position", v.position) AS position,
  v.season,
  v.games_sample,
  ROUND(v.avg_score, 1)             AS avg_score,
  ROUND(v.std_dev, 1)               AS std_dev,
  ROUND(v.boom_probability * 100, 1) AS boom_probability,
  ROUND(v.bust_probability * 100, 1) AS bust_probability,
  ROUND(v.consistency_score, 1)     AS consistency_score,
  CASE
    WHEN v.consistency_score >= 75 THEN 'Safe'
    WHEN v.consistency_score >= 55 THEN 'Normal'
    WHEN v.consistency_score >= 35 THEN 'Volatile'
    ELSE 'Extreme'
  END                               AS volatility_tag,
  CASE
    WHEN v.boom_probability * 100 >= 35 THEN 'High Boom'
    WHEN v.boom_probability * 100 >= 20 THEN 'Boom Threat'
    ELSE 'Low Boom'
  END                               AS boom_tag,
  CASE
    WHEN v.bust_probability * 100 >= 35 THEN 'High Risk'
    WHEN v.bust_probability * 100 >= 20 THEN 'Moderate Risk'
    ELSE 'Low Risk'
  END                               AS bust_tag,
  v.updated_at
FROM afl.player_volatility_model v
LEFT JOIN afl.player_roster_2026_raw pc
  ON pc."Player" = v.player_name;

-- ─── Public alias for frontend queries ───────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_volatility_public AS
SELECT * FROM afl.v_player_volatility;

GRANT SELECT ON public.v_player_volatility_public TO anon, authenticated;

-- ─── Step 5: Start/Sit context view ──────────────────────────────────────────
-- Exposes volatility fields alongside player projection data.
-- The start/sit edge function can JOIN this to add volatility context.

CREATE OR REPLACE VIEW public.v_start_sit_volatility_context AS
SELECT
  v.player_name,
  v.player_id,
  v.team,
  v.position,
  v.season,
  v.games_sample,
  v.avg_score,
  v.std_dev,
  v.boom_probability,
  v.bust_probability,
  v.consistency_score,
  v.volatility_tag,
  v.boom_tag,
  v.bust_tag
FROM afl.v_player_volatility v
WHERE v.season = (SELECT MAX(season) FROM afl.player_volatility_model);

GRANT SELECT ON public.v_start_sit_volatility_context TO anon, authenticated;
