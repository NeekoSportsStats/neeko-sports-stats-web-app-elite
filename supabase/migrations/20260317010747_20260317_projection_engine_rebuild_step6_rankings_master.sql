
/*
  # Projection Engine Rebuild — Step 6: Rebuild afl.v_rankings_master

  Drops and recreates v_rankings_master reading from afl.mv_player_projection.
  Left-joins ai.player_ai_analysis on player_id for AI columns.

  All 41 frontend-required columns are preserved with identical names.
*/

DROP VIEW IF EXISTS afl.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW afl.v_rankings_master AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.team_id,
  mv.position,
  mv.price,
  mv.game_date,
  mv.venue,
  mv.opponent_name,
  mv.is_home,
  mv.projection,
  mv.floor,
  mv.ceiling,
  mv.risk,
  mv.confidence,
  mv.consistency,
  mv.value_score,
  mv.neeko_rating,
  round(mv.projection * 2.0 * (COALESCE(mv.consistency, 50.0) / 100.0), 1) AS captain_score,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 80.0  - 0.3)), 3) AS prob_80,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 100.0 - 0.3)), 3) AS prob_100,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 120.0 - 0.3)), 3) AS prob_120,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_score,
  mv.form_momentum,
  mv.games_played,
  mv.matchup_rating,
  mv.opponent_rank_vs_position,
  mv.venue_multiplier,
  mv.home_advantage,
  mv.rest_days,
  mv.short_turnaround_flag,
  ai.recommendation  AS ai_recommendation,
  ai.summary_short   AS ai_summary_short,
  ai.summary_long    AS ai_summary_long,
  ai.confidence      AS ai_confidence,
  ai.generated_at    AS ai_generated_at,
  mv.updated_at
FROM afl.mv_player_projection mv
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = mv.player_id
ORDER BY mv.neeko_rating DESC NULLS LAST;
