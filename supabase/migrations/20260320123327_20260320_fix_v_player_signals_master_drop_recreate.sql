/*
  # Drop and recreate v_player_signals_master with status column

  PostgreSQL won't allow renaming view columns via CREATE OR REPLACE.
  Must drop and recreate to rename player_status → status.
*/

DROP VIEW IF EXISTS public.v_player_signals_master CASCADE;

CREATE VIEW public.v_player_signals_master AS
WITH base AS (
  SELECT
    player_id,
    player_name,
    team,
    "position",
    projection_final,
    projection,
    ceiling,
    floor,
    price,
    value_score,
    form_score,
    consistency,
    risk_rating,
    matchup_multiplier,
    matchup_label,
    captain_score,
    upside_pct,
    upside_rating,
    edge_score,
    neeko_rating,
    best_value_score,
    confidence_label,
    recommendation_short,
    games_played,
    COALESCE(is_available, true) AS is_available,
    status
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
),
signals AS (
  SELECT
    player_id, player_name, team, "position",
    price, projection, neeko_rating, is_available, status,
    CASE WHEN is_available AND value_score > 3.5 AND price < 400000 THEN 'underpriced_elite' END AS sig_underpriced_elite,
    CASE WHEN is_available AND value_score > 2.5 AND price >= 250000 AND price <= 500000 THEN 'underpriced_mid' END AS sig_underpriced_mid,
    CASE WHEN value_score < 1.2 AND price > 600000 THEN 'overpriced_trap' END AS sig_overpriced_trap,
    CASE WHEN is_available AND best_value_score > 75 THEN 'value_spike' END AS sig_value_spike,
    CASE WHEN value_score < 1.0 AND best_value_score < 30 THEN 'value_drop' END AS sig_value_drop,
    CASE WHEN is_available AND form_score > 80 THEN 'form_hot' END AS sig_form_hot,
    CASE WHEN form_score < 30 THEN 'form_cold' END AS sig_form_cold,
    CASE WHEN is_available AND ceiling > projection * 1.35 THEN 'ceiling_spike' END AS sig_ceiling_spike,
    CASE WHEN floor < projection * 0.6 THEN 'floor_drop' END AS sig_floor_drop,
    CASE WHEN (ceiling - floor) > 70 THEN 'volatility_high' END AS sig_volatility_high,
    CASE WHEN is_available AND consistency > 0.75 THEN 'ultra_consistent' END AS sig_ultra_consistent,
    CASE WHEN consistency < 0.35 THEN 'inconsistent' END AS sig_inconsistent,
    CASE WHEN is_available AND form_score > 65 AND consistency > 0.55 THEN 'trend_up' END AS sig_trend_up,
    CASE WHEN form_score < 40 AND consistency < 0.45 THEN 'trend_down' END AS sig_trend_down,
    CASE WHEN is_available AND upside_rating > 75 AND form_score > 60 THEN 'role_improved' END AS sig_role_improved,
    CASE WHEN upside_rating < 30 AND form_score < 40 THEN 'role_declined' END AS sig_role_declined,
    CASE WHEN is_available AND "position" = ANY(ARRAY['MID','FWD']) AND upside_pct > 0.45 THEN 'midfield_boost' END AS sig_midfield_boost,
    CASE WHEN upside_pct < 0.2 AND consistency < 0.45 THEN 'role_uncertain' END AS sig_role_uncertain,
    CASE WHEN is_available AND matchup_multiplier > 1.08 THEN 'easy_matchup' END AS sig_easy_matchup,
    CASE WHEN matchup_multiplier < 0.93 THEN 'hard_matchup' END AS sig_hard_matchup,
    CASE WHEN matchup_multiplier < 0.88 AND risk_rating > 65 THEN 'tag_risk' END AS sig_tag_risk,
    CASE WHEN is_available AND matchup_multiplier > 1.1 AND form_score > 60 THEN 'venue_boost' END AS sig_venue_boost,
    CASE WHEN is_available AND captain_score > 75 THEN 'captain_viable' END AS sig_captain_viable,
    CASE WHEN is_available AND upside_pct > 0.5 AND price < 500000 THEN 'pod_play' END AS sig_pod_play,
    CASE WHEN neeko_rating > 70 AND price > 600000 THEN 'high_ownership_risk' END AS sig_high_ownership_risk,
    CASE WHEN is_available AND form_score > 70 AND consistency < 0.5 AND ceiling > projection * 1.25 THEN 'breakout_candidate' END AS sig_breakout_candidate,
    CASE WHEN neeko_rating > 65 AND form_score < 45 THEN 'regression_candidate' END AS sig_regression_candidate,
    CASE WHEN NOT is_available THEN 'player_out' END AS sig_player_out
  FROM base
),
tagged AS (
  SELECT
    player_id, player_name, team, "position",
    price, projection, neeko_rating, is_available, status,
    array_remove(ARRAY[
      sig_underpriced_elite, sig_underpriced_mid, sig_overpriced_trap,
      sig_value_spike, sig_value_drop, sig_form_hot, sig_form_cold,
      sig_ceiling_spike, sig_floor_drop, sig_volatility_high,
      sig_ultra_consistent, sig_inconsistent, sig_trend_up, sig_trend_down,
      sig_role_improved, sig_role_declined, sig_midfield_boost, sig_role_uncertain,
      sig_easy_matchup, sig_hard_matchup, sig_tag_risk, sig_venue_boost,
      sig_captain_viable, sig_pod_play, sig_high_ownership_risk,
      sig_breakout_candidate, sig_regression_candidate, sig_player_out
    ], NULL) AS signal_tags
  FROM signals
)
SELECT
  player_id,
  player_name,
  team,
  "position",
  price,
  projection,
  neeko_rating,
  is_available,
  status,
  signal_tags,
  COALESCE(array_length(signal_tags, 1), 0)                           AS signal_count,
  LEAST(100, COALESCE(array_length(signal_tags, 1), 0) * 12)::numeric AS signal_strength_score
FROM tagged
ORDER BY COALESCE(array_length(signal_tags, 1), 0) DESC;

GRANT SELECT ON public.v_player_signals_master TO anon, authenticated;
