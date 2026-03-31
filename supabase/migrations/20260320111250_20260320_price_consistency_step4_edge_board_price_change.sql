
/*
  # Price Consistency Step 4 — Edge Board: Price Change Columns

  ## Summary
  Rebuilds populate_mv_edge_board() to write price_change + price_change_pct from
  player_rankings_cache into mv_edge_board, and rebuilds get_edge_board_data() to
  return those columns in the RPC response.

  ## Changes
  1. Rebuild public.populate_mv_edge_board() — includes price_change, price_change_pct in INSERT
  2. Back-fill existing mv_edge_board rows from player_rankings_cache
  3. Rebuild public.get_edge_board_data() — returns price_change, price_change_pct
*/

-- ============================================================
-- 1. REBUILD populate_mv_edge_board with price_change columns
-- ============================================================
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

WITH available AS (
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
    c.price_change::integer                                               AS price_change,
    c.price_change_pct::numeric                                           AS price_change_pct,
    c.value_score::numeric                                                AS value_score,
    COALESCE(c.consistency, 50)::numeric                                  AS consistency_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0))  AS ceiling_gap,
    ROW_NUMBER() OVER (ORDER BY c.captain_score  DESC NULLS LAST)        AS captain_rank
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
    AND COALESCE(c.projection_final, 0) > 0
    AND COALESCE(c.is_available, true) = true
),

all_ranked AS (
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
    c.price_change::integer                                               AS price_change,
    c.price_change_pct::numeric                                           AS price_change_pct,
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
  SELECT * FROM available WHERE captain_score IS NOT NULL
),

breakout_eligible AS (
  SELECT * FROM available
  WHERE ceiling_gap           >= 50
    AND projection_final      >= 50
    AND floor_estimate        >= 25
    AND projection_confidence >= 40
    AND risk_rating           <= 75
    AND captain_rank          >  5
),

trap_strict AS (
  SELECT * FROM all_ranked
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
  SELECT * FROM all_ranked
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
    price, price_change, price_change_pct,
    value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct,
    value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct,
    value_score, value_tag, ai_summary, recommendation_color,
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
  price, price_change, price_change_pct,
  value_score, value_tag, ai_summary, recommendation_color,
  refreshed_at
)
SELECT
  player_id, player_name, team, position, section, section_rank,
  projection_final, ceiling_estimate, floor_estimate,
  upside_rating, risk_rating, projection_confidence,
  captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct,
  value_score, value_tag, ai_summary, recommendation_color,
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

-- ============================================================
-- 2. BACK-FILL existing mv_edge_board rows with price_change
-- ============================================================
UPDATE public.mv_edge_board eb
SET
  price_change     = c.price_change,
  price_change_pct = c.price_change_pct
FROM afl.player_rankings_cache c
WHERE c.player_id::text = eb.player_id;

-- ============================================================
-- 3. REBUILD get_edge_board_data to return price_change columns
-- ============================================================
DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 10)
RETURNS TABLE(
  player_id            text,
  player_name          text,
  team                 text,
  "position"           text,
  section              text,
  section_rank         bigint,
  projection_final     numeric,
  ceiling_estimate     numeric,
  floor_estimate       numeric,
  upside_rating        numeric,
  risk_rating          numeric,
  projection_confidence numeric,
  captain_score        numeric,
  captain_rating       text,
  neeko_rating         numeric,
  price                numeric,
  price_change         integer,
  price_change_pct     numeric,
  value_score          numeric,
  value_tag            text,
  ai_summary           text,
  recommendation_color text,
  refreshed_at         timestamptz,
  edge_score           integer,
  edge_tier            text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_mv_count integer;
BEGIN
  SELECT COUNT(*) INTO v_mv_count FROM public.mv_edge_board;

  IF v_mv_count > 0 THEN
    RETURN QUERY
    SELECT
      m.player_id, m.player_name, m.team, m."position",
      m.section, m.section_rank,
      m.projection_final, m.ceiling_estimate, m.floor_estimate,
      m.upside_rating, m.risk_rating, m.projection_confidence,
      m.captain_score, m.captain_rating, m.neeko_rating,
      m.price, m.price_change, m.price_change_pct,
      m.value_score, m.value_tag,
      m.ai_summary, m.recommendation_color, m.refreshed_at,
      c.edge_score::integer,
      c.edge_tier
    FROM public.mv_edge_board m
    LEFT JOIN afl.player_rankings_cache c ON c.player_id::text = m.player_id
    WHERE m.section_rank <= limit_n
    ORDER BY m.section, m.section_rank;

  ELSE
    RETURN QUERY
    WITH ranked AS (
      SELECT
        c.player_id::text                              AS player_id,
        c.player_name,
        c.team,
        c.position,
        c.projection_final,
        c.ceiling_estimate,
        c.floor_estimate,
        c.upside_rating,
        c.risk_rating,
        c.projection_confidence::numeric               AS projection_confidence,
        c.captain_score,
        c.captain_rating,
        c.neeko_rating,
        c.price::numeric                               AS price,
        c.price_change::integer                        AS price_change,
        c.price_change_pct::numeric                    AS price_change_pct,
        c.value_score,
        c.value_tier,
        c.value_tag,
        COALESCE(c.consistency, 50)::numeric           AS consistency_score,
        c.ai_summary,
        c.recommendation_color,
        (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0)) AS ceiling_gap,
        ROW_NUMBER() OVER (ORDER BY c.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
        ROW_NUMBER() OVER (ORDER BY c.captain_score    DESC NULLS LAST) AS captain_rank
      FROM afl.player_rankings_cache c
      WHERE COALESCE(c.projection_final, 0) > 0
    ),
    captain_eligible AS (SELECT * FROM ranked WHERE captain_score IS NOT NULL),
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
      SELECT player_id, player_name, team, "position",
        projection_final, ceiling_estimate, floor_estimate,
        upside_rating, risk_rating, projection_confidence,
        captain_score, captain_rating, neeko_rating,
        price, price_change, price_change_pct,
        value_score, value_tag, ai_summary, recommendation_color,
        'captain'::text AS section,
        ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
      FROM captain_eligible
      UNION ALL
      SELECT player_id, player_name, team, "position",
        projection_final, ceiling_estimate, floor_estimate,
        upside_rating, risk_rating, projection_confidence,
        captain_score, captain_rating, neeko_rating,
        price, price_change, price_change_pct,
        value_score, value_tag, ai_summary, recommendation_color,
        'breakout'::text AS section,
        ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
      FROM breakout_eligible
      UNION ALL
      SELECT player_id, player_name, team, "position",
        projection_final, ceiling_estimate, floor_estimate,
        upside_rating, risk_rating, projection_confidence,
        captain_score, captain_rating, neeko_rating,
        price, price_change, price_change_pct,
        value_score, value_tag, ai_summary, recommendation_color,
        'trap'::text AS section,
        trap_rn AS section_rank
      FROM trap_final
      WHERE trap_rn <= 5
    )
    SELECT
      s.player_id, s.player_name, s.team, s."position",
      s.section, s.section_rank,
      s.projection_final, s.ceiling_estimate, s.floor_estimate,
      s.upside_rating, s.risk_rating, s.projection_confidence,
      s.captain_score, s.captain_rating, s.neeko_rating,
      s.price, s.price_change, s.price_change_pct,
      s.value_score, s.value_tag,
      s.ai_summary, s.recommendation_color,
      now() AS refreshed_at,
      c.edge_score::integer,
      c.edge_tier
    FROM sectioned s
    LEFT JOIN afl.player_rankings_cache c ON c.player_id::text = s.player_id
    WHERE s.section_rank <= limit_n
    ORDER BY s.section, s.section_rank;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated;
