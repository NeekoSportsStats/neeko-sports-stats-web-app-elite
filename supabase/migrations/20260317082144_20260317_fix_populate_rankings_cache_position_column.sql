/*
  # Fix populate_rankings_cache_from_source - column name correction

  ## Summary
  After rebuilding mv_player_projection, the position column is named "position"
  not "position_group". This migration fixes the populate function to use the
  correct column name and also adds neeko_rating_scaled to v_rankings_master
  and fixes v_rankings_free (Phase 9).

  ## Changes
  1. Rebuilds populate_rankings_cache_from_source() with correct column references
  2. Rebuilds public.v_rankings_master to include neeko_rating_scaled
  3. Rebuilds public.v_rankings_free (Phase 9: expose price/value but lock UI after row 5)
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_neeko numeric;
  v_val_p10   numeric;
  v_val_p30   numeric;
  v_val_p60   numeric;
BEGIN
  SELECT GREATEST(MAX(neeko_rating), 1.0) INTO v_max_neeko
  FROM afl.mv_player_rankings;

  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score > 0 AND COALESCE(fp.price, 0) > 0;

  v_val_p10 := COALESCE(v_val_p10, 4.5);
  v_val_p30 := COALESCE(v_val_p30, 3.3);
  v_val_p60 := COALESCE(v_val_p60, 1.7);

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, neeko_rating_raw, neeko_rating_scaled,
    best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, captain_score, captain_rating,
    games_played,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr."position",
    nr."position",

    nr.projection::numeric                                          AS projection_final,
    nr.projection::double precision                                 AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    nr.neeko_rating::double precision                               AS neeko_rating,
    nr.neeko_rating::double precision                               AS neeko_rating_raw,
    LEAST(100.0, ROUND((nr.neeko_rating::numeric / v_max_neeko) * 100.0, 1))::double precision AS neeko_rating_scaled,

    round((
      nr.projection::numeric                              * 0.45
      + COALESCE(nr.value_score, 0.0)::numeric * 10.0    * 0.35
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                         AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision  AS projection_confidence,

    CASE
      WHEN COALESCE(nr.confidence, 50) >= 70
        THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
      WHEN COALESCE(nr.confidence, 50) <= 45
        THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
      ELSE COALESCE(nr.volatility_score, 50.0)
    END::double precision                                           AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_rating,
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_label,
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                   AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,

    LEAST(100, GREATEST(0,
      nr.projection::numeric * 0.55
      + COALESCE(nr.confidence, 50.0) * 0.25
      + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
    ))::double precision                                             AS captain_score,

    CASE
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 85 THEN 'Elite Captain'
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 70 THEN 'Strong Captain'
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                              AS captain_rating,

    COALESCE(nr.games_played, 0)::integer                           AS games_played,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
      THEN 'HOLD'
      ELSE 'SELL'
    END                                                              AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
      THEN 'grey'
      ELSE 'red'
    END                                                              AS recommendation_color,

    aia.summary_short                                                AS recommendation_short,
    aia.summary_long                                                 AS recommendation_why,
    aia.summary_long                                                 AS ai_summary,
    aia.generated_at                                                 AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END AS consistency_tier,
    0,
    now(),
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;


DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  consistency,
  form_score,
  neeko_rating,
  neeko_rating_raw,
  neeko_rating_scaled,
  best_value_score,
  price,
  value_score,
  value_tag,
  value_tier,
  projection_confidence,
  risk_rating,
  matchup_rating,
  matchup_label,
  matchup_multiplier,
  games_played,
  upside_rating,
  captain_score,
  captain_rating,
  ai_recommendation,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  ai_summary,
  ai_updated_at,
  consistency_tier,
  total_count,
  cached_at
FROM afl.player_rankings_cache
ORDER BY neeko_rating_scaled DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;


DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_free AS
WITH ranked AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.position_group,
    c.projection_final,
    c.projection,
    c.ceiling,
    c.floor,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.price,
    c.value_score,
    c.value_tag,
    c.value_tier,
    c.best_value_score,
    c.projection_confidence,
    c.risk_rating,
    c.matchup_rating,
    c.matchup_label,
    c.matchup_multiplier,
    c.games_played,
    c.ai_recommendation,
    c.recommendation_color,
    c.recommendation_short,
    c.recommendation_why,
    c.ai_summary,
    c.ai_updated_at,
    c.consistency_tier,
    c.total_count,
    c.cached_at,
    row_number() OVER (ORDER BY c.neeko_rating_scaled DESC NULLS LAST) AS row_rank
  FROM afl.player_rankings_cache c
)
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  CASE WHEN row_rank <= 15 THEN projection_final ELSE NULL::numeric END          AS projection_final,
  CASE WHEN row_rank <= 15 THEN projection      ELSE NULL::double precision END  AS projection,
  CASE WHEN row_rank <= 5  THEN ceiling         ELSE NULL::double precision END  AS ceiling,
  CASE WHEN row_rank <= 5  THEN floor           ELSE NULL::double precision END  AS floor,
  CASE WHEN row_rank <= 15 THEN consistency     ELSE NULL::double precision END  AS consistency,
  CASE WHEN row_rank <= 15 THEN form_score      ELSE NULL::double precision END  AS form_score,
  CASE WHEN row_rank <= 15 THEN neeko_rating    ELSE NULL::double precision END  AS neeko_rating,
  CASE WHEN row_rank <= 15 THEN neeko_rating_scaled ELSE NULL::double precision END AS neeko_rating_scaled,
  price,
  value_score,
  value_tag,
  value_tier,
  best_value_score,
  CASE WHEN row_rank <= 15 THEN projection_confidence ELSE NULL::double precision END AS projection_confidence,
  CASE WHEN row_rank <= 5  THEN risk_rating     ELSE NULL::double precision END  AS risk_rating,
  CASE WHEN row_rank <= 5  THEN matchup_rating  ELSE NULL::text END              AS matchup_rating,
  CASE WHEN row_rank <= 5  THEN matchup_label   ELSE NULL::text END              AS matchup_label,
  CASE WHEN row_rank <= 5  THEN matchup_multiplier ELSE NULL::numeric END        AS matchup_multiplier,
  CASE WHEN row_rank <= 15 THEN games_played    ELSE NULL::integer END           AS games_played,
  CASE WHEN row_rank <= 15 THEN ai_recommendation ELSE NULL::text END            AS ai_recommendation,
  CASE WHEN row_rank <= 15 THEN recommendation_color ELSE NULL::text END         AS recommendation_color,
  CASE WHEN row_rank <= 5  THEN recommendation_short ELSE NULL::text END         AS recommendation_short,
  NULL::text AS recommendation_why,
  NULL::text AS ai_summary,
  NULL::timestamptz AS ai_updated_at,
  CASE WHEN row_rank <= 15 THEN consistency_tier ELSE NULL::text END             AS consistency_tier,
  CASE
    WHEN row_rank <= 5  THEN 'full'::text
    WHEN row_rank <= 15 THEN 'partial'::text
    ELSE 'locked'::text
  END AS access_tier,
  total_count,
  cached_at,
  row_rank
FROM ranked
ORDER BY row_rank;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
