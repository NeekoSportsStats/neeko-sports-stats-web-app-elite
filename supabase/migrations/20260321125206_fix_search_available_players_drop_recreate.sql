/*
  # Fix search_available_players RPC — drop and recreate with correct integer player_id

  ## Problem
  Old function declared player_id as UUID but afl.player_rankings_cache.player_id is INTEGER.
  Silent type-cast failure caused zero rows returned from all searches.

  ## Changes
  - Drops the old function
  - Recreates with player_id as bigint (matches actual column type)
  - Empty/null query now returns top 20 players by neeko_rating (fallback for UI)
  - Trims input before matching
  - Grants execute to anon + authenticated
*/

DROP FUNCTION IF EXISTS public.search_available_players(text, integer);

CREATE OR REPLACE FUNCTION public.search_available_players(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  player_id        bigint,
  player_name      text,
  team             text,
  player_pos       text,
  projection_final numeric,
  neeko_rating     numeric,
  is_available     boolean,
  status           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
BEGIN
  IF v_query = '' THEN
    RETURN QUERY
    SELECT
      c.player_id::bigint,
      c.player_name,
      c.team,
      c.position          AS player_pos,
      c.projection_final,
      c.neeko_rating::numeric,
      COALESCE(c.is_available, true) AS is_available,
      c.status
    FROM afl.player_rankings_cache c
    WHERE
      c.player_id   IS NOT NULL
      AND c.player_name IS NOT NULL
      AND COALESCE(c.is_available, true) = true
    ORDER BY c.neeko_rating DESC NULLS LAST
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      c.player_id::bigint,
      c.player_name,
      c.team,
      c.position          AS player_pos,
      c.projection_final,
      c.neeko_rating::numeric,
      COALESCE(c.is_available, true) AS is_available,
      c.status
    FROM afl.player_rankings_cache c
    WHERE
      c.player_id   IS NOT NULL
      AND c.player_name IS NOT NULL
      AND c.player_name ILIKE '%' || v_query || '%'
      AND COALESCE(c.is_available, true) = true
    ORDER BY c.neeko_rating DESC NULLS LAST
    LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_available_players(text, integer) TO anon, authenticated;
