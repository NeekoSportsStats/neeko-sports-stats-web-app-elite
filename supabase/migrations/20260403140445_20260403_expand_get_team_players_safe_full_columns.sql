/*
  # Expand get_team_players_safe — full column set for team page rebuild

  ## Summary
  Drops and recreates get_team_players_safe to return additional columns needed
  by the rebuilt team page: breakeven, position_group, status, manual_status,
  is_bye, bye_round, bye_next_round, recommendation_strength.

  Access control logic is unchanged — only the column set is expanded.
*/

DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean);

CREATE FUNCTION public.get_team_players_safe(
  p_team     text,
  p_user_id  uuid DEFAULT NULL,
  p_is_bot   boolean DEFAULT false
)
RETURNS TABLE (
  player_id               integer,
  player_name             text,
  team                    text,
  player_position         text,
  position_group          text,
  price                   integer,
  projection_final        numeric,
  neeko_rating            numeric,
  breakeven               numeric,
  value_score             numeric,
  recommendation_strength numeric,
  ai_recommendation       text,
  summary_short           text,
  summary_long            text,
  status                  text,
  manual_status           text,
  is_bye                  boolean,
  bye_round               integer,
  bye_next_round          boolean,
  is_locked               boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    c.player_id,
    c.player_name,
    c.team,
    c.position,
    COALESCE(c.position_group, c.position),
    c.price,
    c.projection_final,
    c.neeko_rating::numeric,
    c.breakeven,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score::numeric
      ELSE NULL
    END::numeric,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_strength::numeric
      ELSE NULL
    END::numeric,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation
      WHEN c.ai_recommendation IS NOT NULL               THEN truncate_ai_text(c.ai_recommendation, 'category_only')
      ELSE NULL
    END,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short
      WHEN c.summary_short IS NOT NULL                   THEN truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,
    c.status,
    c.manual_status,
    COALESCE(c.is_bye, false),
    c.bye_round,
    COALESCE(c.bye_next_round, false),
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST;
END;
$$;
