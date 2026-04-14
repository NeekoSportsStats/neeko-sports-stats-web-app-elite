/*
  # Phase 7b: Add new signal fields to player-facing RPCs

  Adds decision_score, action_display, value_band, confidence fields,
  and reason fields to get_player_detail_safe, get_team_players_safe,
  and get_position_players_safe.
*/

-- ─── get_player_detail_safe ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);

CREATE OR REPLACE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id     uuid DEFAULT NULL
)
RETURNS TABLE(
  player_id              integer,
  player_name            text,
  team                   text,
  team_name              text,
  player_position        text,
  position_group         text,
  price                  numeric,
  prev_price             numeric,
  price_change           numeric,
  price_change_pct       numeric,
  projection             numeric,
  projection_confidence  numeric,
  ceiling_estimate       numeric,
  floor_estimate         numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  consistency            numeric,
  form_score             numeric,
  season_avg             numeric,
  avg_last_3             numeric,
  avg_last_5             numeric,
  matchup_label          text,
  captain_rating         text,
  signal                 text,
  signal_display         text,
  category               text,
  action                 text,
  action_display         text,
  why                    text,
  why_long               text,
  recommendation_color   text,
  upside_pct             numeric,
  games_played           numeric,
  bye_round              numeric,
  bye_next_round         boolean,
  is_bye                 boolean,
  is_injured             boolean,
  manual_status          text,
  status                 text,
  is_locked              boolean,
  decision_score         numeric,
  confidence_score_100   numeric,
  confidence_percentile  numeric,
  value_band             text,
  action_reason_1        text,
  action_reason_2        text,
  confidence_reason_1    text,
  confidence_reason_2    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_ctx        jsonb;
  v_is_premium boolean := false;
  v_is_admin   boolean := false;
  v_free_ids   int[];
BEGIN
  v_ctx        := get_access_context(p_user_id, false);
  v_is_premium := COALESCE((v_ctx->>'is_premium')::boolean, false);
  v_free_ids   := ARRAY(SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int);

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.id = p_user_id AND pr.is_admin = true
    ), false) INTO v_is_admin;
  END IF;

  RETURN QUERY
  SELECT
    c.player_id::integer,
    c.player_name,
    c.team,
    c.team                                                                     AS team_name,
    c."position"::text                                                         AS player_position,
    c.position_group::text,
    c.price::numeric,
    c.prev_price::numeric,
    c.price_change::numeric,
    c.price_change_pct::numeric,
    c.projection::numeric,
    CASE WHEN v_is_premium OR v_is_admin THEN c.projection_confidence::numeric ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ceiling_estimate::numeric      ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.floor_estimate::numeric        ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.breakeven::numeric             ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_score::numeric           ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.edge::numeric                  ELSE NULL END,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled::numeric,
    c.consistency::numeric,
    CASE WHEN v_is_premium OR v_is_admin THEN c.form_score::numeric            ELSE NULL END,
    c.season_avg::numeric,
    c.last_3_avg::numeric                                                      AS avg_last_3,
    CASE WHEN v_is_premium OR v_is_admin THEN c.last_5_avg::numeric            ELSE NULL END AS avg_last_5,
    c.matchup_label,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_rating                 ELSE NULL END,
    c.signal,
    c.signal_display,
    c.category,
    c.action,
    CASE WHEN v_is_premium OR v_is_admin OR c.player_id::int = ANY(v_free_ids) THEN c.action_display::text ELSE NULL END,
    c.why,
    CASE WHEN v_is_premium OR v_is_admin THEN c.why_long                       ELSE NULL END,
    c.recommendation_color,
    CASE WHEN v_is_premium OR v_is_admin THEN c.upside_pct::numeric            ELSE NULL END,
    c.games_played::numeric,
    c.bye_round::numeric,
    c.bye_next_round,
    c.is_bye,
    c.is_injured,
    c.manual_status,
    c.status,
    NOT (v_is_premium OR v_is_admin)                                           AS is_locked,
    CASE WHEN v_is_premium OR v_is_admin OR c.player_id::int = ANY(v_free_ids) THEN c.decision_score        ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_score_100  ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_percentile ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin OR c.player_id::int = ANY(v_free_ids) THEN c.value_band::text      ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin                                        THEN c.action_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin                                        THEN c.action_reason_2::text ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin                                        THEN c.confidence_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin                                        THEN c.confidence_reason_2::text ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c.player_name ILIKE p_player_name
  ORDER BY c.projection DESC NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO authenticated, anon;

-- ─── get_team_players_safe ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team    text,
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   integer DEFAULT 100
)
RETURNS TABLE(
  player_id              text,
  player_name            text,
  team                   text,
  "position"             text,
  position_group         text,
  price                  numeric,
  prev_price             numeric,
  price_change           numeric,
  projection             numeric,
  projection_confidence  numeric,
  ceiling_estimate       numeric,
  floor_estimate         numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  consistency            numeric,
  form_score             numeric,
  season_avg             numeric,
  last_3_avg             numeric,
  last_5_avg             numeric,
  matchup_label          text,
  captain_rating         text,
  signal                 text,
  signal_display         text,
  category               text,
  action                 text,
  action_display         text,
  why                    text,
  why_long               text,
  recommendation_color   text,
  status                 text,
  manual_status          text,
  is_bye                 boolean,
  is_injured             boolean,
  bye_round              numeric,
  bye_next_round         boolean,
  games_played           numeric,
  is_locked              boolean,
  decision_score         numeric,
  confidence_score_100   numeric,
  value_band             text,
  action_reason_1        text,
  action_reason_2        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, p_is_bot);
  v_is_premium     := (v_access_context->>'is_premium')::boolean;
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c."position"::text,
    c.position_group::text,
    c.price,
    c.prev_price,
    c.price_change,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.ceiling_estimate      ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.floor_estimate        ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven             ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score           ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge                  ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.consistency,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.form_score            ELSE NULL END,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    c.matchup_label::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.captain_rating::text  ELSE NULL END,
    c.signal::text,
    c.signal_display::text,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text          ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action_display::text  ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long              ELSE NULL END,
    c.recommendation_color::text,
    c.status::text,
    c.manual_status::text,
    c.is_bye,
    c.is_injured,
    c.bye_round,
    c.bye_next_round,
    c.games_played,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids)),
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.decision_score        ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_score_100  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_band::text      ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_2::text ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean, integer) TO authenticated, anon;

-- ─── get_position_players_safe ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_position_players_safe(
  p_position_code text,
  p_user_id       uuid    DEFAULT NULL,
  p_is_bot        boolean DEFAULT false,
  p_limit         integer DEFAULT 100
)
RETURNS TABLE(
  player_id              text,
  player_name            text,
  team                   text,
  "position"             text,
  price                  numeric,
  projection             numeric,
  projection_confidence  numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  consistency            numeric,
  season_avg             numeric,
  last_3_avg             numeric,
  last_5_avg             numeric,
  matchup_label          text,
  captain_rating         text,
  signal                 text,
  signal_display         text,
  category               text,
  action                 text,
  action_display         text,
  why                    text,
  why_long               text,
  upside_pct             numeric,
  is_injured             boolean,
  is_locked              boolean,
  decision_score         numeric,
  confidence_score_100   numeric,
  value_band             text,
  action_reason_1        text,
  action_reason_2        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, false);
  v_is_premium     := (v_access_context->>'is_premium')::boolean;
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c."position"::text,
    c.price,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven             ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score           ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge                  ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.consistency,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    c.matchup_label::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.captain_rating::text  ELSE NULL END,
    c.signal::text,
    c.signal_display::text,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text          ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action_display::text  ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long              ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.upside_pct            ELSE NULL END,
    c.is_injured,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids)),
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.decision_score        ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_score_100  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_band::text      ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_2::text ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c."position" = p_position_code
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_position_players_safe(text, uuid, boolean, integer) TO authenticated, anon;
