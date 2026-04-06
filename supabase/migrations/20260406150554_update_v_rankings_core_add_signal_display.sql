/*
  # Update afl.v_rankings_core — Add signal_display Column

  ## Change
  Adds signal_display to the canonical view so all RPCs and frontend
  can access the human-readable signal label (e.g. '🔥 Target', 'Watch', '🚫 Hard Avoid').

  ## New Column
  - signal_display: human-readable label derived from the 5-tier signal system
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
  signal_display,

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
'Canonical view over player_rankings_cache. All _canonical/_final/summary_ fields renamed to short canonical names. Includes signal_display for 5-tier UX labels. ONLY view all RPCs should read from.';
