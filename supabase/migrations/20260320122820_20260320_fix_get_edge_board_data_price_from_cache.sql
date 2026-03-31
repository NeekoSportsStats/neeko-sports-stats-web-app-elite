/*
  # Fix get_edge_board_data: always read price from afl.player_rankings_cache

  ## Problem
  When mv_edge_board has rows, the RPC reads m.price directly from the mv_edge_board table.
  mv_edge_board is a snapshot table populated by populate_mv_edge_board() — it can become
  stale between price commits and explicit refreshes, causing the edge board to show old prices.

  ## Fix
  In the mv_edge_board branch of the RPC, override price, prev_price, price_change, and 
  price_change_pct with values from afl.player_rankings_cache (which is the canonical,
  always-up-to-date source after populate_rankings_cache_from_source() runs).

  The fallback branch (when mv_edge_board is empty) already reads from the cache directly.

  ## Changes
  - Drop and recreate get_edge_board_data to join cache for price fields in mv_edge_board branch
*/

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 10)
RETURNS TABLE(
  player_id text, player_name text, team text, "position" text,
  section text, section_rank bigint,
  projection_final numeric, ceiling_estimate numeric, floor_estimate numeric,
  upside_rating numeric, risk_rating numeric, projection_confidence numeric,
  captain_score numeric, captain_rating text, neeko_rating numeric,
  price numeric, price_change integer, price_change_pct numeric,
  value_score numeric, value_tag text,
  ai_summary text, recommendation_color text,
  refreshed_at timestamp with time zone,
  edge_score integer, edge_tier text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_mv_count integer;
BEGIN
  SELECT COUNT(*) INTO v_mv_count FROM public.mv_edge_board;

  IF v_mv_count > 0 THEN
    -- mv_edge_board branch: use cache for price (always fresh), mv for projection/ranking fields
    RETURN QUERY
    SELECT
      m.player_id, m.player_name, m.team, m."position",
      m.section, m.section_rank,
      m.projection_final, m.ceiling_estimate, m.floor_estimate,
      m.upside_rating, m.risk_rating, m.projection_confidence,
      m.captain_score, m.captain_rating, m.neeko_rating,
      -- price fields: prefer live cache over potentially stale mv snapshot
      COALESCE(c.price, m.price)::numeric           AS price,
      COALESCE(c.price_change, m.price_change)      AS price_change,
      COALESCE(c.price_change_pct, m.price_change_pct) AS price_change_pct,
      COALESCE(c.value_score, m.value_score)        AS value_score,
      COALESCE(c.value_tag, m.value_tag)            AS value_tag,
      COALESCE(c.ai_summary, m.ai_summary)          AS ai_summary,
      COALESCE(c.recommendation_color, m.recommendation_color) AS recommendation_color,
      m.refreshed_at,
      c.edge_score::integer,
      c.edge_tier
    FROM public.mv_edge_board m
    LEFT JOIN afl.player_rankings_cache c ON c.player_id::text = m.player_id
    WHERE m.section_rank <= limit_n
    ORDER BY m.section, m.section_rank;

  ELSE
    -- fallback: derive directly from cache (no mv_edge_board rows)
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
$function$;
