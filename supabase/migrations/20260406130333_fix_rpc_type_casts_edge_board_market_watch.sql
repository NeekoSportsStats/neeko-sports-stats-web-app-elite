/*
  # Fix type cast mismatches in get_edge_board_safe and get_market_watch_safe

  ## Root Cause
  The afl.player_rankings_cache table stores several columns as integer or float8,
  but the RETURNS TABLE declarations specified numeric. PostgreSQL does not
  implicitly cast integer -> numeric inside RETURN QUERY.

  Affected columns:
  - price: integer -> must cast to numeric
  - prev_price: integer -> must cast to numeric
  - price_change: integer -> must cast to numeric
  - neeko_rating: float8 -> must cast to numeric
  - consistency: float8 -> must cast to numeric
  - matchup_rating: text in table -> cast to numeric (NULL if not parseable) or keep as text

  ## Fix
  Add explicit ::numeric casts on all numeric output columns where the table
  column type differs from the RETURNS TABLE declaration.
*/

-- ─── 1. Rebuild get_edge_board_safe with explicit casts ───────────────────────
DROP FUNCTION IF EXISTS public.get_edge_board_safe(uuid, boolean, integer);

CREATE FUNCTION public.get_edge_board_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int DEFAULT 50
)
RETURNS TABLE (
  player_id             int,
  player_name           text,
  team                  text,
  player_position       text,
  price                 numeric,
  projection_final      numeric,
  breakeven_canonical   numeric,
  edge_canonical        numeric,
  value_score_canonical numeric,
  signal_canonical      text,
  category_canonical    text,
  action_canonical      text,
  summary_short         text,
  games_played          int,
  status                text,
  manual_status         text,
  is_bye                boolean,
  access_tier           text
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
  v_free_ids   := ARRAY(
    SELECT jsonb_array_elements_text(v_ctx->'free_player_ids')::int
  );

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.projection_final ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.breakeven_canonical ELSE NULL END,
    CASE WHEN v_is_premium
         THEN c.edge_canonical ELSE NULL END,
    c.value_score_canonical,
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

-- ─── 2. Rebuild get_market_watch_safe with explicit casts ─────────────────────
DROP FUNCTION IF EXISTS public.get_market_watch_safe(uuid, boolean, integer);

CREATE FUNCTION public.get_market_watch_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   int DEFAULT 250
)
RETURNS TABLE (
  player_id             int,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  price                 numeric,
  prev_price            numeric,
  price_change          numeric,
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
  matchup_rating        numeric,
  matchup_multiplier    numeric,
  consistency           numeric,
  neeko_rating          numeric,
  status                text,
  manual_status         text,
  is_bye                boolean,
  games_played          int,
  cached_at             timestamptz,
  access_tier           text
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
    c.price::numeric,
    c.prev_price::numeric,
    c.price_change::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.projection_final ELSE NULL END,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
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
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.summary_long ELSE NULL END,
    c.matchup_label,
    -- matchup_rating is text in the table; cast to numeric with NULL fallback
    CASE WHEN c.matchup_rating ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN c.matchup_rating::numeric ELSE NULL END,
    CASE WHEN v_is_premium
         THEN c.matchup_multiplier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.consistency::numeric ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids)
         THEN c.neeko_rating::numeric ELSE NULL END,
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
