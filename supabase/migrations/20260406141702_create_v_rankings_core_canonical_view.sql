/*
  # Create afl.v_rankings_core — Canonical Single Source of Truth

  ## Purpose
  Establishes ONE canonical view that all RPCs and frontend code must use.
  Eliminates _canonical suffixes, _final suffixes, and summary_ prefixes
  from the public API surface.

  ## New View: afl.v_rankings_core
  Column names EXACTLY match frontend contract:
      projection, breakeven, edge, value_score
      signal, category, action, why, why_long

  ## Notes
  - All numeric fields explicitly cast to numeric
  - No legacy columns exposed in the core contract columns
  - Additional columns (neeko_rating, consistency, etc.) included for richer RPCs
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
  price::numeric                        AS price,

  projection_final::numeric             AS projection,
  breakeven_canonical::numeric          AS breakeven,
  edge_canonical::numeric               AS edge,
  value_score_canonical::numeric        AS value_score,

  signal_canonical                      AS signal,
  category_canonical                    AS category,
  action_canonical                      AS action,

  summary_short                         AS why,
  summary_long                          AS why_long,

  status,
  manual_status,
  is_bye,
  is_available,
  bye_round,
  bye_next_round,
  games_played,

  neeko_rating,
  neeko_rating_scaled,
  consistency,
  consistency_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  form_score,
  trend_signal,
  trend_score,
  form_delta,
  form_label,

  prev_price,
  price_change,
  price_change_pct,

  captain_score,
  captain_rating,
  upside_rating,
  upside_pct,
  risk_rating,
  matchup_label,
  matchup_multiplier,
  projection_confidence,

  recommendation_color,
  recommendation_strength,

  ceiling_estimate,
  floor_estimate,

  cached_at,
  ai_updated_at,
  ai_validation_passed

FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL;

COMMENT ON VIEW afl.v_rankings_core IS
'Canonical view over player_rankings_cache. All _canonical/_final/summary_ fields renamed to short canonical names. ONLY view all RPCs should read from.';
