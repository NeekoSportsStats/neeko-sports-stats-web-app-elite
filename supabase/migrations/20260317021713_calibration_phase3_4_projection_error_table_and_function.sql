
/*
  # Calibration Phase 3-4: Projection Error Table + Population Function

  ## Summary
  Measures prediction accuracy by comparing frozen pre-game projections
  against actual fantasy scores after games complete.

  ## New Table: afl.player_projection_error
  One row per player-game with projected vs actual result, error metrics,
  and all engine feature values for bucket-level analysis.

  ## New Function: public.refresh_player_projection_error()
  Joins player_projection_history to completed player_games results,
  uses the most recent pre-game snapshot, computes all error metrics
  and bucket assignments, then upserts into the error table.

  ## Error Metrics
  - error_raw  = actual - projected  (positive = under-projected)
  - error_abs  = ABS(error_raw)
  - error_pct  = error_abs / projected (when projected > 0)

  ## Bucket Definitions
  - bucket_projection_range: under_40 / 40_59 / 60_79 / 80_99 / 100_plus
  - bucket_confidence_range: low / medium / high
  - bucket_volatility_range: low / medium / high

  ## Security
  - RLS enabled; service_role full access; authenticated read-only
*/

CREATE TABLE IF NOT EXISTS afl.player_projection_error (
  id                             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id                      integer     NOT NULL,
  game_id                        integer     NOT NULL,
  season                         integer,
  round                          text,
  game_date                      timestamptz,
  position_group                 text,
  team_id                        integer,
  opponent_team_id               integer,
  projected_score                numeric     NOT NULL,
  actual_score                   numeric     NOT NULL,
  error_raw                      numeric     NOT NULL,
  error_abs                      numeric     NOT NULL,
  error_pct                      numeric,
  projection_confidence          numeric,
  confidence_tier                text,
  risk_rating                    text,
  form_rating                    numeric,
  matchup_rating                 numeric,
  venue_rating                   numeric,
  rest_rating                    numeric,
  position_concession_multiplier numeric,
  pace_multiplier                numeric,
  volatility_score               numeric,
  stability_score                numeric,
  breakout_probability           numeric,
  role_change_score              numeric,
  bucket_projection_range        text,
  bucket_confidence_range        text,
  bucket_volatility_range        text,
  created_at                     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.player_projection_error ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_projection_error"
  ON afl.player_projection_error FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_projection_error"
  ON afl.player_projection_error FOR SELECT TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proj_error_player_game
  ON afl.player_projection_error (player_id, game_id);

CREATE INDEX IF NOT EXISTS idx_proj_error_season
  ON afl.player_projection_error (season);

CREATE INDEX IF NOT EXISTS idx_proj_error_position
  ON afl.player_projection_error (position_group);

CREATE INDEX IF NOT EXISTS idx_proj_error_bucket_proj
  ON afl.player_projection_error (bucket_projection_range);

-- -----------------------------------------------------------------------
-- Error population function
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_player_projection_error()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO afl.player_projection_error (
    player_id,
    game_id,
    season,
    round,
    game_date,
    position_group,
    team_id,
    opponent_team_id,
    projected_score,
    actual_score,
    error_raw,
    error_abs,
    error_pct,
    projection_confidence,
    confidence_tier,
    risk_rating,
    form_rating,
    matchup_rating,
    venue_rating,
    rest_rating,
    position_concession_multiplier,
    pace_multiplier,
    volatility_score,
    stability_score,
    breakout_probability,
    role_change_score,
    bucket_projection_range,
    bucket_confidence_range,
    bucket_volatility_range
  )
  WITH latest_snapshots AS (
    -- Most recent pre-game snapshot per player+game
    SELECT DISTINCT ON (h.player_id, h.game_id)
      h.player_id,
      h.game_id,
      h.season,
      h.round,
      h.game_date,
      h.team_id,
      h.opponent_team_id,
      h.position_group,
      h.projection_final,
      h.projection_confidence,
      h.confidence_tier,
      h.risk_rating,
      h.form_rating,
      h.matchup_rating,
      h.venue_rating,
      h.rest_rating,
      h.position_concession_multiplier,
      h.pace_multiplier,
      h.volatility_score,
      h.stability_score,
      h.breakout_probability,
      h.role_change_score
    FROM afl.player_projection_history h
    -- Only snapshots taken BEFORE the game started
    WHERE h.snapshot_date < COALESCE(h.game_date, now())
    ORDER BY h.player_id, h.game_id, h.snapshot_date DESC
  ),
  completed_games AS (
    -- Actual scores from completed games only
    SELECT
      pg.player_id,
      pg.game_id,
      pg.fantasy_score::numeric  AS actual_score,
      g.game_date,
      g.season,
      g.round
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score IS NOT NULL
      AND pg.fantasy_score >= 0
      -- Game must be in the past
      AND g.game_date < now()
  )
  SELECT
    ls.player_id,
    ls.game_id,
    ls.season,
    ls.round,
    cg.game_date,
    ls.position_group,
    ls.team_id,
    ls.opponent_team_id,
    ls.projection_final                                              AS projected_score,
    cg.actual_score,
    ROUND(cg.actual_score - ls.projection_final, 2)                 AS error_raw,
    ROUND(ABS(cg.actual_score - ls.projection_final), 2)            AS error_abs,
    CASE
      WHEN ls.projection_final > 0
      THEN ROUND(ABS(cg.actual_score - ls.projection_final) / ls.projection_final, 4)
      ELSE NULL
    END                                                              AS error_pct,
    ls.projection_confidence,
    ls.confidence_tier,
    ls.risk_rating,
    ls.form_rating,
    ls.matchup_rating,
    ls.venue_rating,
    ls.rest_rating,
    ls.position_concession_multiplier,
    ls.pace_multiplier,
    ls.volatility_score,
    ls.stability_score,
    ls.breakout_probability,
    ls.role_change_score,
    -- Projection range bucket
    CASE
      WHEN ls.projection_final < 40  THEN 'under_40'
      WHEN ls.projection_final < 60  THEN '40_59'
      WHEN ls.projection_final < 80  THEN '60_79'
      WHEN ls.projection_final < 100 THEN '80_99'
      ELSE '100_plus'
    END                                                              AS bucket_projection_range,
    -- Confidence bucket
    CASE
      WHEN COALESCE(ls.projection_confidence, 50) >= 70 THEN 'high'
      WHEN COALESCE(ls.projection_confidence, 50) >= 50 THEN 'medium'
      ELSE 'low'
    END                                                              AS bucket_confidence_range,
    -- Volatility bucket
    CASE
      WHEN COALESCE(ls.volatility_score, 50) >= 60 THEN 'high'
      WHEN COALESCE(ls.volatility_score, 50) >= 35 THEN 'medium'
      ELSE 'low'
    END                                                              AS bucket_volatility_range
  FROM latest_snapshots ls
  JOIN completed_games cg
    ON cg.player_id = ls.player_id
   AND cg.game_id   = ls.game_id
  WHERE ls.projection_final IS NOT NULL
  ON CONFLICT (player_id, game_id) DO UPDATE SET
    actual_score                   = EXCLUDED.actual_score,
    error_raw                      = EXCLUDED.error_raw,
    error_abs                      = EXCLUDED.error_abs,
    error_pct                      = EXCLUDED.error_pct,
    projected_score                = EXCLUDED.projected_score,
    projection_confidence          = EXCLUDED.projection_confidence,
    confidence_tier                = EXCLUDED.confidence_tier,
    risk_rating                    = EXCLUDED.risk_rating,
    form_rating                    = EXCLUDED.form_rating,
    matchup_rating                 = EXCLUDED.matchup_rating,
    venue_rating                   = EXCLUDED.venue_rating,
    rest_rating                    = EXCLUDED.rest_rating,
    position_concession_multiplier = EXCLUDED.position_concession_multiplier,
    pace_multiplier                = EXCLUDED.pace_multiplier,
    volatility_score               = EXCLUDED.volatility_score,
    stability_score                = EXCLUDED.stability_score,
    breakout_probability           = EXCLUDED.breakout_probability,
    role_change_score              = EXCLUDED.role_change_score,
    bucket_projection_range        = EXCLUDED.bucket_projection_range,
    bucket_confidence_range        = EXCLUDED.bucket_confidence_range,
    bucket_volatility_range        = EXCLUDED.bucket_volatility_range;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Projection errors refreshed: ' || v_count || ' rows';
END;
$$;
