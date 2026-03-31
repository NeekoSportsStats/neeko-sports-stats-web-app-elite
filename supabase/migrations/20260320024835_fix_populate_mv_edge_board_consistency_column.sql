/*
  # Fix populate_mv_edge_board — consistency column name

  afl.player_rankings_cache uses 'consistency' not 'consistency_score'.
  The trap detection logic referenced the wrong column name.
*/

CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN

  TRUNCATE TABLE public.mv_edge_board;

  WITH ranked AS (
    SELECT
      c.player_id::text                                                     AS player_id,
      c.player_name,
      c.team,
      c.position,
      c.projection_final::numeric                                           AS projection_final,
      c.ceiling_estimate::numeric                                           AS ceiling_estimate,
      c.floor_estimate::numeric                                             AS floor_estimate,
      c.upside_rating::numeric                                              AS upside_rating,
      c.risk_rating::numeric                                                AS risk_rating,
      c.projection_confidence::numeric                                      AS projection_confidence,
      c.captain_score::numeric                                              AS captain_score,
      c.captain_rating,
      c.neeko_rating::numeric                                               AS neeko_rating,
      c.price::numeric                                                      AS price,
      c.value_score::numeric                                                AS value_score,
      COALESCE(c.consistency, 50)::numeric                                  AS consistency_score,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0))  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.neeko_rating   DESC NULLS LAST)        AS neeko_rating_rank,
      ROW_NUMBER() OVER (ORDER BY c.captain_score  DESC NULLS LAST)        AS captain_rank
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND COALESCE(c.projection_final, 0) > 0
  ),

  captain_eligible AS (
    SELECT * FROM ranked WHERE captain_score IS NOT NULL
  ),

  breakout_eligible AS (
    SELECT * FROM ranked
    WHERE ceiling_gap           >= 50
      AND projection_final      >= 50
      AND floor_estimate        >= 25
      AND projection_confidence >= 40
      AND risk_rating           <= 75
      AND captain_rank          >  5
  ),

  trap_strict AS (
    SELECT * FROM ranked
    WHERE neeko_rating_rank <= 100
      AND (risk_rating >= 50 OR value_score < 95)
      AND (
        (CASE WHEN risk_rating           >= 55 THEN 1 ELSE 0 END) +
        (CASE WHEN consistency_score     <= 50 THEN 1 ELSE 0 END) +
        (CASE WHEN value_score           <  95 THEN 1 ELSE 0 END) +
        (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
      ) >= 2
  ),

  trap_fallback AS (
    SELECT * FROM ranked
    WHERE neeko_rating_rank <= 100
      AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
    ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
  ),

  trap_combined AS (
    SELECT *, 1 AS trap_priority FROM trap_strict
    UNION ALL
    SELECT *, 2 AS trap_priority FROM trap_fallback
  ),

  trap_final AS (
    SELECT *,
      ROW_NUMBER() OVER (
        ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
      ) AS trap_rn
    FROM trap_combined
  ),

  sectioned AS (
    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'captain'::text AS section,
      ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
    FROM captain_eligible

    UNION ALL

    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'breakout'::text AS section,
      ROW_NUMBER() OVER (
        ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST
      ) AS section_rank
    FROM breakout_eligible

    UNION ALL

    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'trap'::text AS section,
      trap_rn      AS section_rank
    FROM trap_final
    WHERE trap_rn <= 10
  )

  INSERT INTO public.mv_edge_board (
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    refreshed_at
  )
  SELECT
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    now()
  FROM sectioned
  WHERE section_rank <= 10;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'edge_board_refreshed', 'populate_mv_edge_board', 'info',
    'Edge board rebuilt from player_rankings_cache: ' || v_inserted || ' rows',
    jsonb_build_object('rows_inserted', v_inserted, 'refreshed_at', now())
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message)
  VALUES ('edge_board_refresh_error', 'populate_mv_edge_board', 'error', SQLERRM);
  RAISE;
END;
$$;
