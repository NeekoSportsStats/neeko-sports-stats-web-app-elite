/*
  # Fix get_edge_board_safe — add value_score_canonical

  ## Root Cause
  The RPC return TABLE definition was missing value_score_canonical.
  The column exists and is populated in afl.player_rankings_cache, but was
  never included in the SELECT or the TABLE(...) return signature.
  The frontend correctly mapped r.value_score_canonical → value_score,
  but always received undefined because the field was absent from the response.

  ## Change
  - Drop and recreate get_edge_board_safe with value_score_canonical added
  - value_score_canonical exposed for premium users and free-tier players
*/

DROP FUNCTION IF EXISTS public.get_edge_board_safe(uuid, boolean, integer);

CREATE FUNCTION public.get_edge_board_safe(
  p_user_id uuid    DEFAULT NULL::uuid,
  p_is_bot  boolean DEFAULT false,
  p_limit   integer DEFAULT 200
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  player_position       text,
  price                 integer,
  projection_final      numeric,
  breakeven_canonical   numeric,
  edge_canonical        numeric,
  value_score_canonical numeric,
  signal_canonical      text,
  category_canonical    text,
  action_canonical      text,
  summary_short         text,
  games_played          integer,
  status                text,
  manual_status         text,
  is_bye                boolean,
  access_tier           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx        jsonb;
  v_is_premium boolean;
  v_free_ids   int[];
BEGIN
  v_ctx        := get_access_context(p_user_id, p_is_bot);
  v_is_premium := (v_ctx->>'is_premium')::boolean;
  v_free_ids   := ARRAY(
    SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int
  );

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.projection_final ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.breakeven_canonical ELSE NULL END,
    CASE WHEN v_is_premium
      THEN c.edge_canonical ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.value_score_canonical ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.signal_canonical ELSE NULL END,
    c.category_canonical,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.action_canonical ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
        THEN c.summary_short
      WHEN c.summary_short IS NOT NULL
        THEN truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,
    c.games_played,
    c.status,
    c.manual_status,
    c.is_bye,
    CASE
      WHEN v_is_premium                  THEN 'premium'::text
      WHEN c.player_id = ANY(v_free_ids) THEN 'free'::text
      ELSE                                    'locked'::text
    END
  FROM afl.player_rankings_cache c
  WHERE
    c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
  ORDER BY
    COALESCE(c.edge_canonical, 0) DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
