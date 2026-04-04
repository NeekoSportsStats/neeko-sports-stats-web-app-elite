/*
  # Step 5 — Rebuild get_team_players_safe and get_player_detail_safe

  Removes ai_recommendation from both RPC return types and bodies.
  Replaces with why (gated summary_short) in team players RPC.
  Player detail RPC drops ai_recommendation, keeps recommendation_color + summary fields.
*/

-- ============================================================
-- get_team_players_safe
-- ============================================================
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team      text,
  p_user_id   uuid DEFAULT NULL,
  p_is_bot    boolean DEFAULT false
)
RETURNS TABLE(
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
  breakeven             numeric,
  value_score           numeric,
  value_tag             text,
  recommendation_strength numeric,
  why                   text,
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
  is_locked             boolean,
  signal                text,
  edge                  numeric
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
    c.prev_price,
    c.price_change,
    c.projection_final,
    c.neeko_rating::numeric,
    c.breakeven,

    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score::numeric ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tag ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_strength::numeric ELSE NULL END::numeric,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.summary_short, c.recommendation_short)
      WHEN COALESCE(c.summary_short, c.recommendation_short) IS NOT NULL THEN truncate_ai_text(COALESCE(c.summary_short, c.recommendation_short), 'first_sentence')
      ELSE NULL
    END,

    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,

    c.consistency,
    c.matchup_rating,
    c.status,
    c.manual_status,
    COALESCE(c.is_bye, false),
    c.bye_round,
    COALESCE(c.bye_next_round, false),

    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END,

    c.signal,
    c.edge

  FROM afl.player_rankings_cache c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean) TO anon, authenticated, service_role;


-- ============================================================
-- get_player_detail_safe
-- ============================================================
DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);

CREATE OR REPLACE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id     uuid DEFAULT NULL
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  position_group        text,
  price                 integer,
  prev_price            integer,
  price_change          integer,
  price_change_pct      numeric,
  projection_final      numeric,
  projection_confidence numeric,
  ceiling               numeric,
  floor                 numeric,
  consistency           numeric,
  form_score            numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  value_score           numeric,
  best_value_score      numeric,
  value_tag             text,
  value_tier            text,
  breakeven             numeric,
  games_played          integer,
  recommendation_color  text,
  recommendation_short  text,
  summary_short         text,
  summary_long          text,
  upside_pct            numeric,
  bye_round             integer,
  manual_status         text,
  captain_rating        text,
  captain_score         numeric,
  is_locked             boolean,
  is_premium            boolean,
  signal                text,
  edge                  numeric,
  baseline              numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean := false;
  v_free_ids   int[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN is_manual_premium = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.profiles
    WHERE id = p_user_id;
  END IF;

  SELECT get_free_player_ids() INTO v_free_ids;

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.position_group,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.projection_final,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ceiling ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.floor ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.consistency ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.form_score ELSE NULL END::numeric,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.best_value_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tag ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.breakeven ELSE NULL END::numeric,
    c.games_played,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.recommendation_short, c.summary_short) ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END::numeric,
    c.bye_round,
    c.manual_status,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_rating ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END,
    v_is_premium,
    c.signal,
    c.edge,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.baseline ELSE NULL END::numeric
  FROM afl.player_rankings_cache c
  WHERE LOWER(c.player_name) = LOWER(p_player_name)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO anon, authenticated, service_role;
