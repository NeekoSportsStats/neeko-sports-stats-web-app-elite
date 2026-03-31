/*
  # Recreate afl.mv_player_rankings view

  This view was dropped as a CASCADE dependency when mv_player_projection was
  rebuilt. It is a simple pass-through that populate_rankings_cache_from_source()
  reads from. Restoring it here.
*/

CREATE OR REPLACE VIEW afl.mv_player_rankings AS
SELECT
  player_id,
  player_name,
  team_name,
  team_id,
  "position",
  price,
  game_date,
  venue,
  opponent_name,
  is_home,
  projection,
  floor,
  ceiling,
  risk,
  confidence,
  confidence_tier,
  base_confidence_score,
  consistency,
  value_score,
  neeko_rating,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  form_score,
  form_momentum,
  games_played,
  matchup_multiplier,
  matchup_rating,
  opponent_rank_vs_position,
  venue_multiplier,
  home_advantage,
  rest_days,
  short_turnaround_flag,
  position_concession_multiplier,
  volatility_score,
  stability_score,
  ceiling_hit_rate,
  floor_bust_rate,
  stddev_last10,
  breakout_probability,
  breakout_flag,
  updated_at
FROM afl.mv_player_projection;
