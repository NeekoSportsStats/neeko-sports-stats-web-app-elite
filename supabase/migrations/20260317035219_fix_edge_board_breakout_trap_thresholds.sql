/*
  # Fix Edge Board Breakout and Trap Thresholds

  ## Problem
  The refresh_mv_edge_board() function had ceiling_gap >= 50 as breakout threshold.
  With avg ceiling_gap = 17.66 and p90 = 27.69, this produced 0 breakout rows.

  ## Fix
  - Breakout: ceiling_gap >= 15 (was 50), projection_final >= 30 (was 50), floor >= 15 (was 25)
  - Trap: Add condition for projection_final to ensure meaningful traps
  - Re-run the function after rebuilding
*/

CREATE OR REPLACE FUNCTION public.refresh_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  TRUNCATE public.mv_edge_board;

  INSERT INTO public.mv_edge_board (
    player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, refreshed_at
  )
  WITH base AS (
    SELECT
      c.player_id::text,
      c.player_name,
      c.team,
      c.position,
      c.projection_final,
      c.ceiling::numeric        AS ceiling_estimate,
      c.floor::numeric          AS floor_estimate,
      c.upside_rating::numeric,
      c.risk_rating::numeric,
      c.projection_confidence::numeric,
      c.captain_score::numeric,
      c.captain_rating,
      c.neeko_rating::numeric,
      c.price::numeric,
      c.value_score::numeric,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      (c.ceiling - c.projection)  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.captain_score DESC NULLS LAST) AS captain_rank
    FROM afl.player_rankings_cache c
    WHERE c.projection_final IS NOT NULL
      AND c.projection_final > 0
  ),
  captains AS (
    SELECT *, 'captain' AS section,
      ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
    FROM base
    LIMIT 10
  ),
  breakouts AS (
    SELECT *, 'breakout' AS section,
      ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
    FROM base
    WHERE ceiling_gap         >= 15
      AND projection_final    >= 30
      AND floor_estimate      >= 15
      AND projection_confidence >= 35
      AND risk_rating         <= 80
      AND captain_rank        > 5
    LIMIT 10
  ),
  traps AS (
    SELECT *, 'trap' AS section,
      ROW_NUMBER() OVER (ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST) AS section_rank
    FROM base
    WHERE captain_rank        <= 150
      AND risk_rating         >= 45
      AND projection_final    >= 20
    LIMIT 5
  )
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM captains
  UNION ALL
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM breakouts
  UNION ALL
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM traps;
END;
$function$;
