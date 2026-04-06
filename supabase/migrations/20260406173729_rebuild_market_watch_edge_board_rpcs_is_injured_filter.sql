/*
  # Rebuild get_market_watch_safe and get_edge_board_safe with is_injured filter

  ## Changes
  1. get_market_watch_safe: Adds WHERE is_injured = false AND is_bye = false at DB level
  2. get_edge_board_safe: Adds WHERE is_injured = false AND is_bye = false at DB level
  3. Both RPCs expose is_injured in result so frontend can display pills correctly

  ## Filter Rules
  - Rankings: NO filtering (show all, pills indicate status)
  - Market Watch: is_injured = false AND is_bye = false
  - Edge Board: is_injured = false AND is_bye = false
*/

-- ─── Rebuild get_market_watch_safe ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_market_watch_safe(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_market_watch_safe(
  p_user_id  uuid    DEFAULT NULL,
  p_is_bot   boolean DEFAULT false,
  p_limit    integer DEFAULT 200
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
  signal_display     text,
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
  is_injured         boolean,
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
    c.signal_display::text,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long     ELSE NULL END,
    c.matchup_label::text,
    CASE WHEN v_is_premium THEN c.matchup_multiplier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.consistency  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.neeko_rating ELSE NULL END,
    c.status::text,
    c.manual_status::text,
    c.is_bye,
    c.is_injured,
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
    AND c.is_injured = false
    AND c.is_bye = false
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, integer) TO anon, authenticated;

-- ─── Rebuild get_edge_board_safe ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_edge_board_safe(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_edge_board_safe(
  p_user_id  uuid    DEFAULT NULL,
  p_is_bot   boolean DEFAULT false,
  p_limit    integer DEFAULT 50
)
RETURNS TABLE (
  player_id      text,
  player_name    text,
  team           text,
  player_position text,
  price          numeric,
  projection     numeric,
  breakeven      numeric,
  edge           numeric,
  value_score    numeric,
  signal         text,
  signal_display text,
  category       text,
  action         text,
  why            text,
  games_played   numeric,
  status         text,
  manual_status  text,
  is_bye         boolean,
  is_injured     boolean,
  access_tier    text
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
    c.signal_display::text,
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
    c.is_injured,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END
  FROM afl.v_rankings_core c
  WHERE
    c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
    AND c.is_injured = false
    AND c.is_bye = false
  ORDER BY COALESCE(c.edge, 0) DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_safe(uuid, boolean, integer) TO anon, authenticated;
