/*
  # Expand v_player_signals_master — 30+ Signals Across All Categories

  ## Summary
  Rebuilds v_player_signals_master with 30+ signals covering all 6 categories.
  Each signal is boolean (NULL = absent, string = active) with clear, explainable logic.

  ## New Signals Added

  ### VALUE (8 signals)
  - underpriced_elite: value_score > 3.5 AND price < 400k
  - underpriced_mid: value_score > 2.5 AND price 250k–500k
  - overpriced_trap: value_score < 1.2 AND price > 600k
  - value_spike: best_value_score > 75
  - value_drop: value_score < 1.0 AND best_value_score < 30
  - premium_value: neeko_rating > 60 AND price < 500k (elite quality, affordable price)
  - cash_cow: price < 200k AND projection > 50 (cheap player punching above weight)
  - price_cliff: price > 700k AND projection < 70 (expensive but low projection)

  ### FORM (7 signals)
  - form_hot: form_score > 80
  - form_cold: form_score < 30
  - ceiling_spike: ceiling > projection * 1.35
  - floor_drop: floor < projection * 0.6
  - volatility_high: (ceiling - floor) > 70
  - elite_ceiling: ceiling > 120 (absolute ceiling threshold)
  - floor_lock: floor > projection * 0.8 AND consistency > 0.65 (low bust risk)

  ### CONSISTENCY (6 signals)
  - ultra_consistent: consistency > 0.75
  - inconsistent: consistency < 0.35
  - trend_up: form_score > 65 AND consistency > 0.55
  - trend_down: form_score < 40 AND consistency < 0.45
  - high_floor_consistent: floor > 60 AND consistency > 0.65 (safe DPP/DEF picks)
  - boom_bust: ceiling > 100 AND floor < 40 (all-or-nothing player)

  ### ROLE (6 signals)
  - role_improved: upside_rating > 75 AND form_score > 60
  - role_declined: upside_rating < 30 AND form_score < 40
  - midfield_boost: position = MID/FWD AND upside_pct > 0.45
  - role_uncertain: upside_pct < 0.2 AND consistency < 0.45
  - premium_role: captain_score > 70 AND upside_rating > 60 (clear premium usage)
  - fringe_risk: upside_rating < 25 AND risk_rating > 60 (role + injury risk)

  ### MATCHUP (5 signals)
  - easy_matchup: matchup_multiplier > 1.08
  - hard_matchup: matchup_multiplier < 0.93
  - tag_risk: matchup_multiplier < 0.88 AND risk_rating > 65
  - venue_boost: matchup_multiplier > 1.1 AND form_score > 60
  - neutral_matchup: matchup_multiplier BETWEEN 0.95 AND 1.05 (no strong edge either way)

  ### META (6 signals)
  - captain_viable: captain_score > 75
  - pod_play: upside_pct > 0.5 AND price < 500k
  - high_ownership_risk: neeko_rating > 70 AND price > 600k
  - breakout_candidate: form_score > 70 AND consistency < 0.5 AND ceiling > projection*1.25
  - regression_candidate: neeko_rating > 65 AND form_score < 45
  - player_out: NOT is_available

  ## Also adds
  - signal_count: total active signals
  - signal_tags: array of active signal names
  - signal_strength_score: capped at 100
  - top_signals: first 3 signal tags (for AI input use)
*/

DROP VIEW IF EXISTS public.v_player_signals_master CASCADE;

CREATE VIEW public.v_player_signals_master AS
WITH base AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
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
    projection_confidence,
    recommendation_short,
    games_played,
    COALESCE(is_available, true) AS is_available,
    status
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
),
signals AS (
  SELECT
    player_id, player_name, team, position,
    price, projection, neeko_rating, is_available, status,
    projection_confidence, confidence_label,

    -- ── VALUE signals ──────────────────────────────────────────────────────
    CASE WHEN is_available AND value_score > 3.5 AND price < 400000
         THEN 'underpriced_elite' END AS sig_underpriced_elite,
    CASE WHEN is_available AND value_score > 2.5 AND price >= 250000 AND price <= 500000
         THEN 'underpriced_mid' END AS sig_underpriced_mid,
    CASE WHEN value_score < 1.2 AND price > 600000
         THEN 'overpriced_trap' END AS sig_overpriced_trap,
    CASE WHEN is_available AND best_value_score > 75
         THEN 'value_spike' END AS sig_value_spike,
    CASE WHEN value_score < 1.0 AND best_value_score < 30
         THEN 'value_drop' END AS sig_value_drop,
    CASE WHEN is_available AND neeko_rating > 60 AND price < 500000
         THEN 'premium_value' END AS sig_premium_value,
    CASE WHEN is_available AND price < 200000 AND projection > 50
         THEN 'cash_cow' END AS sig_cash_cow,
    CASE WHEN price > 700000 AND projection < 70
         THEN 'price_cliff' END AS sig_price_cliff,

    -- ── FORM signals ───────────────────────────────────────────────────────
    CASE WHEN is_available AND form_score > 80
         THEN 'form_hot' END AS sig_form_hot,
    CASE WHEN form_score < 30
         THEN 'form_cold' END AS sig_form_cold,
    CASE WHEN is_available AND ceiling > projection * 1.35
         THEN 'ceiling_spike' END AS sig_ceiling_spike,
    CASE WHEN floor < projection * 0.6
         THEN 'floor_drop' END AS sig_floor_drop,
    CASE WHEN (ceiling - floor) > 70
         THEN 'volatility_high' END AS sig_volatility_high,
    CASE WHEN is_available AND ceiling > 120
         THEN 'elite_ceiling' END AS sig_elite_ceiling,
    CASE WHEN is_available AND floor > projection * 0.8 AND consistency > 0.65
         THEN 'floor_lock' END AS sig_floor_lock,

    -- ── CONSISTENCY signals ─────────────────────────────────────────────
    CASE WHEN is_available AND consistency > 0.75
         THEN 'ultra_consistent' END AS sig_ultra_consistent,
    CASE WHEN consistency < 0.35
         THEN 'inconsistent' END AS sig_inconsistent,
    CASE WHEN is_available AND form_score > 65 AND consistency > 0.55
         THEN 'trend_up' END AS sig_trend_up,
    CASE WHEN form_score < 40 AND consistency < 0.45
         THEN 'trend_down' END AS sig_trend_down,
    CASE WHEN is_available AND floor > 60 AND consistency > 0.65
         THEN 'high_floor_consistent' END AS sig_high_floor_consistent,
    CASE WHEN ceiling > 100 AND floor < 40
         THEN 'boom_bust' END AS sig_boom_bust,

    -- ── ROLE signals ───────────────────────────────────────────────────────
    CASE WHEN is_available AND upside_rating > 75 AND form_score > 60
         THEN 'role_improved' END AS sig_role_improved,
    CASE WHEN upside_rating < 30 AND form_score < 40
         THEN 'role_declined' END AS sig_role_declined,
    CASE WHEN is_available AND position = ANY(ARRAY['MID','FWD']) AND upside_pct > 0.45
         THEN 'midfield_boost' END AS sig_midfield_boost,
    CASE WHEN upside_pct < 0.2 AND consistency < 0.45
         THEN 'role_uncertain' END AS sig_role_uncertain,
    CASE WHEN is_available AND captain_score > 70 AND upside_rating > 60
         THEN 'premium_role' END AS sig_premium_role,
    CASE WHEN upside_rating < 25 AND risk_rating > 60
         THEN 'fringe_risk' END AS sig_fringe_risk,

    -- ── MATCHUP signals ────────────────────────────────────────────────────
    CASE WHEN is_available AND matchup_multiplier > 1.08
         THEN 'easy_matchup' END AS sig_easy_matchup,
    CASE WHEN matchup_multiplier < 0.93
         THEN 'hard_matchup' END AS sig_hard_matchup,
    CASE WHEN matchup_multiplier < 0.88 AND risk_rating > 65
         THEN 'tag_risk' END AS sig_tag_risk,
    CASE WHEN is_available AND matchup_multiplier > 1.1 AND form_score > 60
         THEN 'venue_boost' END AS sig_venue_boost,
    CASE WHEN matchup_multiplier BETWEEN 0.95 AND 1.05
         THEN 'neutral_matchup' END AS sig_neutral_matchup,

    -- ── META signals ───────────────────────────────────────────────────────
    CASE WHEN is_available AND captain_score > 75
         THEN 'captain_viable' END AS sig_captain_viable,
    CASE WHEN is_available AND upside_pct > 0.5 AND price < 500000
         THEN 'pod_play' END AS sig_pod_play,
    CASE WHEN neeko_rating > 70 AND price > 600000
         THEN 'high_ownership_risk' END AS sig_high_ownership_risk,
    CASE WHEN is_available AND form_score > 70 AND consistency < 0.5
              AND ceiling > projection * 1.25
         THEN 'breakout_candidate' END AS sig_breakout_candidate,
    CASE WHEN neeko_rating > 65 AND form_score < 45
         THEN 'regression_candidate' END AS sig_regression_candidate,
    CASE WHEN NOT is_available
         THEN 'player_out' END AS sig_player_out

  FROM base
),
tagged AS (
  SELECT
    player_id, player_name, team, position,
    price, projection, neeko_rating, is_available, status,
    projection_confidence, confidence_label,
    array_remove(ARRAY[
      -- Value
      sig_underpriced_elite, sig_underpriced_mid, sig_overpriced_trap,
      sig_value_spike, sig_value_drop, sig_premium_value, sig_cash_cow, sig_price_cliff,
      -- Form
      sig_form_hot, sig_form_cold, sig_ceiling_spike, sig_floor_drop,
      sig_volatility_high, sig_elite_ceiling, sig_floor_lock,
      -- Consistency
      sig_ultra_consistent, sig_inconsistent, sig_trend_up, sig_trend_down,
      sig_high_floor_consistent, sig_boom_bust,
      -- Role
      sig_role_improved, sig_role_declined, sig_midfield_boost, sig_role_uncertain,
      sig_premium_role, sig_fringe_risk,
      -- Matchup
      sig_easy_matchup, sig_hard_matchup, sig_tag_risk, sig_venue_boost, sig_neutral_matchup,
      -- Meta
      sig_captain_viable, sig_pod_play, sig_high_ownership_risk,
      sig_breakout_candidate, sig_regression_candidate, sig_player_out
    ], NULL) AS signal_tags
  FROM signals
)
SELECT
  player_id,
  player_name,
  team,
  position,
  price,
  projection,
  neeko_rating,
  is_available,
  status,
  projection_confidence,
  confidence_label,
  signal_tags,
  COALESCE(array_length(signal_tags, 1), 0)                                   AS signal_count,
  LEAST(100, COALESCE(array_length(signal_tags, 1), 0) * 9)::numeric          AS signal_strength_score,
  signal_tags[1:3]                                                              AS top_signals
FROM tagged
ORDER BY COALESCE(array_length(signal_tags, 1), 0) DESC;

GRANT SELECT ON public.v_player_signals_master TO anon, authenticated, service_role;
