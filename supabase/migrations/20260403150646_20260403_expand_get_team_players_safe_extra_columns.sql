/*
  # Expand get_team_players_safe — add columns for team page rebuild

  ## Changes
  Adds the following columns to support the new team page design:
  - value_tag (text) — e.g. "ELITE VALUE", "STRONG VALUE", used for color-coded badges
  - projection_confidence (double precision) — shown to premium users
  - neeko_rating_scaled (double precision) — for rank ordering reference
  - consistency (double precision) — used in position breakdown
  - matchup_rating (text) — shows matchup difficulty label
  - prev_price (integer) — for price change indicator
  - price_change (integer) — delta vs previous round

  Must DROP first because the return type signature changes.
*/

DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team     text,
  p_user_id  uuid    DEFAULT NULL,
  p_is_bot   boolean DEFAULT false
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  team                  text,
  player_position       text,
  position_group        text,
  price                 integer,
  prev_price            integer,
  price_change          integer,
  projection_final      numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   double precision,
  breakeven             numeric,
  value_score           numeric,
  value_tag             text,
  recommendation_strength numeric,
  ai_recommendation     text,
  summary_short         text,
  summary_long          text,
  projection_confidence double precision,
  consistency           double precision,
  matchup_rating        text,
  status                text,
  manual_status         text,
  is_bye                boolean,
  bye_round             integer,
  bye_next_round        boolean,
  is_locked             boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    c.prev_price,
    c.price_change,
    c.projection_final,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled,
    c.breakeven,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score::numeric
      ELSE NULL
    END::numeric,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tag
      ELSE NULL
    END,

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

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence
      ELSE NULL
    END,

    c.consistency,
    c.matchup_rating,
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
$function$;
