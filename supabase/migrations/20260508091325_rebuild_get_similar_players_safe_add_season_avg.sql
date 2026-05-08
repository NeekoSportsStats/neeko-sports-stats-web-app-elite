/*
  # Rebuild get_similar_players_safe to add season_avg

  Drops and recreates with season_avg included in the return set.
  season_avg is visible to all users (not gated).
  All other access control logic is unchanged.
*/

DROP FUNCTION IF EXISTS get_similar_players_safe(integer,text,numeric,numeric,uuid,boolean,integer);

CREATE FUNCTION get_similar_players_safe(
  p_player_id      integer,
  p_position       text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id        uuid    DEFAULT NULL,
  p_is_bot         boolean DEFAULT false,
  p_limit          integer DEFAULT 5
)
RETURNS TABLE (
  player_id      text,
  player_name    text,
  team           text,
  "position"     text,
  price          numeric,
  season_avg     numeric,
  projection     numeric,
  value_score    numeric,
  signal         text,
  signal_display text,
  neeko_rating   numeric,
  is_injured     boolean,
  is_locked      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    c.season_avg,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids)
         THEN c.value_score ELSE NULL END,
    c.signal::text,
    c.signal_display::text,
    c.neeko_rating,
    c.is_injured,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_unified c
  WHERE c."position"     = p_position
    AND c.player_id::int != p_player_id
    AND c.player_id       IS NOT NULL
    AND c.projection      >= p_projection_min
    AND c.projection      <= p_projection_max
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_similar_players_safe(integer,text,numeric,numeric,uuid,boolean,integer) TO anon, authenticated;
