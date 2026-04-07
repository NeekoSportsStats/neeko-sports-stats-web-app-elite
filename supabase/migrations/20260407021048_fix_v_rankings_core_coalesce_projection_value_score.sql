/*
  # Fix v_rankings_core — enforce non-null projection and value_score

  ## Changes
  - Rebuild afl.v_rankings_core with:
    - WHERE projection_final IS NOT NULL (already present — retained)
    - projection column now uses COALESCE(projection_final, 0) so the output is never null
    - value_score column now uses COALESCE(value_score_canonical, 0) so it is never null

  ## Result
  - No blank projections on any page
  - No null value_score reaching the frontend
*/

CREATE OR REPLACE VIEW afl.v_rankings_core AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  price::numeric                                       AS price,
  COALESCE(projection_final, 0)::numeric               AS projection,
  breakeven_canonical                                  AS breakeven,
  edge_canonical                                       AS edge,
  COALESCE(value_score_canonical, 0)::numeric          AS value_score,
  signal_canonical                                     AS signal,
  category_canonical                                   AS category,
  action_canonical                                     AS action,
  signal_display,
  signal_tag,
  summary_short                                        AS why,
  summary_long                                         AS why_long,
  summary_short,
  summary_long,
  status,
  manual_status,
  is_bye,
  is_available,
  bye_round::numeric                                   AS bye_round,
  bye_next_round,
  games_played::numeric                                AS games_played,
  neeko_rating::numeric                                AS neeko_rating,
  neeko_rating_scaled::numeric                         AS neeko_rating_scaled,
  consistency::numeric                                 AS consistency,
  consistency_tier,
  season_avg::numeric                                  AS season_avg,
  last_3_avg::numeric                                  AS last_3_avg,
  last_5_avg,
  form_score::numeric                                  AS form_score,
  trend_signal,
  trend_score,
  form_delta,
  form_label,
  prev_price::numeric                                  AS prev_price,
  price_change::numeric                                AS price_change,
  price_change_pct::numeric                            AS price_change_pct,
  captain_score::numeric                               AS captain_score,
  captain_rating,
  upside_rating::numeric                               AS upside_rating,
  upside_pct::numeric                                  AS upside_pct,
  risk_rating::numeric                                 AS risk_rating,
  matchup_label,
  matchup_multiplier,
  projection_confidence::numeric                       AS projection_confidence,
  recommendation_color,
  recommendation_strength,
  ceiling_estimate::numeric                            AS ceiling_estimate,
  floor_estimate::numeric                              AS floor_estimate,
  total_count::bigint                                  AS total_count,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  upper(COALESCE(manual_status, status, '')) = ANY (ARRAY['INJURED', 'OUT', 'OMITTED']) AS is_injured
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL;
