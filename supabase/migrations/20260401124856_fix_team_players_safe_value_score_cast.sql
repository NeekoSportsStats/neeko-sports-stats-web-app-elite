/*
  # Fix get_team_players_safe - Add value_score Cast

  CRITICAL FIX: value_score is also double precision, needs cast to numeric

  ## Column Types in player_rankings_cache:
  - projection_final: numeric ✓
  - neeko_rating: double precision → needs ::numeric
  - value_score: double precision → needs ::numeric
*/

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team text,
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  price int,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  summary_long text,
  ai_recommendation text,
  value_score numeric,
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

  -- Return players with access control
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating::numeric,

    -- Lock advanced data for non-accessible players (includes bots)
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score::numeric
      ELSE NULL
    END::numeric,  -- Double cast for CASE result

    -- Mark as locked
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST;
END;
$function$;
