/*
  # Fix get_rankings_safe() type mismatch — double precision → numeric

  ## Problem
  The RPC RETURNS TABLE declares numeric for several columns, but the
  underlying afl.player_rankings_cache stores them as double precision:
    - ceiling_estimate   (col 8 — the first failure)
    - floor_estimate
    - consistency
    - form_score
    - neeko_rating
    - neeko_rating_scaled (alias of neeko_rating)
    - upside_rating
    - upside_pct
    - risk_rating
    - captain_score
    - projection_confidence

  Also integer columns declared as numeric in the RPC:
    - price, prev_price, price_change, games_played, bye_round, total_count

  ## Fix
  Rebuild afl.v_rankings_unified with explicit ::numeric casts on every
  double precision column so the RPC RETURNS TABLE contract is satisfied
  without touching the table schema.
*/

-- ─── Rebuild afl.v_rankings_unified with explicit type casts ─────────────────
DROP VIEW IF EXISTS afl.v_rankings_unified;

CREATE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,
  -- integer → numeric casts
  price::numeric,
  prev_price::numeric,
  price_change::numeric,
  price_change_pct,
  projection_final,
  projection_final                              AS projection,
  -- double precision → numeric casts
  projection_confidence::numeric,
  confidence_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate::numeric,
  floor_estimate::numeric,
  breakeven_canonical,
  breakeven_canonical                           AS breakeven,
  edge_canonical,
  edge_canonical                                AS edge,
  edge_canonical                                AS value_score,
  signal_canonical,
  signal_canonical                              AS signal,
  signal_canonical                              AS signal_tag,
  signal_display,
  category_canonical,
  category_canonical                            AS category,
  action_canonical,
  action_canonical                              AS action,
  action_display,
  trend_score,
  trend_signal,
  form_score::numeric,
  form_delta,
  form_label,
  neeko_rating::numeric,
  neeko_rating::numeric                         AS neeko_rating_scaled,
  consistency::numeric,
  consistency_tier,
  upside_rating::numeric,
  upside_pct::numeric,
  risk_rating::numeric,
  captain_score::numeric,
  captain_rating,
  matchup_label,
  matchup_multiplier,
  summary_short,
  summary_short                                 AS why,
  summary_long,
  summary_long                                  AS why_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round::numeric,
  bye_next_round,
  games_played::numeric,
  UPPER(COALESCE(manual_status, status, '')) = ANY(ARRAY['INJURED','OUT','OMITTED']) AS is_injured,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  total_count::bigint,
  -- New elite signal fields (already numeric in table)
  decision_score,
  confidence_score_100,
  confidence_percentile,
  value_band,
  action_reason_1,
  action_reason_2,
  confidence_reason_1,
  confidence_reason_2
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL
  AND projection_final > 30;

GRANT SELECT ON afl.v_rankings_unified TO authenticated, anon;
