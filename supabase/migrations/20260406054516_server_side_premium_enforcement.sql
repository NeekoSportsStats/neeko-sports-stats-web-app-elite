/*
  # Server-Side Premium Enforcement

  ## Summary
  Closes the freemium bypass gap where Market Watch and Edge Board queried
  v_player_rankings_cache directly, returning all premium fields to any caller.

  ## Changes

  ### 1. Rebuild v_player_rankings_cache (public view)
  Drop and recreate with stripped schema — only safe identity + basic data.
  Premium fields removed: projection_final, edge_canonical, value_score_canonical,
  breakeven_canonical, signal_canonical, action_canonical, summary_short/long,
  neeko_rating, consistency, matchup_multiplier, form_score, etc.

  ### 2. New get_market_watch_safe RPC
  Server-side tier enforcement for Market Watch. Uses get_access_context().
  Premium: full fields. Free_ids: most fields. Locked: identity + category only.

  ### 3. New get_edge_board_safe RPC
  Server-side tier enforcement for Edge Board.
  Premium: full edge signals. Locked: identity + price only.

  ## Security
  Premium fields are NULL for non-premium callers at DB level.
  No frontend bypass possible — DevTools shows NULL for locked fields.
*/

-- ─── Step 1: Drop and rebuild public v_player_rankings_cache ─────────────────
-- Must drop dependents first, then recreate.

DROP VIEW IF EXISTS public.v_player_rankings_cache CASCADE;

CREATE VIEW public.v_player_rankings_cache AS
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
  c.season_avg,
  c.last_3_avg,
  c.last_5_avg,
  c.games_played,
  c.status,
  c.manual_status,
  c.is_available,
  c.is_bye,
  c.bye_round,
  c.bye_next_round,
  c.cached_at,
  c.cache_snapshot_id,
  -- Category label only (safe to expose — just a string tag, no scoring)
  c.category_canonical,
  -- Basic matchup strings only
  c.matchup_label,
  c.matchup_rating
FROM afl.player_rankings_cache c
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_player_rankings_cache TO anon, authenticated;

-- ─── Step 2: Create get_market_watch_safe RPC ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_market_watch_safe(
  p_user_id  uuid    DEFAULT NULL,
  p_is_bot   boolean DEFAULT false,
  p_limit    integer DEFAULT 300
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  price                 integer,
  prev_price            integer,
  price_change          integer,
  projection_final      numeric,
  season_avg            numeric,
  last_3_avg            numeric,
  last_5_avg            numeric,
  breakeven_canonical   numeric,
  edge_canonical        numeric,
  value_score_canonical numeric,
  signal_canonical      text,
  category_canonical    text,
  action_canonical      text,
  summary_short         text,
  summary_long          text,
  matchup_label         text,
  matchup_rating        text,
  matchup_multiplier    numeric,
  consistency           double precision,
  neeko_rating          double precision,
  status                text,
  manual_status         text,
  is_bye                boolean,
  games_played          integer,
  cached_at             timestamptz,
  access_tier           text
)
LANGUAGE plpgsql
STABLE
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
  v_free_ids   := ARRAY(
    SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int
  );

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.price,
    c.prev_price,
    c.price_change,
    -- projection: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.projection_final ELSE NULL END,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    -- breakeven: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.breakeven_canonical ELSE NULL END,
    -- edge score: premium only
    CASE WHEN v_is_premium
      THEN c.edge_canonical ELSE NULL END,
    -- value score: premium only
    CASE WHEN v_is_premium
      THEN c.value_score_canonical ELSE NULL END,
    -- signal: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.signal_canonical ELSE NULL END,
    -- category label: always (safe string tag)
    c.category_canonical,
    -- action: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.action_canonical ELSE NULL END,
    -- AI short: full for premium/free, truncated for locked
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
        THEN c.summary_short
      WHEN c.summary_short IS NOT NULL
        THEN truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,
    -- AI long: premium + free_ids only
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.summary_long ELSE NULL END,
    c.matchup_label,
    c.matchup_rating,
    -- matchup multiplier: premium only
    CASE WHEN v_is_premium
      THEN c.matchup_multiplier ELSE NULL END,
    -- consistency: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.consistency ELSE NULL END,
    -- neeko rating: premium + free_ids
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
      THEN c.neeko_rating ELSE NULL END,
    c.status,
    c.manual_status,
    c.is_bye,
    c.games_played,
    c.cached_at,
    CASE
      WHEN v_is_premium                  THEN 'premium'::text
      WHEN c.player_id = ANY(v_free_ids) THEN 'free'::text
      ELSE                                    'locked'::text
    END
  FROM afl.player_rankings_cache c
  WHERE
    c.player_id IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
  ORDER BY c.projection_final DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, integer) TO anon, authenticated;

-- ─── Step 3: Create get_edge_board_safe RPC ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_edge_board_safe(
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   integer DEFAULT 200
)
RETURNS TABLE(
  player_id           integer,
  player_name         text,
  team                text,
  player_position     text,
  price               integer,
  projection_final    numeric,
  breakeven_canonical numeric,
  edge_canonical      numeric,
  signal_canonical    text,
  category_canonical  text,
  action_canonical    text,
  summary_short       text,
  games_played        integer,
  status              text,
  manual_status       text,
  is_bye              boolean,
  access_tier         text
)
LANGUAGE plpgsql
STABLE
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
    -- edge score: premium only
    CASE WHEN v_is_premium
      THEN c.edge_canonical ELSE NULL END,
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

GRANT EXECUTE ON FUNCTION public.get_edge_board_safe(uuid, boolean, integer) TO anon, authenticated;
