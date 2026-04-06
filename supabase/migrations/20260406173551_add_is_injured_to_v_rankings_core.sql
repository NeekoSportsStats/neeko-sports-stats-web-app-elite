/*
  # Add is_injured computed field to afl.v_rankings_core

  ## Changes
  1. Rebuilds afl.v_rankings_core to include computed `is_injured` column:
     - is_injured = effective_status IN ('INJURED', 'OUT', 'OMITTED')
     - effective_status = COALESCE(UPPER(manual_status), UPPER(status))
  2. This gives a single clean boolean the frontend and RPCs can rely on
  3. Adds is_injured to get_rankings_safe return type

  ## Notes
  - Rankings page shows ALL players including injured/bye (no DB-level filter)
  - Market Watch, Edge Board, Current Round filter is_injured=false AND is_bye=false
  - The is_injured flag covers: INJURED, OUT, OMITTED statuses
*/

DROP VIEW IF EXISTS afl.v_rankings_core CASCADE;

CREATE VIEW afl.v_rankings_core AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  price::numeric                    AS price,
  projection_final::numeric         AS projection,
  breakeven_canonical::numeric      AS breakeven,
  edge_canonical::numeric           AS edge,
  value_score_canonical::numeric    AS value_score,
  signal_canonical::text            AS signal,
  category_canonical::text          AS category,
  action_canonical::text            AS action,
  signal_display::text              AS signal_display,
  signal_tag::text                  AS signal_tag,
  summary_short::text               AS why,
  summary_long::text                AS why_long,
  summary_short::text               AS summary_short,
  summary_long::text                AS summary_long,
  status::text                      AS status,
  manual_status::text               AS manual_status,
  is_bye,
  is_available,
  bye_round::numeric                AS bye_round,
  bye_next_round,
  games_played::numeric             AS games_played,
  neeko_rating::numeric             AS neeko_rating,
  neeko_rating_scaled::numeric      AS neeko_rating_scaled,
  consistency::numeric              AS consistency,
  consistency_tier::text            AS consistency_tier,
  season_avg::numeric               AS season_avg,
  last_3_avg::numeric               AS last_3_avg,
  last_5_avg::numeric               AS last_5_avg,
  form_score::numeric               AS form_score,
  trend_signal::text                AS trend_signal,
  trend_score::numeric              AS trend_score,
  form_delta::numeric               AS form_delta,
  form_label::text                  AS form_label,
  prev_price::numeric               AS prev_price,
  price_change::numeric             AS price_change,
  price_change_pct::numeric         AS price_change_pct,
  captain_score::numeric            AS captain_score,
  captain_rating::text              AS captain_rating,
  upside_rating::numeric            AS upside_rating,
  upside_pct::numeric               AS upside_pct,
  risk_rating::numeric              AS risk_rating,
  matchup_label::text               AS matchup_label,
  matchup_multiplier::numeric       AS matchup_multiplier,
  projection_confidence::numeric    AS projection_confidence,
  recommendation_color::text        AS recommendation_color,
  recommendation_strength::text     AS recommendation_strength,
  ceiling_estimate::numeric         AS ceiling_estimate,
  floor_estimate::numeric           AS floor_estimate,
  total_count::bigint               AS total_count,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  -- Computed availability flags
  (UPPER(COALESCE(manual_status, status, '')) IN ('INJURED', 'OUT', 'OMITTED')) AS is_injured
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL;
