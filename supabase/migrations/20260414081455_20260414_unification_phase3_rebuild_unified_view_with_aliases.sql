/*
  # Unification Phase 3 — Rebuild v_rankings_unified With Compatibility Aliases

  ## Why
  Existing RPCs reference column names like: breakeven, edge, value_score, signal,
  action, category, why, why_long, projection, neeko_rating_scaled, signal_tag.

  These are aliases that point to canonical columns in the cache. Rather than rewriting
  every RPC in one shot, we add these aliases to v_rankings_unified so the view is a
  complete drop-in replacement for v_rankings_core.

  ## Result
  - All RPCs continue to work reading from v_rankings_unified
  - Canonical column names are ALSO exposed (edge_canonical, signal_canonical, etc.)
  - Downstream can migrate to canonical names incrementally without breaking anything
  - v_rankings_core can eventually be deprecated

  ## Canonical vs Alias mapping:
  - projection         = projection_final
  - breakeven          = breakeven_canonical
  - edge               = edge_canonical
  - value_score        = edge_canonical (same metric)
  - signal             = signal_canonical
  - signal_tag         = signal_canonical
  - category           = category_canonical
  - action             = action_canonical
  - why                = summary_short
  - why_long           = summary_long
  - neeko_rating_scaled= neeko_rating (not actually scaled — correct alias)
*/

DROP VIEW IF EXISTS afl.v_rankings_unified CASCADE;

CREATE OR REPLACE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,

  -- Price
  price,
  prev_price,
  price_change,
  price_change_pct,

  -- Core projection (canonical name + alias)
  projection_final,
  projection_final                                        AS projection,
  projection_confidence,
  confidence_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate,
  floor_estimate,

  -- CANONICAL METRICS
  breakeven_canonical,
  breakeven_canonical                                     AS breakeven,
  edge_canonical,
  edge_canonical                                          AS edge,
  edge_canonical                                          AS value_score,

  -- Signal (canonical + aliases)
  signal_canonical,
  signal_canonical                                        AS signal,
  signal_canonical                                        AS signal_tag,
  signal_display,
  category_canonical,
  category_canonical                                      AS category,
  action_canonical,
  action_canonical                                        AS action,

  -- Form / trend
  trend_score,
  trend_signal,
  form_score,
  form_delta,
  form_label,

  -- Player quality
  neeko_rating,
  neeko_rating                                            AS neeko_rating_scaled,
  consistency,
  consistency_tier,
  upside_rating,
  upside_pct,
  risk_rating,
  captain_score,
  captain_rating,

  -- Matchup
  matchup_label,
  matchup_multiplier,

  -- AI content (canonical + aliases)
  summary_short,
  summary_short                                           AS why,
  summary_long,
  summary_long                                            AS why_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,

  -- Status
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  games_played,
  (
    UPPER(COALESCE(manual_status, status, '')) = ANY(ARRAY['INJURED','OUT','OMITTED'])
  ) AS is_injured,

  -- Timestamps
  cached_at,
  ai_updated_at,
  ai_validation_passed,

  -- Count helper
  total_count
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL
  AND projection_final > 30;

GRANT SELECT ON afl.v_rankings_unified TO anon, authenticated, service_role;
