/*
  # Fix: Recalibrate signal thresholds in get_projected_price_movers

  ## Problem
  BUY_BEFORE_RISE threshold was value_score > 60 but the actual max
  value_score in the data is ~48. This meant BUY_BEFORE_RISE never fired.

  ## Fix
  - BUY_BEFORE_RISE: projected_change > 25k AND value_score > 10 (top ~10% of players)
  - TRAP: projected_change < -25k AND current_price > 600k AND value_score < 0
  - These thresholds reflect actual data distribution (p90 = 10.72, p50 = 0)
*/

DROP FUNCTION IF EXISTS public.get_projected_price_movers(integer, text);

CREATE OR REPLACE FUNCTION public.get_projected_price_movers(
  p_limit     integer DEFAULT 15,
  p_direction text    DEFAULT 'rise'
)
RETURNS TABLE (
  player_id              bigint,
  player_name            text,
  team                   text,
  player_position        text,
  current_price          integer,
  projected_price        integer,
  projected_price_change integer,
  projected_price_pct    numeric,
  projection             numeric,
  recent_avg             numeric,
  value_score            numeric,
  movement_label         text,
  signal                 text,
  games_played           integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF p_direction = 'rise' THEN
    RETURN QUERY
      SELECT
        v.player_id::bigint,
        v.player_name,
        v.team,
        v.position,
        v.current_price,
        v.projected_price,
        v.projected_price_change,
        v.projected_price_pct,
        v.projection,
        v.recent_avg,
        v.value_score,
        v.movement_label,
        CASE
          WHEN v.projected_price_change > 25000 AND COALESCE(v.value_score, 0) > 10
            THEN 'BUY_BEFORE_RISE'
          WHEN v.projected_price_change > 8000
            THEN 'RISING'
          ELSE 'FLAT'
        END::text AS signal,
        v.games_played
      FROM afl.v_projected_price_moves v
      WHERE v.projected_price_change > 0
        AND v.games_played >= 2
      ORDER BY v.projected_price_change DESC
      LIMIT p_limit;
  ELSE
    RETURN QUERY
      SELECT
        v.player_id::bigint,
        v.player_name,
        v.team,
        v.position,
        v.current_price,
        v.projected_price,
        v.projected_price_change,
        v.projected_price_pct,
        v.projection,
        v.recent_avg,
        v.value_score,
        v.movement_label,
        CASE
          WHEN v.projected_price_change < -25000
            AND v.current_price > 600000
            AND COALESCE(v.value_score, 0) < 0
            THEN 'TRAP'
          WHEN v.projected_price_change < -8000
            THEN 'FALLING'
          ELSE 'FLAT'
        END::text AS signal,
        v.games_played
      FROM afl.v_projected_price_moves v
      WHERE v.projected_price_change < 0
        AND v.games_played >= 2
      ORDER BY v.projected_price_change ASC
      LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_projected_price_movers(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projected_price_movers(integer, text) TO anon;
