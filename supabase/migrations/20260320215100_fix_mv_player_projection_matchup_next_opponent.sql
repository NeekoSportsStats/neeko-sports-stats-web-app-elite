/*
  # Fix mv_player_projection: matchup_rating now uses next opponent, not all-opponent average

  ## Problem
  The `agg_matchup` CTE in `mv_player_projection` was doing:
    SELECT player_id, avg(matchup_rating) FROM feature_matchup GROUP BY player_id
  This averages ALL 18 opponent rows per player (~1.0 mean), which rounds to exactly 1.0
  for every player. The cache CASE maps 1.0 → 'TOUGH' (< 1.005 threshold), so 100% TOUGH.

  ## Fix
  Replace the flat average with a targeted lookup:
    feature_matchup JOIN v_next_games ON next opponent team + player position_group
  This correctly surfaces the actual matchup rating for each player's upcoming game.

  ## Affected materialized view
  - afl.mv_player_projection (DROP + RECREATE required due to view dependency)
*/

-- Step 1: Drop the materialized view (no unique index concern — we recreate it fully)
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;

-- Step 2: Also drop mv_player_rankings which is a passthrough of mv_player_projection
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_rankings CASCADE;

-- Step 3: Recreate mv_player_projection with corrected matchup join
CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH next_opponent AS (
  -- For each player, determine their next opponent team + venue
  SELECT
    cpt.player_id,
    ng.game_id,
    ng.game_date,
    ng.venue,
    ng.home_team_id,
    ng.away_team_id,
    cpt.team_id,
    CASE
      WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
      ELSE ng.home_team_id
    END AS opponent_team_id,
    CASE
      WHEN ng.home_team_id = cpt.team_id THEN true
      ELSE false
    END AS is_home
  FROM afl.v_current_player_team cpt
  JOIN afl.v_next_games ng ON ng.team_id = cpt.team_id
),
next_matchup AS (
  -- Look up the specific matchup rating for each player vs their next opponent
  SELECT
    no.player_id,
    COALESCE(fm.matchup_rating, 1.0)         AS matchup_rating,
    COALESCE(fm.matchup_rating, 1.0)         AS matchup_multiplier,
    COALESCE(fm.opponent_rank_vs_position, 9) AS opponent_rank_vs_position
  FROM next_opponent no
  JOIN afl.players pl ON pl.player_id = no.player_id
  LEFT JOIN afl.feature_matchup fm
    ON  fm.player_id       = no.player_id
    AND fm.opponent_team_id = no.opponent_team_id
    AND fm.position_group   = COALESCE(pl.position_group, 'FWD')
),
agg_venue AS (
  SELECT
    player_id,
    round(avg(venue_multiplier), 4) AS venue_multiplier,
    round(avg(home_advantage), 4)   AS home_advantage
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    rest_days,
    short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group                                    AS position,
  fp.price,
  no.game_date,
  COALESCE(no.venue, '')                              AS venue,
  opp_t.team_name                                     AS opponent_name,
  no.is_home,
  pp.projection_final                                 AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating                                      AS risk,
  COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) AS confidence,
  COALESCE(cc.calibrated_confidence_tier, ppc.confidence_tier, 'MEDIUM')                    AS confidence_tier,
  COALESCE(ppc.confidence_score, pp.projection_confidence)                                   AS base_confidence_score,
  pp.consistency_score                                AS consistency,
  COALESCE(fp.value_score, 0.0)                       AS value_score,
  round(
    pp.projection_final * 0.40
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
    + COALESCE(pp.consistency_score, 50.0) * 0.15
    + COALESCE(fp.value_score, 0.0) * 0.20
    - COALESCE(pp.volatility_score, 50.0) * 0.05
  , 1) AS neeko_rating,
  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,
  -- FIXED: use next-opponent matchup_rating instead of all-opponent average
  nm.matchup_multiplier,
  nm.matchup_rating,
  nm.opponent_rank_vs_position,
  av.venue_multiplier,
  av.home_advantage,
  lr.rest_days,
  lr.short_turnaround_flag,
  pp.position_concession_multiplier,
  pp.volatility_score,
  pp.stability_score,
  COALESCE(pv.ceiling_hit_rate,  0::numeric) AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate,   0::numeric) AS floor_bust_rate,
  COALESCE(pv.stddev_last10,     0::numeric) AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0)    AS breakout_probability,
  COALESCE(bm.breakout_flag, false)         AS breakout_flag,
  pp.generated_at                           AS updated_at
FROM afl.player_projection pp
JOIN afl.players                          p    ON p.player_id   = pp.player_id
JOIN afl.v_current_player_team            cpt  ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form         fpf  ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price               fp   ON fp.player_id  = pp.player_id
LEFT JOIN next_matchup                    nm   ON nm.player_id  = pp.player_id
LEFT JOIN agg_venue                       av   ON av.player_id  = pp.player_id
LEFT JOIN latest_rest                     lr   ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation            pv   ON pv.player_id  = pp.player_id
LEFT JOIN next_opponent                   no   ON no.player_id  = pp.player_id
LEFT JOIN afl.teams                       opp_t ON opp_t.team_id = no.opponent_team_id
LEFT JOIN afl.player_breakout_model       bm   ON bm.player_id  = pp.player_id
LEFT JOIN afl.player_projection_confidence     ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp.player_id
ORDER BY neeko_rating DESC NULLS LAST;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX mv_player_projection_player_id_idx
  ON afl.mv_player_projection (player_id);

-- Step 4: Recreate mv_player_rankings as passthrough (downstream dependency)
CREATE MATERIALIZED VIEW afl.mv_player_rankings AS
SELECT * FROM afl.mv_player_projection;

CREATE UNIQUE INDEX mv_player_rankings_player_id_idx
  ON afl.mv_player_rankings (player_id);
