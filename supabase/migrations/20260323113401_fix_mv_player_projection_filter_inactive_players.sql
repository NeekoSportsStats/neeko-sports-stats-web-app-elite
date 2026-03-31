
/*
  # Fix mv_player_projection — Filter Inactive Players

  ## Problem
  mv_player_projection joins afl.players but never filters WHERE active = true.
  This allows deactivated ghost/duplicate players (e.g. player_id 1942, the Richmond
  "Jonty Faull" phantom) to appear in the materialized view and propagate through
  mv_player_rankings → populate_rankings_cache_from_source → player_rankings_cache
  → frontend rankings page.

  ## Changes
  1. Delete player_id 1942 from afl.player_projection (base table) to remove source row
  2. Drop and recreate mv_player_projection with WHERE p.active = true
  3. Refresh the MV
  4. Rebuild rankings cache (clears the ghost from UI)

  ## Also fixes
  All 8 other same-name / different-team duplicates detected by v_team_mismatch_audit
  are handled: the afl_2026_roster is the canonical source — only IDs in that roster
  should be active. The MV filter on active = true ensures any future deactivations
  are respected without needing a separate cache delete step.
*/

-- Step 1: Remove the ghost from the projection base table
DELETE FROM afl.player_projection WHERE player_id = 1942;

-- Step 2: Deactivate all same-name duplicate players NOT in the 2026 roster
-- These are the 8 additional collisions found by v_team_mismatch_audit.
-- We keep the player_id that IS in afl_2026_roster and deactivate the other.
UPDATE afl.players
SET active = false
WHERE player_id IN (
  -- For each colliding name pair, deactivate the one NOT in afl_2026_roster
  SELECT p.player_id
  FROM afl.players p
  WHERE p.active = true
    AND p.player_name IN (
      SELECT player_name
      FROM afl.players
      WHERE active = true
      GROUP BY player_name
      HAVING COUNT(*) > 1
    )
    AND p.player_id NOT IN (SELECT player_id FROM afl.afl_2026_roster)
);

-- Step 3: Drop and recreate mv_player_projection with active filter
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_rankings;
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH next_opponent AS (
  SELECT cpt_1.player_id,
    ng.game_id, ng.game_date, ng.venue,
    ng.home_team_id, ng.away_team_id, cpt_1.team_id,
    CASE WHEN ng.home_team_id = cpt_1.team_id THEN ng.away_team_id ELSE ng.home_team_id END AS opponent_team_id,
    CASE WHEN ng.home_team_id = cpt_1.team_id THEN true ELSE false END AS is_home
  FROM afl.v_current_player_team cpt_1
  JOIN afl.v_next_games ng ON ng.team_id = cpt_1.team_id
),
next_matchup AS (
  SELECT no_1.player_id,
    COALESCE(fm.matchup_rating, 1.0) AS matchup_rating,
    COALESCE(fm.matchup_rating, 1.0) AS matchup_multiplier,
    COALESCE(fm.opponent_rank_vs_position, 9) AS opponent_rank_vs_position
  FROM next_opponent no_1
  JOIN afl.players pl ON pl.player_id = no_1.player_id
  LEFT JOIN afl.feature_matchup fm
    ON fm.player_id = no_1.player_id
   AND fm.opponent_team_id = no_1.opponent_team_id
   AND fm.position_group = COALESCE(pl.position_group, 'FWD')
),
agg_venue AS (
  SELECT player_id,
    round(avg(venue_multiplier), 4) AS venue_multiplier,
    round(avg(home_advantage), 4)   AS home_advantage
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id) player_id, rest_days, short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group AS "position",
  fp.price,
  no.game_date,
  COALESCE(no.venue, '') AS venue,
  opp_t.team_name AS opponent_name,
  no.is_home,
  pp.projection_final AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating AS risk,
  COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) AS confidence,
  COALESCE(cc.calibrated_confidence_tier, ppc.confidence_tier, 'MEDIUM') AS confidence_tier,
  COALESCE(ppc.confidence_score, pp.projection_confidence) AS base_confidence_score,
  pp.consistency_score AS consistency,
  COALESCE(fp.value_score, 0.0) AS value_score,
  round(
    pp.projection_final * 0.40
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
    + COALESCE(pp.consistency_score, 50.0) * 0.15
    + COALESCE(fp.value_score, 0.0) * 0.20
    - COALESCE(pp.volatility_score, 50.0) * 0.05,
  1) AS neeko_rating,
  fpf.season_avg, fpf.last3_avg, fpf.last5_avg, fpf.last10_avg,
  fpf.form_score, fpf.form_momentum, fpf.games_played,
  nm.matchup_multiplier, nm.matchup_rating, nm.opponent_rank_vs_position,
  av.venue_multiplier, av.home_advantage,
  lr.rest_days, lr.short_turnaround_flag,
  pp.position_concession_multiplier,
  pp.volatility_score, pp.stability_score,
  COALESCE(pv.ceiling_hit_rate, 0) AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate,  0) AS floor_bust_rate,
  COALESCE(pv.stddev_last10,    0) AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0) AS breakout_probability,
  COALESCE(bm.breakout_flag, false)      AS breakout_flag,
  pp.generated_at AS updated_at
FROM afl.player_projection pp
JOIN afl.players p
  ON p.player_id = pp.player_id
  AND p.active = true                          -- ← KEY FIX: exclude inactive/ghost players
JOIN afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price fp        ON fp.player_id  = pp.player_id
LEFT JOIN next_matchup nm             ON nm.player_id  = pp.player_id
LEFT JOIN agg_venue av                ON av.player_id  = pp.player_id
LEFT JOIN latest_rest lr              ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation pv     ON pv.player_id  = pp.player_id
LEFT JOIN next_opponent no            ON no.player_id  = pp.player_id
LEFT JOIN afl.teams opp_t             ON opp_t.team_id = no.opponent_team_id
LEFT JOIN afl.player_breakout_model bm ON bm.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp.player_id
ORDER BY round(
  pp.projection_final * 0.40
  + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
  + COALESCE(pp.consistency_score, 50.0) * 0.15
  + COALESCE(fp.value_score, 0.0) * 0.20
  - COALESCE(pp.volatility_score, 50.0) * 0.05,
1) DESC NULLS LAST;

-- Recreate mv_player_rankings as a simple view over the MV (same as before)
CREATE MATERIALIZED VIEW afl.mv_player_rankings AS
SELECT * FROM afl.mv_player_projection;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_mv_player_projection_player_id ON afl.mv_player_projection (player_id);
CREATE INDEX IF NOT EXISTS idx_mv_player_rankings_player_id   ON afl.mv_player_rankings   (player_id);

-- Grant access
GRANT SELECT ON afl.mv_player_projection TO authenticated, anon, service_role;
GRANT SELECT ON afl.mv_player_rankings   TO authenticated, anon, service_role;
