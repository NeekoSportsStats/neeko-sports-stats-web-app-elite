/*
  # Implement Tiered AI Exposure in Access Control RPCs

  1. Changes
    - Update get_rankings_safe to return tiered AI for free users
    - Update get_team_players_safe to return tiered AI
    - Update get_market_watch_safe to return tiered AI
    - Free users now see AI teasers (first sentence + category)
    - Premium users see full AI content

  2. Exposure Strategy
    - Free Tier: summary_short (first sentence), ai_recommendation (category only)
    - Premium Tier: All AI fields (full content)
    - Bots: Treated as free tier

  3. Security
    - No data leak (truncation at database level)
    - Still uses get_access_context for auth
    - Maintains RLS and bot handling
*/

-- ============================================================================
-- STEP 1: Update get_rankings_safe with tiered AI
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, int);

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  price int,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  summary_long text,
  ai_recommendation text,
  recommendation_color text,
  value_score numeric,
  ceiling numeric,
  floor numeric,
  is_locked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium boolean;
  v_free_ids int[];
BEGIN
  -- Get unified access context (bot-aware)
  v_access_context := get_access_context(p_user_id, p_is_bot);

  v_is_premium := (v_access_context->>'is_premium')::boolean;
  v_free_ids := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  -- Return rankings with tiered AI exposure
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating,

    -- Tiered AI: Free users get first sentence, Premium gets full
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN 
        c.summary_short  -- Full summary for accessible players
      WHEN c.summary_short IS NOT NULL THEN
        truncate_ai_text(c.summary_short, 'first_sentence')  -- Teaser for locked players
      ELSE NULL
    END,

    -- summary_long: Premium only
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    -- ai_recommendation: Free gets category, Premium gets full
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN 
        c.ai_recommendation  -- Full recommendation
      WHEN c.ai_recommendation IS NOT NULL THEN
        truncate_ai_text(c.ai_recommendation, 'category_only')  -- Just category (BUY/HOLD/SELL)
      ELSE NULL
    END,

    -- recommendation_color: Show for all (visual cue)
    c.recommendation_color,

    -- value_score: Premium only
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score
      ELSE NULL
    END,

    -- ceiling/floor: Premium only
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ceiling
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.floor
      ELSE NULL
    END,

    -- Lock status
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_rankings_safe(uuid, boolean, int) IS 'Returns player rankings with tiered AI exposure - free users see teasers, premium gets full content';

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 2: Update get_team_players_safe with tiered AI
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team text,
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  price int,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  summary_long text,
  ai_recommendation text,
  value_score numeric,
  is_locked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium boolean;
  v_free_ids int[];
BEGIN
  -- Get unified access context (bot-aware)
  v_access_context := get_access_context(p_user_id, p_is_bot);

  v_is_premium := (v_access_context->>'is_premium')::boolean;
  v_free_ids := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  -- Return players with tiered AI
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating::numeric,

    -- Tiered summary_short
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN 
        c.summary_short
      WHEN c.summary_short IS NOT NULL THEN
        truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,

    -- summary_long: Premium only
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    -- Tiered ai_recommendation
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN 
        c.ai_recommendation
      WHEN c.ai_recommendation IS NOT NULL THEN
        truncate_ai_text(c.ai_recommendation, 'category_only')
      ELSE NULL
    END,

    -- value_score: Premium only
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score::numeric
      ELSE NULL
    END::numeric,

    -- Lock status
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

COMMENT ON FUNCTION public.get_team_players_safe(text, uuid, boolean) IS 'Returns team players with tiered AI exposure - free users see teasers';

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 3: Create get_rankings_free optimized function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  p_is_bot boolean DEFAULT false
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  price int,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  ai_recommendation text,
  recommendation_color text,
  is_locked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_free_ids int[];
  v_limit int;
BEGIN
  -- Get free player IDs
  SELECT get_free_player_ids() INTO v_free_ids;
  
  -- Get configured limit for preview rows
  v_limit := COALESCE(
    (SELECT (config_value->'rankings'->>'free_full_rows')::int + 
            (config_value->'rankings'->>'free_locked_preview_rows')::int
     FROM public.freemium_config
     WHERE config_key = 'ui_limits'),
    20  -- Default: 10 full + 10 preview
  );

  -- Return rankings with AI teasers
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating,

    -- Show first sentence for all, full for free players
    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN 
        c.summary_short
      WHEN c.summary_short IS NOT NULL THEN
        truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,

    -- Show category for all, full for free players
    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN 
        c.ai_recommendation
      WHEN c.ai_recommendation IS NOT NULL THEN
        truncate_ai_text(c.ai_recommendation, 'category_only')
      ELSE NULL
    END,

    -- Color visible for all (visual cue only)
    c.recommendation_color,

    -- Lock status
    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_rankings_free(boolean) IS 'Optimized rankings for free users with AI teasers and configured limits';

GRANT EXECUTE ON FUNCTION public.get_rankings_free(boolean) TO anon, authenticated, service_role;
