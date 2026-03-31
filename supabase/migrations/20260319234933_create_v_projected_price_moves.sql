/*
  # Projected Price Movement View

  ## Summary
  Creates a view that estimates next-round AFL Fantasy price movement per player.

  ## Model
  AFL Fantasy price movement approximation:
    projected_price_change = (projection_final - recent_3_avg) * 6500

  Where:
    - projection_final = from player_rankings_cache
    - recent_3_avg     = avg of last 3 fantasy_score values from afl.player_games
    - 6500             = scaling factor (tuned to real AFL price swing magnitude)

  If a player has fewer than 2 games with scores, `projection_final` is used as both
  expected and recent average, resulting in zero projected change (FLAT).

  ## Classification Labels (movement_label)
    - BIG_RISE:  projected_price_change > +25,000
    - RISE:      +10,000 to +25,000
    - FLAT:      -10,000 to +10,000
    - DROP:      -10,000 to -25,000
    - BIG_DROP:  < -25,000

  ## New Objects
    1. `afl.v_projected_price_moves`        — internal view using player_games + rankings_cache
    2. `public.v_projected_price_moves`     — public read wrapper
    3. `public.get_projected_price_movers`  — RPC returning top risers or fallers

  ## Notes
    - projected_price_change bounded to [-150k, +150k] to prevent outliers
    - Columns used from player_rankings_cache: player_id, player_name, team, position,
      price, projection_final, projection, value_score, neeko_rating, consistency
*/

-- ─── Step 1: Internal view ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_projected_price_moves AS
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
    c.price                                                                              AS current_price,
    c.projection_final                                                                   AS projection,
    COALESCE(
      CASE WHEN rg.games_played >= 2 THEN rg.recent_avg ELSE NULL END,
      c.projection,
      c.projection_final
    )                                                                                    AS recent_avg,
    COALESCE(rg.games_played, 0)                                                        AS games_played,
    c.value_score,
    c.neeko_rating,
    c.consistency,
    ROUND(c.price::numeric / 7200.0, 1)                                                 AS breakeven,
    GREATEST(
      LEAST(
        ROUND(
          (c.projection_final - COALESCE(
            CASE WHEN rg.games_played >= 2 THEN rg.recent_avg ELSE NULL END,
            c.projection,
            c.projection_final
          )) * 6500.0
        )::integer,
        150000
      ),
      -150000
    )                                                                                     AS projected_price_change
  FROM cache c
  LEFT JOIN recent_games rg ON rg.player_id = c.player_id
)
SELECT
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.current_price,
  p.current_price + p.projected_price_change                     AS projected_price,
  p.projected_price_change,
  CASE
    WHEN p.current_price > 0
    THEN ROUND((p.projected_price_change::numeric / p.current_price::numeric) * 100, 2)
    ELSE 0
  END                                                             AS projected_price_pct,
  p.projection,
  p.recent_avg,
  p.breakeven,
  p.games_played,
  p.value_score,
  p.neeko_rating,
  p.consistency,
  CASE
    WHEN p.projected_price_change > 25000   THEN 'BIG_RISE'
    WHEN p.projected_price_change > 10000   THEN 'RISE'
    WHEN p.projected_price_change >= -10000 THEN 'FLAT'
    WHEN p.projected_price_change >= -25000 THEN 'DROP'
    ELSE                                        'BIG_DROP'
  END                                                             AS movement_label
FROM projected p
WHERE p.current_price > 0
  AND p.projection > 0;

GRANT SELECT ON afl.v_projected_price_moves TO authenticated;
GRANT SELECT ON afl.v_projected_price_moves TO anon;


-- ─── Step 2: Public wrapper ──────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_projected_price_moves;

CREATE OR REPLACE VIEW public.v_projected_price_moves AS
SELECT * FROM afl.v_projected_price_moves;

GRANT SELECT ON public.v_projected_price_moves TO authenticated;
GRANT SELECT ON public.v_projected_price_moves TO anon;


-- ─── Step 3: RPC for top movers ─────────────────────────────────────────────

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
  movement_label         text
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
        v.movement_label
      FROM afl.v_projected_price_moves v
      WHERE v.projected_price_change > 0
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
        v.movement_label
      FROM afl.v_projected_price_moves v
      WHERE v.projected_price_change < 0
      ORDER BY v.projected_price_change ASC
      LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_projected_price_movers(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_projected_price_movers(integer, text) TO anon;
