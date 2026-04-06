/*
  # Rebuild get_similar_players_safe — Canonical Field Names via afl.v_rankings_core

  ## Summary
  Rebuilds get_similar_players_safe to read from afl.v_rankings_core instead of
  afl.player_rankings_cache directly. The old version returned projection_final (legacy)
  and had a minimal field set. This version returns the canonical field set needed
  by the AFLPlayerPage similar players section.

  ## Changes
  1. Drop all existing overloads of get_similar_players_safe
  2. Rebuild using afl.v_rankings_core as the single source of truth
  3. Return canonical column names matching AFLPlayerPage.SimilarPlayer interface:
     - projection (not projection_final)
     - player_position (not position)
     - signal, signal_display, value_score, price (canonical)
     - is_injured (for frontend filtering)
     - is_locked (access control)
  4. Filter: exclude the target player, match position, project within range
  5. Use get_access_context() for consistent premium/free access logic
  6. Type consistency: all numeric as numeric
  7. Grant anon + authenticated + service_role execute

  ## Return Schema (canonical — matches AFLPlayerPage.SimilarPlayer interface)
  player_id, player_name, team, player_position,
  price, projection, value_score,
  signal, signal_display, neeko_rating,
  is_injured, is_locked
*/

-- Drop all known overloads
DROP FUNCTION IF EXISTS public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer, boolean);
DROP FUNCTION IF EXISTS public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer);
DROP FUNCTION IF EXISTS public.get_similar_players_safe(integer, text, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION public.get_similar_players_safe(
  p_player_id      integer,
  p_position       text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id        uuid    DEFAULT NULL,
  p_limit          integer DEFAULT 5,
  p_is_bot         boolean DEFAULT false
)
RETURNS TABLE (
  player_id     text,
  player_name   text,
  team          text,
  player_position text,
  price         numeric,
  projection    numeric,
  value_score   numeric,
  signal        text,
  signal_display text,
  neeko_rating  numeric,
  is_injured    boolean,
  is_locked     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, p_is_bot);
  v_is_premium     := (v_access_context->>'is_premium')::boolean;
  v_free_ids       := ARRAY(
    SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int
  );

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c."position"::text,
    c.price,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score ELSE NULL END,
    c.signal::text,
    c.signal_display::text,
    c.neeko_rating,
    c.is_injured,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_core c
  WHERE c."position" = p_position
    AND c.player_id::int != p_player_id
    AND c.player_id IS NOT NULL
    AND c.projection >= p_projection_min
    AND c.projection <= p_projection_max
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer, boolean)
  TO anon, authenticated, service_role;
