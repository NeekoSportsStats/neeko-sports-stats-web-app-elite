/*
  # Unification Phase 3 — Repoint All RPCs to afl.v_rankings_unified

  ## Changes
  1. get_rankings_safe()            v_rankings_core → v_rankings_unified
  2. get_market_watch_safe()        v_rankings_core → v_rankings_unified
  3. get_team_players_safe()        v_rankings_core → v_rankings_unified
  4. get_position_players_safe()    v_rankings_core → v_rankings_unified
  5. get_similar_players_safe()     v_rankings_core → v_rankings_unified
  6. get_captain_recommendations_free()    player_rankings_cache → v_rankings_unified
  7. get_captain_recommendations_premium() v_rankings_master → v_rankings_unified
  8. get_edge_board_data()          player_rankings_cache → v_rankings_unified

  ## Phase 5 Signal Vocabulary (applied simultaneously)
  - Market Watch: uses category_canonical only
  - Rankings: exposes both category + action
  - Edge Board: uses action_canonical only
  - signal_tag is NOT returned to frontend (replaced by signal_display)

  ## Phase 6 Metrics
  - Captain confidence: replaced with projection_confidence (cast to numeric) from projection system
  - value_score points to edge_canonical in all RPCs
*/

-- =====================================================================
-- 1. get_rankings_safe
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int     DEFAULT 200
)
RETURNS TABLE (
  player_id             text,
  player_name           text,
  team                  text,
  team_name             text,
  "position"            text,
  position_group        text,
  projection            numeric,
  ceiling_estimate      numeric,
  floor_estimate        numeric,
  consistency           numeric,
  form_score            numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  upside_rating         numeric,
  upside_pct            numeric,
  risk_rating           numeric,
  captain_score         numeric,
  captain_rating        text,
  price                 numeric,
  prev_price            numeric,
  price_change          numeric,
  price_change_pct      numeric,
  breakeven             numeric,
  value_score           numeric,
  edge                  numeric,
  projection_confidence numeric,
  matchup_label         text,
  matchup_multiplier    numeric,
  recommendation_strength text,
  recommendation_color  text,
  why                   text,
  why_long              text,
  summary_short         text,
  summary_long          text,
  consistency_tier      text,
  access_tier           text,
  total_count           bigint,
  cached_at             text,
  ai_updated_at         text,
  games_played          numeric,
  rank_position         int,
  signal                text,
  signal_display        text,
  season_avg            numeric,
  last_3_avg            numeric,
  last_5_avg            numeric,
  form_delta            numeric,
  form_label            text,
  trend_score           numeric,
  trend_signal          text,
  status                text,
  manual_status         text,
  is_available          boolean,
  bye_round             numeric,
  is_bye                boolean,
  bye_next_round        boolean,
  is_injured            boolean,
  category              text,
  action                text
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
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.team_name::text,
    c."position"::text,
    c.position_group::text,
    c.projection,
    c.ceiling_estimate,
    c.floor_estimate,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.upside_rating,
    c.upside_pct,
    c.risk_rating,
    c.captain_score,
    c.captain_rating::text,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven     ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score   ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge          ELSE NULL END,
    c.projection_confidence,
    c.matchup_label::text,
    c.matchup_multiplier,
    c.recommendation_strength::text,
    c.recommendation_color::text,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long      ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_long  ELSE NULL END,
    c.consistency_tier::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                          'locked'::text
    END,
    c.total_count,
    c.cached_at::text,
    c.ai_updated_at::text,
    c.games_played,
    ROW_NUMBER() OVER (ORDER BY c.projection DESC NULLS LAST)::int,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text  ELSE NULL END,
    c.signal_display::text,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    c.form_delta,
    c.form_label::text,
    c.trend_score,
    c.trend_signal::text,
    c.status::text,
    c.manual_status::text,
    c.is_available,
    c.bye_round,
    c.is_bye,
    c.bye_next_round,
    c.is_injured,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text  ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO anon, authenticated;

-- =====================================================================
-- 2. get_market_watch_safe
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_market_watch_safe(uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_market_watch_safe(
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int     DEFAULT 100
)
RETURNS TABLE (
  player_id       text,
  player_name     text,
  team            text,
  team_name       text,
  "position"      text,
  price           numeric,
  prev_price      numeric,
  price_change    numeric,
  projection      numeric,
  season_avg      numeric,
  last_3_avg      numeric,
  last_5_avg      numeric,
  breakeven       numeric,
  edge            numeric,
  value_score     numeric,
  signal          text,
  signal_display  text,
  category        text,
  action          text,
  why             text,
  why_long        text,
  matchup_label   text,
  matchup_multiplier numeric,
  consistency     numeric,
  neeko_rating    numeric,
  status          text,
  manual_status   text,
  is_bye          boolean,
  is_injured      boolean,
  games_played    numeric,
  cached_at       text,
  access_tier     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    c."position"::text,
    c.price,
    c.prev_price,
    c.price_change,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection    ELSE NULL END,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven     ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge          ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text  ELSE NULL END,
    c.signal_display::text,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text  ELSE NULL END,
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
    c.is_injured,
    c.games_played,
    c.cached_at::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                          'locked'::text
    END
  FROM afl.v_rankings_unified c
  WHERE c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
    AND c.is_injured = false
    AND c.is_bye = false
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, int) TO anon, authenticated;

-- =====================================================================
-- 3. get_team_players_safe
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team    text,
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int     DEFAULT 100
)
RETURNS TABLE (
  player_id          text,
  player_name        text,
  team               text,
  "position"         text,
  position_group     text,
  price              numeric,
  prev_price         numeric,
  price_change       numeric,
  projection         numeric,
  projection_confidence numeric,
  ceiling_estimate   numeric,
  floor_estimate     numeric,
  breakeven          numeric,
  value_score        numeric,
  edge               numeric,
  neeko_rating       numeric,
  neeko_rating_scaled numeric,
  consistency        numeric,
  form_score         numeric,
  season_avg         numeric,
  last_3_avg         numeric,
  last_5_avg         numeric,
  matchup_label      text,
  captain_rating     text,
  signal             text,
  signal_display     text,
  category           text,
  action             text,
  why                text,
  why_long           text,
  recommendation_color text,
  status             text,
  manual_status      text,
  is_bye             boolean,
  is_injured         boolean,
  bye_round          numeric,
  bye_next_round     boolean,
  games_played       numeric,
  is_locked          boolean
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
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_unified c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean, int) TO anon, authenticated;

-- =====================================================================
-- 4. get_position_players_safe
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_position_players_safe(
  p_position_code text,
  p_user_id       uuid    DEFAULT NULL,
  p_is_bot        boolean DEFAULT false,
  p_limit         int     DEFAULT 100
)
RETURNS TABLE (
  player_id             text,
  player_name           text,
  team                  text,
  "position"            text,
  price                 numeric,
  projection            numeric,
  projection_confidence numeric,
  breakeven             numeric,
  value_score           numeric,
  edge                  numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  consistency           numeric,
  season_avg            numeric,
  last_3_avg            numeric,
  last_5_avg            numeric,
  matchup_label         text,
  captain_rating        text,
  signal                text,
  signal_display        text,
  category              text,
  action                text,
  why                   text,
  why_long              text,
  upside_pct            numeric,
  is_injured            boolean,
  is_locked             boolean
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
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long              ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.upside_pct            ELSE NULL END,
    c.is_injured,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_unified c
  WHERE c."position" = p_position_code
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_position_players_safe(text, uuid, boolean, int) TO anon, authenticated;

-- =====================================================================
-- 5. get_similar_players_safe
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_similar_players_safe(int, text, numeric, numeric, uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_similar_players_safe(
  p_player_id       int,
  p_position        text,
  p_projection_min  numeric,
  p_projection_max  numeric,
  p_user_id         uuid    DEFAULT NULL,
  p_is_bot          boolean DEFAULT false,
  p_limit           int     DEFAULT 5
)
RETURNS TABLE (
  player_id    text,
  player_name  text,
  team         text,
  "position"   text,
  price        numeric,
  projection   numeric,
  value_score  numeric,
  signal       text,
  signal_display text,
  neeko_rating numeric,
  is_injured   boolean,
  is_locked    boolean
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
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

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
  FROM afl.v_rankings_unified c
  WHERE c."position" = p_position
    AND c.player_id::int != p_player_id
    AND c.player_id IS NOT NULL
    AND c.projection >= p_projection_min
    AND c.projection <= p_projection_max
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_similar_players_safe(int, text, numeric, numeric, uuid, boolean, int) TO anon, authenticated;

-- =====================================================================
-- 6. get_captain_recommendations_free
--    Phase 6: confidence = projection_confidence (cast to numeric)
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_captain_recommendations_free();

CREATE OR REPLACE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE (
  player_id          text,
  player_name        text,
  player_team        text,
  projection_final   numeric,
  ceiling_estimate   numeric,
  consistency_score  numeric,
  captain_score      numeric,
  captain_rating     text,
  captain_confidence numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  player_id::text,
  player_name::text,
  team                   AS player_team,
  projection_final,
  ceiling_estimate,
  consistency            AS consistency_score,
  captain_score,
  captain_rating::text,
  COALESCE(projection_confidence, 70)::numeric AS captain_confidence
FROM afl.v_rankings_unified
WHERE captain_score IS NOT NULL
  AND manual_status IS NULL
  AND COALESCE(is_bye, false) = false
  AND is_injured = false
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_captain_recommendations_free() TO anon, authenticated;

-- =====================================================================
-- 7. get_captain_recommendations_premium
--    Phase 6: confidence = projection_confidence (cast to numeric)
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_captain_recommendations_premium();

CREATE OR REPLACE FUNCTION public.get_captain_recommendations_premium()
RETURNS TABLE (
  player_id          text,
  player_name        text,
  player_team        text,
  projection_final   numeric,
  ceiling_estimate   numeric,
  consistency_score  numeric,
  captain_score      numeric,
  captain_rating     text,
  captain_confidence numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  player_id::text,
  player_name::text,
  team                   AS player_team,
  projection_final,
  ceiling_estimate,
  consistency            AS consistency_score,
  captain_score,
  captain_rating::text,
  COALESCE(projection_confidence, 70)::numeric AS captain_confidence
FROM afl.v_rankings_unified
WHERE captain_score IS NOT NULL
  AND manual_status IS NULL
  AND COALESCE(is_bye, false) = false
  AND is_injured = false
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_captain_recommendations_premium() TO anon, authenticated;

-- =====================================================================
-- 8. get_edge_board_data
--    Phase 3: Use v_rankings_unified
--    Phase 5: action_canonical for section classification
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_edge_board_data(int);

CREATE OR REPLACE FUNCTION public.get_edge_board_data(
  limit_n int DEFAULT 10
)
RETURNS TABLE (
  player_id          text,
  player_name        text,
  team               text,
  player_position    text,
  section            text,
  section_rank       int,
  projection_final   numeric,
  ceiling_estimate   numeric,
  floor_estimate     numeric,
  upside_rating      numeric,
  risk_rating        numeric,
  projection_confidence numeric,
  captain_score      numeric,
  captain_rating     text,
  neeko_rating       numeric,
  price              numeric,
  price_change       numeric,
  value_score        numeric,
  value_tag          text,
  ai_summary         text,
  recommendation_color text,
  refreshed_at       timestamptz,
  edge               numeric,
  signal             text,
  summary_short      text,
  trend_signal       text,
  breakeven          numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      c.player_id,
      c.player_name,
      COALESCE(c.team_name, c.team)               AS team,
      c."position"                                AS player_position,
      c.projection_final,
      c.ceiling_estimate,
      c.floor_estimate,
      c.upside_rating,
      c.risk_rating,
      c.projection_confidence,
      c.captain_score,
      c.captain_rating,
      c.neeko_rating,
      c.price,
      c.price_change,
      c.edge_canonical::double precision          AS value_score,
      c.signal_display                            AS value_tag,
      c.summary_short                             AS ai_summary,
      c.recommendation_color,
      c.cached_at                                 AS refreshed_at,
      c.edge_canonical                            AS edge,
      c.breakeven_canonical                       AS breakeven,
      -- Phase 5: Edge Board uses action_canonical vocabulary (START/HOLD/SIT)
      c.action_canonical                          AS signal,
      c.summary_short,
      c.trend_signal
    FROM afl.v_rankings_unified c
    WHERE c.games_played >= 3
      AND c.projection_final > 40
      AND c.price > 0
      AND COALESCE(c.manual_status, c.status, '') NOT IN
          ('injured', 'inactive', 'inactive_ghost', 'OUT', 'INJURED', 'OMITTED')
      AND COALESCE(c.is_bye, false) = false
      AND COALESCE(c.is_available, true) = true
  ),

  must_have_candidates AS (
    SELECT b.*, 'must_have'::text AS section,
      ROW_NUMBER() OVER (ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST) AS section_rank
    FROM base b
    WHERE b.signal = 'START'
    LIMIT limit_n
  ),

  breakout_candidates AS (
    SELECT b.*, 'breakout'::text AS section,
      ROW_NUMBER() OVER (ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST) AS section_rank
    FROM base b
    WHERE b.signal = 'START'
      AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
    LIMIT limit_n
  ),

  do_not_start_candidates AS (
    SELECT b.*, 'do_not_start'::text AS section,
      ROW_NUMBER() OVER (ORDER BY b.edge ASC NULLS LAST, b.risk_rating DESC NULLS LAST) AS section_rank
    FROM base b
    WHERE b.signal = 'SIT'
      AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
      AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
    LIMIT limit_n
  )

  SELECT
    player_id::text, player_name::text, team::text, player_position::text,
    section::text, section_rank::int,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating::text, neeko_rating,
    price, price_change,
    value_score, value_tag::text, ai_summary::text, recommendation_color::text,
    refreshed_at, edge, signal::text, summary_short::text, trend_signal::text, breakeven
  FROM (
    SELECT * FROM must_have_candidates
    UNION ALL SELECT * FROM breakout_candidates
    UNION ALL SELECT * FROM do_not_start_candidates
  ) combined
  ORDER BY section, section_rank;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO anon, authenticated;
