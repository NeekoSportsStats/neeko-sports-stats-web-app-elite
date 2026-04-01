/*
  # Fix get_similar_players_safe Type Mismatch

  CRITICAL FIX: Same neeko_rating type mismatch as get_team_players_safe

  ## Fix:
  - Add explicit ::numeric cast to neeko_rating and projection_final
*/

CREATE OR REPLACE FUNCTION public.get_similar_players_safe(
  p_player_id integer,
  p_position text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5,
  p_is_bot boolean DEFAULT false
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  projection_final numeric,
  neeko_rating numeric,
  is_locked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_access_context jsonb;
  v_is_premium boolean;
  v_free_ids int[];
BEGIN
  -- Get unified access context (bot-aware)
  v_access_context := get_access_context(p_user_id, p_is_bot);

  v_is_premium := (v_access_context->>'is_premium')::boolean;
  v_free_ids := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  -- Return similar players with lock status
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.projection_final::numeric,  -- Explicit cast
    c.neeko_rating::numeric,      -- Explicit cast

    -- Mark as locked
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c."position" = p_position
    AND c.player_id != p_player_id
    AND c.player_id IS NOT NULL
    AND c.projection_final >= p_projection_min
    AND c.projection_final <= p_projection_max
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer, boolean) IS 
'Phase 2.6: Bot-aware version with type cast fix. Bots receive free tier data only.';
