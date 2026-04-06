/*
  # Fix v_rankings_core — Cast total_count to bigint

  ## Problem
  get_rankings_safe() RETURNS TABLE declares total_count as bigint but the
  player_rankings_cache column is integer, causing a type mismatch.

  ## Fix
  Add ::bigint cast for total_count in the view.
*/

DROP VIEW IF EXISTS afl.v_rankings_core;

CREATE VIEW afl.v_rankings_core AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  position,
  position_group,
  price::numeric                              AS price,

  projection_final::numeric                   AS projection,
  breakeven_canonical::numeric                AS breakeven,
  edge_canonical::numeric                     AS edge,
  value_score_canonical::numeric              AS value_score,

  signal_canonical                            AS signal,
  category_canonical                          AS category,
  action_canonical                            AS action,
  signal_display,

  summary_short                               AS why,
  summary_long                                AS why_long,

  status,
  manual_status,
  is_bye,
  is_available,
  bye_round::numeric                          AS bye_round,
  bye_next_round,
  games_played::numeric                       AS games_played,

  neeko_rating::numeric                       AS neeko_rating,
  neeko_rating_scaled::numeric                AS neeko_rating_scaled,
  consistency::numeric                        AS consistency,
  consistency_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  form_score::numeric                         AS form_score,
  trend_signal,
  trend_score,
  form_delta,
  form_label,

  prev_price::numeric                         AS prev_price,
  price_change::numeric                       AS price_change,
  price_change_pct,

  captain_score::numeric                      AS captain_score,
  captain_rating,
  upside_rating,
  upside_pct::numeric                         AS upside_pct,
  risk_rating::numeric                        AS risk_rating,
  matchup_label,
  matchup_multiplier,
  projection_confidence::numeric              AS projection_confidence,

  recommendation_color,
  recommendation_strength,

  ceiling_estimate::numeric                   AS ceiling_estimate,
  floor_estimate::numeric                     AS floor_estimate,

  total_count::bigint                         AS total_count,

  cached_at,
  ai_updated_at,
  ai_validation_passed

FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL;

COMMENT ON VIEW afl.v_rankings_core IS
'Canonical view over player_rankings_cache. All double precision fields cast to numeric, total_count cast to bigint for RPC type compatibility. Includes signal_display for 5-tier UX labels.';
