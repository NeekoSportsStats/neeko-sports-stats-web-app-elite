
/*
  # Player Lab Intelligence — Signal Master + Edge Scores

  ## Summary
  Creates two core views for the Player Lab terminal:

  1. **public.v_player_signals_master**
     - Aggregates 25 signal types per player from afl.player_rankings_cache
     - Groups: Value, Form, Consistency, Role, Matchup, Meta
     - Outputs: signal_tags (array), signal_count, signal_strength_score

  2. **public.v_player_edge_scores**
     - Calculates 5 edge components: value_edge, matchup_edge, role_edge, form_edge, risk_penalty
     - edge_total = sum of all components

  3. **public.v_player_price_full**
     - Full price table with current + previous price, delta, value metrics

  4. **public.v_player_accuracy_detail**
     - Per-player per-round accuracy rows for the accuracy terminal

  ## Security
  All views grant SELECT to authenticated and anon (admin-only pages handle auth at UI level).
*/

-- ─── 1. SIGNAL MASTER VIEW ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_signals_master
WITH (security_invoker = false)
AS
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
    recommendation_short,
    games_played
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
),
signals AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
    price,
    projection,
    neeko_rating,
    -- VALUE SIGNALS
    CASE WHEN value_score > 3.5 AND price < 400000 THEN 'underpriced_elite' END       AS sig_underpriced_elite,
    CASE WHEN value_score > 2.5 AND price BETWEEN 250000 AND 500000 THEN 'underpriced_mid' END AS sig_underpriced_mid,
    CASE WHEN value_score < 1.2 AND price > 600000 THEN 'overpriced_trap' END         AS sig_overpriced_trap,
    CASE WHEN best_value_score > 75 THEN 'value_spike' END                             AS sig_value_spike,
    CASE WHEN value_score < 1.0 AND best_value_score < 30 THEN 'value_drop' END       AS sig_value_drop,
    -- FORM SIGNALS
    CASE WHEN form_score > 80 THEN 'form_hot' END                                      AS sig_form_hot,
    CASE WHEN form_score < 30 THEN 'form_cold' END                                     AS sig_form_cold,
    CASE WHEN ceiling > projection * 1.35 THEN 'ceiling_spike' END                    AS sig_ceiling_spike,
    CASE WHEN floor < projection * 0.6 THEN 'floor_drop' END                          AS sig_floor_drop,
    CASE WHEN (ceiling - floor) > 70 THEN 'volatility_high' END                       AS sig_volatility_high,
    -- CONSISTENCY SIGNALS
    CASE WHEN consistency > 0.75 THEN 'ultra_consistent' END                          AS sig_ultra_consistent,
    CASE WHEN consistency < 0.35 THEN 'inconsistent' END                              AS sig_inconsistent,
    CASE WHEN form_score > 65 AND consistency > 0.55 THEN 'trend_up' END              AS sig_trend_up,
    CASE WHEN form_score < 40 AND consistency < 0.45 THEN 'trend_down' END            AS sig_trend_down,
    -- ROLE SIGNALS
    CASE WHEN upside_rating > 75 AND form_score > 60 THEN 'role_improved' END         AS sig_role_improved,
    CASE WHEN upside_rating < 30 AND form_score < 40 THEN 'role_declined' END         AS sig_role_declined,
    CASE WHEN position IN ('MID','FWD') AND upside_pct > 0.45 THEN 'midfield_boost' END AS sig_midfield_boost,
    CASE WHEN upside_pct < 0.2 AND consistency < 0.45 THEN 'role_uncertain' END       AS sig_role_uncertain,
    -- MATCHUP SIGNALS
    CASE WHEN matchup_multiplier > 1.08 THEN 'easy_matchup' END                       AS sig_easy_matchup,
    CASE WHEN matchup_multiplier < 0.93 THEN 'hard_matchup' END                       AS sig_hard_matchup,
    CASE WHEN matchup_multiplier < 0.88 AND risk_rating > 65 THEN 'tag_risk' END      AS sig_tag_risk,
    CASE WHEN matchup_multiplier > 1.1 AND form_score > 60 THEN 'venue_boost' END     AS sig_venue_boost,
    -- META SIGNALS
    CASE WHEN captain_score > 75 THEN 'captain_viable' END                            AS sig_captain_viable,
    CASE WHEN upside_pct > 0.5 AND price < 500000 THEN 'pod_play' END                AS sig_pod_play,
    CASE WHEN neeko_rating > 70 AND price > 600000 THEN 'high_ownership_risk' END     AS sig_high_ownership_risk,
    CASE WHEN form_score > 70 AND consistency < 0.5 AND ceiling > projection * 1.25 THEN 'breakout_candidate' END AS sig_breakout_candidate,
    CASE WHEN neeko_rating > 65 AND form_score < 45 THEN 'regression_candidate' END   AS sig_regression_candidate
  FROM base
),
tagged AS (
  SELECT
    player_id, player_name, team, position, price, projection, neeko_rating,
    ARRAY_REMOVE(ARRAY[
      sig_underpriced_elite, sig_underpriced_mid, sig_overpriced_trap, sig_value_spike, sig_value_drop,
      sig_form_hot, sig_form_cold, sig_ceiling_spike, sig_floor_drop, sig_volatility_high,
      sig_ultra_consistent, sig_inconsistent, sig_trend_up, sig_trend_down,
      sig_role_improved, sig_role_declined, sig_midfield_boost, sig_role_uncertain,
      sig_easy_matchup, sig_hard_matchup, sig_tag_risk, sig_venue_boost,
      sig_captain_viable, sig_pod_play, sig_high_ownership_risk, sig_breakout_candidate, sig_regression_candidate
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
  signal_tags,
  COALESCE(array_length(signal_tags, 1), 0)    AS signal_count,
  LEAST(100, COALESCE(array_length(signal_tags, 1), 0) * 12)::numeric AS signal_strength_score
FROM tagged
ORDER BY signal_count DESC;

GRANT SELECT ON public.v_player_signals_master TO authenticated;
GRANT SELECT ON public.v_player_signals_master TO anon;


-- ─── 2. EDGE SCORES VIEW ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_edge_scores
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  -- Edge components
  LEAST(100, GREATEST(0, c.value_score * 20))::numeric                 AS value_edge,
  LEAST(100, GREATEST(0, (c.matchup_multiplier::numeric - 1.0) * 500))::numeric AS matchup_edge,
  LEAST(100, GREATEST(0, c.upside_rating))::numeric                    AS role_edge,
  LEAST(100, GREATEST(0, c.form_score))::numeric                       AS form_edge,
  LEAST(0,   GREATEST(-50, -(c.risk_rating * 0.5)))::numeric           AS risk_penalty,
  -- Edge total
  LEAST(100, GREATEST(0,
    (LEAST(100, GREATEST(0, c.value_score * 20)) * 0.25)
    + (LEAST(100, GREATEST(0, (c.matchup_multiplier::numeric - 1.0) * 500)) * 0.2)
    + (LEAST(100, GREATEST(0, c.upside_rating)) * 0.2)
    + (LEAST(100, GREATEST(0, c.form_score)) * 0.2)
    + (LEAST(0,   GREATEST(-50, -(c.risk_rating * 0.5))) * 0.15)
  ))::numeric AS edge_total,
  c.edge_score,
  c.edge_tier,
  c.neeko_rating,
  c.confidence_label
FROM afl.player_rankings_cache c
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_player_edge_scores TO authenticated;
GRANT SELECT ON public.v_player_edge_scores TO anon;


-- ─── 3. FULL PRICE TABLE VIEW ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_price_full
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price                                                     AS current_price,
  ph.price                                                    AS last_price,
  (c.price - COALESCE(ph.price, c.price))                    AS price_change,
  CASE
    WHEN COALESCE(ph.price, c.price) = 0 THEN 0
    ELSE ROUND(((c.price - COALESCE(ph.price, c.price))::numeric / NULLIF(ph.price, 0)) * 100, 1)
  END                                                         AS price_change_pct,
  c.value_score,
  c.best_value_score,
  c.projection_final,
  c.projection,
  c.neeko_rating,
  c.form_score,
  c.consistency,
  c.matchup_label,
  c.recommendation_short,
  c.recommendation_color,
  c.confidence_label,
  c.market_watch_category,
  c.cached_at
FROM afl.player_rankings_cache c
LEFT JOIN LATERAL (
  SELECT price FROM afl.player_price_history
  WHERE player_id = c.player_id
  ORDER BY created_at DESC
  LIMIT 1
) ph ON true
WHERE c.player_id IS NOT NULL
ORDER BY ABS(c.price - COALESCE(ph.price, c.price)) DESC;

GRANT SELECT ON public.v_player_price_full TO authenticated;
GRANT SELECT ON public.v_player_price_full TO anon;


-- ─── 4. PLAYER ACCURACY DETAIL VIEW ──────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_accuracy_detail
WITH (security_invoker = false)
AS
SELECT
  pa.player_id,
  pa.player_name,
  pa.team,
  pa.game_id,
  pa.round_label,
  pa.projection,
  pa.actual_score,
  pa.error,
  pa.absolute_error,
  CASE
    WHEN pa.absolute_error <= 10 THEN 'within_10'
    WHEN pa.absolute_error <= 20 THEN 'within_20'
    WHEN pa.absolute_error <= 30 THEN 'within_30'
    ELSE 'outside_30'
  END AS accuracy_band,
  CASE
    WHEN pa.error > 0 THEN 'over_projected'
    WHEN pa.error < 0 THEN 'under_projected'
    ELSE 'exact'
  END AS projection_bias
FROM public.v_projection_accuracy_best pa

UNION ALL

SELECT
  pa.player_id,
  pa.player_name,
  pa.team,
  pa.game_id,
  pa.round_label,
  pa.projection,
  pa.actual_score,
  pa.error,
  pa.absolute_error,
  CASE
    WHEN pa.absolute_error <= 10 THEN 'within_10'
    WHEN pa.absolute_error <= 20 THEN 'within_20'
    WHEN pa.absolute_error <= 30 THEN 'within_30'
    ELSE 'outside_30'
  END AS accuracy_band,
  CASE
    WHEN pa.error > 0 THEN 'over_projected'
    WHEN pa.error < 0 THEN 'under_projected'
    ELSE 'exact'
  END AS projection_bias
FROM public.v_projection_accuracy_worst pa;

GRANT SELECT ON public.v_player_accuracy_detail TO authenticated;
GRANT SELECT ON public.v_player_accuracy_detail TO anon;


-- ─── 5. TEAM ACCURACY VIEW ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_team_accuracy_summary
WITH (security_invoker = false)
AS
WITH all_accuracy AS (
  SELECT player_id, player_name, team, projection, actual_score, error, absolute_error
  FROM public.v_projection_accuracy_best
  UNION ALL
  SELECT player_id, player_name, team, projection, actual_score, error, absolute_error
  FROM public.v_projection_accuracy_worst
)
SELECT
  team,
  COUNT(*)                                                      AS prediction_count,
  ROUND(AVG(absolute_error), 1)                                 AS avg_error,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY absolute_error)::numeric, 1) AS median_error,
  ROUND(AVG(error), 1)                                          AS prediction_bias,
  ROUND(100.0 * SUM(CASE WHEN error > 5 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS over_projected_pct,
  ROUND(100.0 * SUM(CASE WHEN error < -5 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS under_projected_pct,
  ROUND(100.0 * SUM(CASE WHEN absolute_error <= 10 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS within_10_pct,
  ROUND(100.0 * SUM(CASE WHEN absolute_error <= 20 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS within_20_pct
FROM all_accuracy
WHERE team IS NOT NULL
GROUP BY team
ORDER BY avg_error ASC;

GRANT SELECT ON public.v_team_accuracy_summary TO authenticated;
GRANT SELECT ON public.v_team_accuracy_summary TO anon;
