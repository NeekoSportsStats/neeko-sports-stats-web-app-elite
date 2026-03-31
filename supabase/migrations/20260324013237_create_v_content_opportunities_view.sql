/*
  # Create afl.v_content_opportunities view

  ## Summary
  Surfaces the top AFL Fantasy content opportunities from player_rankings_cache,
  categorised into: VALUE, BREAKOUT, TRAP, CAPTAIN, ELITE.

  Uses data-driven thresholds derived from current percentile distributions.
  Top 10 per category, ordered by signal strength.

  ## Security
  - SECURITY DEFINER with explicit GRANT so PostgREST can serve it to authenticated users.
  - No new data is created — reads only from afl.player_rankings_cache.
*/

DROP VIEW IF EXISTS afl.v_content_opportunities CASCADE;

CREATE OR REPLACE VIEW afl.v_content_opportunities
WITH (security_invoker = false)
AS
WITH available AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
    position_group,
    projection_final,
    ceiling,
    floor,
    price,
    value_score,
    best_value_score,
    form_score,
    consistency,
    captain_score,
    captain_rating,
    risk_rating,
    upside_pct,
    neeko_rating_scaled,
    ai_recommendation,
    recommendation_color,
    summary_short,
    summary_long,
    signal,
    market_watch_category,
    price_change,
    price_change_pct
  FROM afl.player_rankings_cache
  WHERE is_available = true
    AND (is_bye IS NULL OR is_bye = false)
    AND (manual_status IS NULL OR manual_status NOT IN ('injured','omitted','suspended','inactive'))
    AND projection_final IS NOT NULL
    AND player_name IS NOT NULL
),
percentiles AS (
  SELECT
    percentile_cont(0.90) WITHIN GROUP (ORDER BY value_score)    AS p90_value,
    percentile_cont(0.85) WITHIN GROUP (ORDER BY form_score)     AS p85_form,
    percentile_cont(0.85) WITHIN GROUP (ORDER BY upside_pct)     AS p85_upside,
    percentile_cont(0.70) WITHIN GROUP (ORDER BY risk_rating)    AS p70_risk,
    percentile_cont(0.30) WITHIN GROUP (ORDER BY value_score)    AS p30_value,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY consistency)    AS p20_consistency
  FROM available
),
value_picks AS (
  SELECT a.*, 'value'::text AS category,
    'Value ' || round(a.value_score::numeric,1)::text || ' · proj ' || round(a.projection_final::numeric)::text || 'pts'
      AS signal_reason,
    ROW_NUMBER() OVER (ORDER BY a.value_score DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE a.value_score >= p.p90_value
),
breakout_picks AS (
  SELECT a.*, 'breakout'::text AS category,
    'Form ' || round(a.form_score::numeric)::text || ' · upside ' || round(a.upside_pct::numeric)::text || '%'
      AS signal_reason,
    ROW_NUMBER() OVER (ORDER BY (COALESCE(a.form_score,0) + COALESCE(a.upside_pct,0)) DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE a.form_score >= p.p85_form
    AND a.upside_pct >= 15
),
trap_picks AS (
  SELECT a.*, 'trap'::text AS category,
    'Risk ' || round(a.risk_rating::numeric)::text || ' · value ' || round(a.value_score::numeric,1)::text || ' · proj ' || round(a.projection_final::numeric)::text || 'pts'
      AS signal_reason,
    ROW_NUMBER() OVER (ORDER BY a.risk_rating DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE a.risk_rating >= p.p70_risk
    AND a.value_score <= p.p30_value
),
captain_picks AS (
  SELECT a.*, 'captain'::text AS category,
    'Cap score ' || round(a.captain_score::numeric)::text || ' · proj ' || round(a.projection_final::numeric)::text || 'pts · form ' || round(a.form_score::numeric)::text
      AS signal_reason,
    ROW_NUMBER() OVER (ORDER BY a.captain_score DESC NULLS LAST) AS cat_rank
  FROM available a
  WHERE a.captain_score IS NOT NULL AND a.captain_score >= 60
),
elite_picks AS (
  SELECT a.*, 'elite'::text AS category,
    'Neeko ' || round(a.neeko_rating_scaled::numeric,1)::text || ' · proj ' || round(a.projection_final::numeric)::text || 'pts · ceiling ' || round(a.ceiling::numeric)::text
      AS signal_reason,
    ROW_NUMBER() OVER (ORDER BY a.neeko_rating_scaled DESC NULLS LAST) AS cat_rank
  FROM available a
  WHERE a.neeko_rating_scaled IS NOT NULL AND a.neeko_rating_scaled >= 85
),
all_opps AS (
  SELECT player_id, player_name, team, position, position_group,
         projection_final, ceiling, floor, price, value_score, best_value_score,
         form_score, consistency, captain_score, captain_rating,
         risk_rating, upside_pct, neeko_rating_scaled,
         ai_recommendation, recommendation_color,
         summary_short, summary_long,
         signal, market_watch_category,
         price_change, price_change_pct,
         category, signal_reason, cat_rank
  FROM value_picks   WHERE cat_rank <= 10
  UNION ALL
  SELECT player_id, player_name, team, position, position_group,
         projection_final, ceiling, floor, price, value_score, best_value_score,
         form_score, consistency, captain_score, captain_rating,
         risk_rating, upside_pct, neeko_rating_scaled,
         ai_recommendation, recommendation_color,
         summary_short, summary_long,
         signal, market_watch_category,
         price_change, price_change_pct,
         category, signal_reason, cat_rank
  FROM breakout_picks WHERE cat_rank <= 10
  UNION ALL
  SELECT player_id, player_name, team, position, position_group,
         projection_final, ceiling, floor, price, value_score, best_value_score,
         form_score, consistency, captain_score, captain_rating,
         risk_rating, upside_pct, neeko_rating_scaled,
         ai_recommendation, recommendation_color,
         summary_short, summary_long,
         signal, market_watch_category,
         price_change, price_change_pct,
         category, signal_reason, cat_rank
  FROM trap_picks     WHERE cat_rank <= 10
  UNION ALL
  SELECT player_id, player_name, team, position, position_group,
         projection_final, ceiling, floor, price, value_score, best_value_score,
         form_score, consistency, captain_score, captain_rating,
         risk_rating, upside_pct, neeko_rating_scaled,
         ai_recommendation, recommendation_color,
         summary_short, summary_long,
         signal, market_watch_category,
         price_change, price_change_pct,
         category, signal_reason, cat_rank
  FROM captain_picks  WHERE cat_rank <= 10
  UNION ALL
  SELECT player_id, player_name, team, position, position_group,
         projection_final, ceiling, floor, price, value_score, best_value_score,
         form_score, consistency, captain_score, captain_rating,
         risk_rating, upside_pct, neeko_rating_scaled,
         ai_recommendation, recommendation_color,
         summary_short, summary_long,
         signal, market_watch_category,
         price_change, price_change_pct,
         category, signal_reason, cat_rank
  FROM elite_picks    WHERE cat_rank <= 10
)
SELECT * FROM all_opps
ORDER BY category, cat_rank;

GRANT SELECT ON afl.v_content_opportunities TO authenticated, anon;
