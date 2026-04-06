/*
  # Drop and Rewrite All Safe RPCs to Use afl.v_rankings_core

  ## Purpose
  Drop existing overloads then recreate all 4 RPCs reading from
  afl.v_rankings_core with canonical short field names only.

  ## RPCs Updated
  1. get_rankings_safe
  2. get_market_watch_safe
  3. get_edge_board_safe
  4. get_player_detail_safe
*/

-- ─── Drop existing overloads ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, int);
DROP FUNCTION IF EXISTS public.get_market_watch_safe(uuid, boolean, int);
DROP FUNCTION IF EXISTS public.get_edge_board_safe(uuid, boolean, int);
DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);


-- ─── 1. get_rankings_safe ─────────────────────────────────────────────────────

CREATE FUNCTION public.get_rankings_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int DEFAULT 200
)
RETURNS TABLE (
  player_id             text,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  position_group        text,
  projection            numeric,
  ceiling_estimate      numeric,
  floor_estimate        numeric,
  consistency           numeric,
  form_score            numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  price                 numeric,
  prev_price            numeric,
  price_change          numeric,
  price_change_pct      numeric,
  breakeven             numeric,
  value_score           numeric,
  projection_confidence numeric,
  risk_rating           numeric,
  matchup_label         text,
  matchup_multiplier    numeric,
  recommendation_strength text,
  recommendation_color  text,
  why                   text,
  why_long              text,
  consistency_tier      text,
  access_tier           text,
  total_count           bigint,
  cached_at             text,
  games_played          numeric,
  rank_position         int,
  signal                text,
  season_avg            numeric,
  last_3_avg            numeric,
  upside_pct            numeric,
  status                text,
  manual_status         text,
  is_available          boolean,
  bye_round             numeric,
  is_bye                boolean,
  bye_next_round        boolean,
  trend_score           numeric,
  trend_signal          text,
  form_delta            numeric,
  form_label            text,
  category              text,
  action                text
)
LANGUAGE plpgsql
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
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.team_name::text,
    c.position::text,
    c.position_group::text,
    c.projection,
    c.ceiling_estimate,
    c.floor_estimate,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score ELSE NULL END,
    c.projection_confidence,
    c.risk_rating,
    c.matchup_label::text,
    c.matchup_multiplier,
    c.recommendation_strength::text,
    c.recommendation_color::text,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long ELSE NULL END,
    c.consistency_tier::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END,
    c.total_count,
    c.cached_at::text,
    c.games_played,
    ROW_NUMBER() OVER (ORDER BY c.projection DESC NULLS LAST)::int,
    c.signal::text,
    c.season_avg,
    c.last_3_avg,
    c.upside_pct,
    c.status::text,
    c.manual_status::text,
    c.is_available,
    c.bye_round,
    c.is_bye,
    c.bye_next_round,
    c.trend_score,
    c.trend_signal::text,
    c.form_delta,
    c.form_label::text,
    c.category::text,
    c.action::text
  FROM afl.v_rankings_core c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rankings_safe FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_rankings_safe FROM public;
GRANT EXECUTE ON FUNCTION public.get_rankings_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_safe TO service_role;


-- ─── 2. get_market_watch_safe ─────────────────────────────────────────────────

CREATE FUNCTION public.get_market_watch_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int DEFAULT 200
)
RETURNS TABLE (
  player_id          text,
  player_name        text,
  team               text,
  team_name          text,
  player_position    text,
  price              numeric,
  prev_price         numeric,
  price_change       numeric,
  projection         numeric,
  season_avg         numeric,
  last_3_avg         numeric,
  last_5_avg         numeric,
  breakeven          numeric,
  edge               numeric,
  value_score        numeric,
  signal             text,
  category           text,
  action             text,
  why                text,
  why_long           text,
  matchup_label      text,
  matchup_multiplier numeric,
  consistency        numeric,
  neeko_rating       numeric,
  status             text,
  manual_status      text,
  is_bye             boolean,
  games_played       numeric,
  cached_at          text,
  access_tier        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_ctx        jsonb;
  v_is_premium boolean;
  v_free_ids   int[];
BEGIN
  v_ctx        := get_access_context(p_user_id, p_is_bot);
  v_is_premium := (v_ctx->>'is_premium')::boolean;
  v_free_ids   := ARRAY(SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.team_name::text,
    c.position::text,
    c.price,
    c.prev_price,
    c.price_change,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection   ELSE NULL END,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven    ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge         ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text ELSE NULL END,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long      ELSE NULL END,
    c.matchup_label::text,
    CASE WHEN v_is_premium THEN c.matchup_multiplier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.consistency   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.neeko_rating  ELSE NULL END,
    c.status::text,
    c.manual_status::text,
    c.is_bye,
    c.games_played,
    c.cached_at::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END
  FROM afl.v_rankings_core c
  WHERE
    c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_market_watch_safe FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_market_watch_safe FROM public;
GRANT EXECUTE ON FUNCTION public.get_market_watch_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_watch_safe TO service_role;


-- ─── 3. get_edge_board_safe ───────────────────────────────────────────────────

CREATE FUNCTION public.get_edge_board_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int DEFAULT 50
)
RETURNS TABLE (
  player_id       text,
  player_name     text,
  team            text,
  player_position text,
  price           numeric,
  projection      numeric,
  breakeven       numeric,
  edge            numeric,
  value_score     numeric,
  signal          text,
  category        text,
  action          text,
  why             text,
  games_played    numeric,
  status          text,
  manual_status   text,
  is_bye          boolean,
  access_tier     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_ctx        jsonb;
  v_is_premium boolean;
  v_free_ids   int[];
BEGIN
  v_ctx        := get_access_context(p_user_id, p_is_bot);
  v_is_premium := (v_ctx->>'is_premium')::boolean;
  v_free_ids   := ARRAY(SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.position::text,
    c.price,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven   ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge        ELSE NULL END,
    c.value_score,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text ELSE NULL END,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    c.games_played,
    c.status::text,
    c.manual_status::text,
    c.is_bye,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END
  FROM afl.v_rankings_core c
  WHERE
    c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
  ORDER BY COALESCE(c.edge, 0) DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_edge_board_safe FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_edge_board_safe FROM public;
GRANT EXECUTE ON FUNCTION public.get_edge_board_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_edge_board_safe TO service_role;


-- ─── 4. get_player_detail_safe ────────────────────────────────────────────────

CREATE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  player_id             text,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  position_group        text,
  price                 numeric,
  prev_price            numeric,
  price_change          numeric,
  price_change_pct      numeric,
  projection            numeric,
  projection_confidence numeric,
  ceiling_estimate      numeric,
  floor_estimate        numeric,
  consistency           numeric,
  form_score            numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  value_score           numeric,
  signal                text,
  edge                  numeric,
  breakeven             numeric,
  category              text,
  action                text,
  trend_signal          text,
  form_label            text,
  form_delta            numeric,
  season_avg            numeric,
  last_3_avg            numeric,
  matchup_label         text,
  matchup_multiplier    numeric,
  captain_rating        text,
  captain_score         numeric,
  risk_rating           numeric,
  upside_pct            numeric,
  upside_rating         numeric,
  why                   text,
  why_long              text,
  recommendation_color  text,
  games_played          numeric,
  bye_round             numeric,
  is_bye                boolean,
  manual_status         text,
  status                text,
  is_available          boolean,
  is_locked             boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_premium boolean := false;
  v_is_admin   boolean := false;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT
      COALESCE(
        EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE (s.profile_id = p_user_id OR s.user_id = p_user_id)
            AND s.status IN ('active', 'trialing')
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now()
        ), false
      ) OR COALESCE(
        EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = p_user_id AND pr.is_manual_premium = true
        ), false
      )
    INTO v_is_premium;

    SELECT COALESCE(
      EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = p_user_id AND pr.is_admin = true
      ), false
    ) INTO v_is_admin;
  END IF;

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.team_name::text,
    c.position::text,
    c.position_group::text,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.projection,
    CASE WHEN v_is_premium OR v_is_admin THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ceiling_estimate      ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.floor_estimate        ELSE NULL END,
    c.consistency,
    CASE WHEN v_is_premium OR v_is_admin THEN c.form_score            ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_score           ELSE NULL END,
    c.signal::text,
    CASE WHEN v_is_premium OR v_is_admin THEN c.edge                  ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.breakeven             ELSE NULL END,
    c.category::text,
    c.action::text,
    c.trend_signal::text,
    c.form_label::text,
    c.form_delta,
    c.season_avg,
    c.last_3_avg,
    c.matchup_label::text,
    CASE WHEN v_is_premium OR v_is_admin THEN c.matchup_multiplier    ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_rating::text  ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_score         ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.risk_rating           ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.upside_pct            ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.upside_rating         ELSE NULL END,
    c.why,
    CASE WHEN v_is_premium OR v_is_admin THEN c.why_long              ELSE NULL END,
    c.recommendation_color::text,
    c.games_played,
    c.bye_round,
    c.is_bye,
    c.manual_status::text,
    c.status::text,
    c.is_available,
    NOT (v_is_premium OR v_is_admin)
  FROM afl.v_rankings_core c
  WHERE c.player_name ILIKE p_player_name
  ORDER BY c.projection DESC NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_player_detail_safe FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_player_detail_safe FROM public;
GRANT EXECUTE ON FUNCTION public.get_player_detail_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_detail_safe TO service_role;
