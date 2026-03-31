/*
  # Fix: Recalibrate v_projected_price_moves

  ## Problem
  - 497 players showing FLAT because they have 0-1 games (projection == recent_avg)
  - Scaling factor 6500 was too aggressive
  - Need to filter to only players with meaningful recent game history

  ## Fix
  - Drop and recreate the view to allow column type changes
  - Require minimum 2 completed games before generating a non-FLAT signal
  - Lower scaling factor to 3500 (produces ~$35k swing for 10pt gap)
  - Lower cap to +-120k
  - Tighten classification: RISE 8k-25k, BIG_RISE >25k

  ## Also
  - Rebuilds public wrapper and RPC with signal field (BUY_BEFORE_RISE, TRAP, RISING, FALLING)
*/

-- Must drop dependent objects first
DROP VIEW IF EXISTS public.v_projected_price_moves CASCADE;
DROP FUNCTION IF EXISTS public.get_projected_price_movers(integer, text);
DROP VIEW IF EXISTS afl.v_projected_price_moves CASCADE;


-- ─── Recreate internal view ─────────────────────────────────────────────────

CREATE VIEW afl.v_projected_price_moves AS
WITH
recent_games AS (
  SELECT
    g.player_id,
    COUNT(*)                              AS games_played,
    AVG(g.fantasy_score::numeric)         AS recent_avg
  FROM (
    SELECT
      player_id,
      fantasy_score,
      week,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
    FROM afl.player_games
    WHERE season = 2026
      AND fantasy_score > 0
  ) g
  WHERE g.rn <= 3
  GROUP BY g.player_id
  HAVING COUNT(*) >= 2
),
cache AS (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.price,
    r.projection_final,
    r.projection,
    r.value_score,
    r.neeko_rating,
    r.consistency
  FROM afl.player_rankings_cache r
  WHERE r.price > 0
    AND r.projection_final IS NOT NULL
    AND r.projection_final > 0
),
projected AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.position,
    c.price                                           AS current_price,
    c.projection_final                                AS projection,
    COALESCE(rg.recent_avg, c.projection_final)       AS recent_avg,
    COALESCE(rg.games_played, 0)                      AS games_played,
    c.value_score,
    c.neeko_rating,
    c.consistency,
    ROUND(c.price::numeric / 7200.0, 1)               AS breakeven,
    CASE
      WHEN rg.recent_avg IS NOT NULL THEN
        GREATEST(
          LEAST(
            ROUND(
              (c.projection_final - rg.recent_avg) * 3500.0
            )::integer,
            120000
          ),
          -120000
        )
      ELSE 0
    END                                               AS projected_price_change
  FROM cache c
  LEFT JOIN recent_games rg ON rg.player_id = c.player_id
)
SELECT
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.current_price,
  (p.current_price + p.projected_price_change)::integer          AS projected_price,
  p.projected_price_change::integer                              AS projected_price_change,
  CASE
    WHEN p.current_price > 0
    THEN ROUND((p.projected_price_change::numeric / p.current_price::numeric) * 100, 2)
    ELSE 0::numeric
  END                                                             AS projected_price_pct,
  p.projection::numeric                                           AS projection,
  p.recent_avg::numeric                                           AS recent_avg,
  p.breakeven::numeric                                            AS breakeven,
  p.games_played::integer                                         AS games_played,
  p.value_score::numeric                                          AS value_score,
  p.neeko_rating::numeric                                         AS neeko_rating,
  p.consistency::numeric                                          AS consistency,
  CASE
    WHEN p.projected_price_change > 25000   THEN 'BIG_RISE'
    WHEN p.projected_price_change > 8000    THEN 'RISE'
    WHEN p.projected_price_change >= -8000  THEN 'FLAT'
    WHEN p.projected_price_change >= -25000 THEN 'DROP'
    ELSE                                        'BIG_DROP'
  END                                                             AS movement_label
FROM projected p
WHERE p.current_price > 0
  AND p.projection > 0;

GRANT SELECT ON afl.v_projected_price_moves TO authenticated;
GRANT SELECT ON afl.v_projected_price_moves TO anon;


-- ─── Public wrapper ──────────────────────────────────────────────────────────

CREATE VIEW public.v_projected_price_moves AS
SELECT * FROM afl.v_projected_price_moves;

GRANT SELECT ON public.v_projected_price_moves TO authenticated;
GRANT SELECT ON public.v_projected_price_moves TO anon;


-- ─── RPC with signal classification ─────────────────────────────────────────

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
          WHEN v.projected_price_change > 25000 AND COALESCE(v.value_score, 0) > 60
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
          WHEN v.projected_price_change < -25000 AND v.current_price > 600000
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
