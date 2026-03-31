/*
  # Expose best_value_score in ranking views v3

  Must drop and recreate views since adding a column is not allowed.
*/

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  c.player_id, c.player_name, c.team, c.team_name, c.position, c.position_group,
  c.projection_final, c.projection, c.ceiling, c.floor,
  c.ceiling AS ceiling_estimate, c.floor AS floor_estimate,
  c.consistency, c.consistency AS consistency_score,
  c.form_score, c.form_score AS form_rating,
  c.neeko_rating, c.price, c.value_score, c.best_value_score,
  c.value_tag, c.value_tier,
  c.value_tag AS signal,
  c.ai_summary AS summary, c.recommendation_why AS analysis,
  c.projection_confidence, c.risk_rating,
  c.matchup_rating, c.upside_rating, c.captain_score, c.captain_rating,
  c.ai_recommendation, c.recommendation_color, c.recommendation_short, c.recommendation_why,
  c.ai_summary, c.recommendation_short AS ai_summary_short, c.ai_summary AS ai_summary_long,
  c.ai_updated_at, c.ai_updated_at AS ai_generated_at,
  c.consistency_tier, c.total_count, c.cached_at,
  mr.game_date, mr.venue, mr.opponent_name, mr.is_home,
  mr.season_avg, mr.last3_avg, mr.last5_avg, mr.last10_avg,
  mr.form_momentum, mr.games_played, mr.rest_days, mr.short_turnaround_flag,
  mr.breakout_probability, mr.breakout_flag, mr.volatility_score, mr.stability_score,
  mr.ceiling_hit_rate, mr.floor_bust_rate, mr.stddev_last10
FROM afl.player_rankings_cache c
LEFT JOIN afl.mv_player_rankings mr ON mr.player_id = c.player_id
ORDER BY c.neeko_rating DESC NULLS LAST;

CREATE VIEW public.v_rankings_free AS
SELECT
  c.player_id, c.player_name, c.team, c.position,
  c.projection_final, c.neeko_rating, c.best_value_score,
  c.consistency, c.projection_confidence, c.risk_rating,
  c.captain_score, c.captain_rating,
  mr.games_played,
  c.total_count
FROM afl.player_rankings_cache c
LEFT JOIN afl.mv_player_rankings mr ON mr.player_id = c.player_id
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
