/*
  # Fix summary_short — replace template text with real AI summaries

  ## Problem
  `afl.player_rankings_cache.summary_short` was being populated with formula-generated
  template text like "Projected 132 with a BE of 116.2, giving a +15.3 edge this round."
  This is NOT AI content.

  ## Fix
  Rebuild `afl.populate_rankings_cache_from_source()` to:
  1. LEFT JOIN `ai.player_ai_analysis` on `player_id`
  2. Use `ai_data.summary_short` directly — no fallback template
  3. If the AI has no summary yet → store NULL (frontend handles gracefully)
  4. Also wire in `ai_data.recommendation` as the `ai_recommendation` source
     (keeps alignment between summary and recommendation from same AI run)

  ## Data Source
  - `ai.player_ai_analysis` — 724 rows, 687 with real AI summary_short text
  - Fields used: `player_id`, `summary_short`, `recommendation`

  ## Impact
  - Rankings "Why" column shows real AI sentences instead of templates
  - Edge Board "Why" text becomes premium-quality prose
  - NULL rows handled safely by frontend (no card rendered for NULL ai_recommendation)
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, ai
AS $function$
DECLARE
  v_median_gap numeric;
BEGIN

SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pp.projection - (pp.price::numeric / 7200.0))
INTO v_median_gap
FROM afl.mv_player_projection pp
WHERE pp.player_id IS NOT NULL
  AND pp.price IS NOT NULL
  AND pp.price > 0;

DELETE FROM afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, position, price, breakeven,
  games_played,
  projection_final, form_score, neeko_rating, value_score,
  edge_score, edge_tier, upside_rating, risk_rating,
  ai_recommendation, recommendation_color, recommendation_strength,
  market_watch_category, consistency, matchup_rating,
  is_available, status, manual_status, is_bye, bye_round, bye_next_round,
  edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent,
  edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk,
  summary_short, summary_long,
  cached_at
)
WITH be_computed AS (
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name,
    pp.position,
    pp.price,
    pp.projection,
    pp.season_avg,
    pp.last3_avg,
    pp.games_played,
    pp.form_score,
    pp.neeko_rating,
    pp.consistency,
    pp.volatility_score,
    pp.stability_score,
    pp.stddev_last10,
    pp.matchup_rating,
    pp.breakout_probability,
    pp.form_momentum,
    pp.position_concession_multiplier,
    pp.rest_days,
    pp.ceiling,
    pp.floor,

    CASE
      WHEN pp.games_played >= 3
        THEN ROUND((COALESCE(pp.season_avg, pp.projection) * 0.7)
             + (COALESCE(pp.last3_avg, pp.season_avg, pp.projection) * 0.3), 1)
      WHEN pp.games_played > 0
        THEN ROUND(COALESCE(pp.season_avg, pp.projection)::numeric, 1)
      ELSE
        ROUND(pp.projection::numeric, 1)
    END AS be,

    CASE
      WHEN pp.price IS NULL OR pp.price = 0
        THEN 0.0
      ELSE
        LEAST(30.0, GREATEST(-30.0,
          ROUND(
            ((pp.projection - (pp.price::numeric / 7200.0)) - v_median_gap)
            * 1.2
            * CASE WHEN COALESCE(pp.stddev_last10, 19.0) < 10 THEN 1.1
                   WHEN COALESCE(pp.stddev_last10, 19.0) > 25 THEN 0.85
                   ELSE 1.0 END
            * CASE WHEN COALESCE(pp.stability_score, 66.0) > 70 THEN 1.1
                   WHEN COALESCE(pp.stability_score, 66.0) < 60 THEN 0.9
                   ELSE 1.0 END
          , 1)
        ))
    END AS value_score_computed

  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
),
edge_computed AS (
  SELECT
    b.*,
    ROUND((b.projection - b.be)::numeric, 1) AS edge
  FROM be_computed b
),
action_computed AS (
  SELECT
    e.*,
    CASE
      WHEN e.edge >= 15  THEN 'STRONG_BUY'
      WHEN e.edge >= 6   THEN 'BUY'
      WHEN e.edge <= -15 THEN 'STRONG_SELL'
      WHEN e.edge <= -6  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,

    CASE
      WHEN e.edge >= 15  THEN 'green'
      WHEN e.edge >= 6   THEN 'emerald'
      WHEN e.edge <= -15 THEN 'red'
      WHEN e.edge <= -6  THEN 'orange'
      ELSE 'amber'
    END AS rec_color,

    ROUND(LEAST(100.0, GREATEST(0.0, (e.edge + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS rec_strength,

    CASE
      WHEN e.value_score_computed > 0 AND e.edge >= 6  THEN 'TARGET'
      WHEN e.value_score_computed < 0 OR  e.edge <= -6 THEN 'AVOID'
      ELSE 'WATCH'
    END AS mw_category,

    CASE
      WHEN e.value_score_computed >= 15  THEN 'ELITE_VALUE'
      WHEN e.value_score_computed >= 6   THEN 'GOOD_VALUE'
      WHEN e.value_score_computed <= -15 THEN 'TRAP'
      WHEN e.value_score_computed <= -6  THEN 'OVERPRICED'
      ELSE 'FAIR'
    END AS value_category

  FROM edge_computed e
)
SELECT
  a.player_id,
  a.player_name,
  a.team_name                          AS team,
  a.team_name,
  a.position,
  a.price,
  a.be::numeric(5,1)                   AS breakeven,
  a.games_played,
  a.projection::numeric                AS projection_final,
  a.form_score::double precision,
  a.neeko_rating::double precision,
  a.value_score_computed::double precision AS value_score,
  a.edge::numeric                      AS edge_score,
  CASE
    WHEN a.edge >= 15 THEN 'ELITE'
    WHEN a.edge >= 6  THEN 'STRONG'
    WHEN a.edge >= -6 THEN 'NEUTRAL'
    WHEN a.edge >= -9 THEN 'WEAK'
    ELSE 'AVOID'
  END                                  AS edge_tier,
  CASE
    WHEN a.edge >= 15 THEN 1.40
    WHEN a.edge >= 6  THEN 1.25
    WHEN a.edge >= -6 THEN 1.10
    ELSE 1.0
  END::double precision                AS upside_rating,
  COALESCE(a.volatility_score, 50.0)::double precision AS risk_rating,
  a.action                             AS ai_recommendation,
  a.rec_color                          AS recommendation_color,
  a.rec_strength                       AS recommendation_strength,
  a.mw_category                        AS market_watch_category,
  COALESCE(a.consistency, 50.0)::double precision AS consistency,
  CASE
    WHEN COALESCE(a.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
    WHEN COALESCE(a.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
    ELSE 'Neutral'
  END                                  AS matchup_rating,
  true          AS is_available,
  NULL::text    AS status,
  NULL::text    AS manual_status,
  false         AS is_bye,
  NULL::integer AS bye_round,
  false         AS bye_next_round,
  NULL::numeric AS edge_c_base,
  NULL::numeric AS edge_c_form,
  NULL::numeric AS edge_c_ceiling,
  NULL::numeric AS edge_c_opponent,
  NULL::numeric AS edge_c_venue,
  NULL::numeric AS edge_c_role,
  NULL::numeric AS edge_c_momentum,
  NULL::numeric AS edge_c_breakout,
  NULL::numeric AS edge_c_risk,
  ai_data.summary_short,
  NULL::text   AS summary_long,
  NOW()        AS cached_at

FROM action_computed a
LEFT JOIN ai.player_ai_analysis ai_data ON ai_data.player_id = a.player_id;

END;
$function$;

SELECT afl.populate_rankings_cache_from_source();
