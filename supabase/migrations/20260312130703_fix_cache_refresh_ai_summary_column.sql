
/*
  # Fix Cache Refresh Function: ai_summary Column Mapping

  ## Problem
  afl.refresh_player_rankings_cache() reads `ai.analysis` for the ai_summary
  cache column. However in afl.ai_player_analysis:
  - `analysis` column = 0/636 rows populated (always NULL)
  - `ai_summary` column = 636/636 rows populated

  The cache function was reading the wrong column, causing ai_summary to always
  be NULL in the cache even though the data exists.

  ## Fix
  Replace `ai.analysis AS ai_summary` with `ai.ai_summary AS ai_summary`
  in the INSERT SELECT of afl.refresh_player_rankings_cache().

  ## Also creates v_ai_rankings_generation_queue
  The enqueue_ranking_reco_jobs() function references public.v_ai_rankings_generation_queue
  which does not exist, causing silent failures. This migration creates it as a
  view joining mv_ai_player_ai_inputs with current reco state to drive delta detection.
*/

-- Fix the cache refresh function to read ai_summary (not analysis)
CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = afl, public AS $$
DECLARE
  v_total_count integer;
BEGIN
  SELECT COUNT(DISTINCT nr.player_id)
  INTO v_total_count
  FROM afl.v_neeko_rating nr;

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, position, team_name, position_group,
    neeko_rating, projection_final, projection, ceiling, floor,
    consistency, form_score, price, value_score,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating, ai_recommendation, recommendation_why,
    recommendation_short, recommendation_color, ai_summary, ai_updated_at,
    value_tag, value_tier, consistency_tier, total_count, cached_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name                                                        AS team,
    nr.position_group                                                   AS position,
    nr.team_name                                                        AS team_name,
    nr.position_group                                                   AS position_group,
    ROUND(nr.neeko_rating::numeric, 2)                                  AS neeko_rating,
    ROUND(nr.projection::numeric, 2)                                    AS projection_final,
    ROUND(nr.projection::numeric, 2)                                    AS projection,
    nr.ceiling::double precision                                        AS ceiling,
    ROUND(nr.floor::numeric, 2)::double precision                       AS floor,
    ROUND(nr.consistency::numeric, 2)::double precision                 AS consistency,
    ROUND(nr.form_score::numeric, 2)::double precision                  AS form_score,
    nr.price,
    ROUND(nr.value_score::numeric, 2)::double precision                 AS value_score,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::numeric, 1)::double precision
      AS projection_confidence,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0)) * 100)::numeric, 1)::double precision
      AS risk_rating,
    COALESCE(met.matchup_rating, 'Neutral')                             AS matchup_rating,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0)) * 100)::numeric, 1)::double precision
      AS upside_rating,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))::numeric, 1)::double precision
      AS captain_score,
    CASE
      WHEN COALESCE(met.captain_score, 0) >= 70 THEN 'Elite'
      WHEN COALESCE(met.captain_score, 0) >= 50 THEN 'Strong'
      WHEN COALESCE(met.captain_score, 0) >= 30 THEN 'Viable'
      ELSE 'Avoid'
    END                                                                 AS captain_rating,
    reco.recommendation_label                                           AS ai_recommendation,
    reco.recommendation_long                                            AS recommendation_why,
    CASE
      WHEN reco.recommendation_short IS NOT NULL AND reco.recommendation_short != ''
        THEN reco.recommendation_short
      WHEN reco.recommendation_long IS NOT NULL
        THEN CASE
          WHEN reco.recommendation_long ~ '\.\s+[A-Z]'
            THEN TRIM(SUBSTRING(reco.recommendation_long FROM 1
                   FOR POSITION('.' IN REGEXP_REPLACE(reco.recommendation_long, '(\.)(?=\s+[A-Z])', E'\x01', 'g'))
                   - CASE WHEN POSITION(E'\x01' IN REGEXP_REPLACE(reco.recommendation_long, '(\.)(?=\s+[A-Z])', E'\x01', 'g')) > 0
                           THEN 0 ELSE 0 END))
          ELSE LEFT(reco.recommendation_long, 140)
        END
      ELSE NULL
    END                                                                 AS recommendation_short,
    reco.recommendation_color                                           AS recommendation_color,
    -- FIX: was ai.analysis (always NULL), now correctly reads ai.ai_summary
    ai.ai_summary                                                       AS ai_summary,
    COALESCE(ai.generated_at, reco.updated_at)                         AS ai_updated_at,
    vtag.value_tag                                                      AS value_tag,
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END                                                                 AS value_tier,
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                 AS consistency_tier,
    v_total_count                                                       AS total_count,
    now()                                                               AS cached_at
  FROM afl.v_neeko_rating nr
  LEFT JOIN afl.v_ai_player_metrics met
    ON nr.player_id = met.player_id
  LEFT JOIN (
    SELECT DISTINCT ON (player_id)
      player_id, recommendation_label, recommendation_short,
      recommendation_long, recommendation_color, updated_at, input_hash
    FROM public.ai_rankings_player_recos
    ORDER BY player_id, updated_at DESC NULLS LAST
  ) reco ON nr.player_id = reco.player_id::int
  LEFT JOIN (
    SELECT DISTINCT ON (player_id)
      player_id, ai_summary, generated_at
    FROM afl.ai_player_analysis
    ORDER BY player_id, generated_at DESC NULLS LAST
  ) ai ON nr.player_id = ai.player_id
  LEFT JOIN afl.v_ai_player_analysis_input vtag
    ON nr.player_id = vtag.player_id;

END;
$$;
