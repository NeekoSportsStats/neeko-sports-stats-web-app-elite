/*
  # Unified Access Context - Bot-Aware Data-Level Gating

  1. New Functions
    - `get_access_context(user_id, x_bot_request)` - Unified access resolver
    - Returns: isPremium, isBot, freePlayerIds in single call

  2. Enhanced Functions
    - Update `get_team_players_safe` to accept bot flag
    - Update `get_similar_players_safe` to accept bot flag
    - Update database views with CASE statements for premium fields

  3. Bot Safety
    - Bot requests ALWAYS treated as free users (isPremium = false)
    - Premium data NULL for bots at database level
    - Header-driven bot detection (x-bot-request header)

  4. Purpose
    - Single source of truth for all access decisions
    - Data-level protection (not just UI hiding)
    - SEO-friendly (all players visible, premium data protected)
    - Defense in depth (database + application + middleware)
*/

-- ============================================================================
-- STEP 1: Create unified access context function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_access_context(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_premium boolean := false;
  v_is_admin boolean := false;
  v_free_player_ids int[];
  v_manual_premium boolean := false;
  v_subscription_status text;
BEGIN
  -- Bots are ALWAYS free users (no premium access)
  IF p_is_bot THEN
    SELECT get_free_player_ids() INTO v_free_player_ids;

    RETURN jsonb_build_object(
      'is_premium', false,
      'is_admin', false,
      'is_bot', true,
      'free_player_ids', v_free_player_ids,
      'user_id', NULL
    );
  END IF;

  -- Check authenticated user premium status
  IF p_user_id IS NOT NULL THEN
    -- Check manual premium override
    SELECT COALESCE(p.is_manual_premium, false)
    INTO v_manual_premium
    FROM public.profiles p
    WHERE p.id = p_user_id
    LIMIT 1;

    -- Check subscription status
    SELECT s.status
    INTO v_subscription_status
    FROM public.subscriptions s
    WHERE (s.profile_id = p_user_id OR s.user_id = p_user_id)
      AND s.status IN ('active', 'trialing')
      AND s.current_period_end > now()
    ORDER BY s.updated_at DESC
    LIMIT 1;

    -- Determine premium status
    v_is_premium := v_manual_premium OR v_subscription_status IS NOT NULL;

    -- Check admin status
    v_is_admin := is_admin_user();
  END IF;

  -- Get free player IDs
  SELECT get_free_player_ids() INTO v_free_player_ids;

  RETURN jsonb_build_object(
    'is_premium', v_is_premium,
    'is_admin', v_is_admin,
    'is_bot', false,
    'free_player_ids', v_free_player_ids,
    'user_id', p_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_access_context(uuid, boolean) IS 'Unified access resolver - returns isPremium, isBot, freePlayerIds. Bots ALWAYS get free access.';

GRANT EXECUTE ON FUNCTION public.get_access_context(uuid, boolean) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 2: Update get_team_players_safe to accept bot flag
-- ============================================================================

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

  -- Return players with access control
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating,

    -- Lock advanced data for non-accessible players (includes bots)
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score
      ELSE NULL
    END,

    -- Mark as locked
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

COMMENT ON FUNCTION public.get_team_players_safe(text, uuid, boolean) IS 'Returns team players with access control - bot-aware, locks advanced stats for non-accessible players';

-- ============================================================================
-- STEP 3: Update get_similar_players_safe to accept bot flag
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_similar_players_safe(
  p_player_id int,
  p_position text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5,
  p_is_bot boolean DEFAULT false
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  projection_final numeric,
  neeko_rating numeric,
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

  -- Return similar players with lock status
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.projection_final,
    c.neeko_rating,

    -- Mark as locked
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c."position" = p_position
    AND c.player_id != p_player_id
    AND c.player_id IS NOT NULL
    AND c.projection_final >= p_projection_min
    AND c.projection_final <= p_projection_max
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_similar_players_safe(int, text, numeric, numeric, uuid, int, boolean) IS 'Returns similar players with lock status - bot-aware';

-- ============================================================================
-- STEP 4: Update is_player_accessible to accept bot flag
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_player_accessible(
  p_player_id int,
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false
)
RETURNS boolean
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

  -- Premium users can access all players
  IF v_is_premium THEN
    RETURN true;
  END IF;

  -- Free users (including bots) can only access top 8
  v_free_ids := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);
  RETURN p_player_id = ANY(v_free_ids);
END;
$$;

COMMENT ON FUNCTION public.is_player_accessible(int, uuid, boolean) IS 'Single source of truth for player access - bot-aware, checks premium status or free tier (top 8)';

-- ============================================================================
-- STEP 5: Create bot-safe rankings view wrapper
-- ============================================================================

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
  best_value_score numeric,
  avg_last_3 numeric,
  avg_last_5 numeric,
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

  -- Return rankings with access control
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating,

    -- Premium fields with CASE statements (data-level protection)
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.best_value_score
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.avg_last_3
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.avg_last_5
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ceiling
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.floor
      ELSE NULL
    END,

    -- Mark as locked
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

COMMENT ON FUNCTION public.get_rankings_safe(uuid, boolean, int) IS 'Returns player rankings with access control - bot-aware, locks advanced stats for non-accessible players';

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 6: Create bot-safe market watch wrapper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_market_watch_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  price int,
  price_last_week int,
  price_change int,
  category text,
  signal_strength numeric,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  ai_why text,
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

  -- Return market watch data with access control
  RETURN QUERY
  SELECT
    mw.player_id,
    mw.player_name,
    mw.team,
    mw.position AS player_position,
    mw.price_current AS price,
    mw.price_last_week,
    mw.price_change,
    mw.category,
    mw.signal_strength,
    mw.projection_current AS projection_final,
    mw.neeko_rating,

    -- Premium fields with CASE statements
    CASE
      WHEN v_is_premium OR mw.player_id = ANY(v_free_ids) THEN mw.summary
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR mw.player_id = ANY(v_free_ids) THEN mw.ai_why
      ELSE NULL
    END,

    -- Mark as locked
    CASE
      WHEN v_is_premium OR mw.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM market.v_mw_premium mw
  WHERE (p_category IS NULL OR mw.category = p_category)
    AND mw.player_id IS NOT NULL
  ORDER BY mw.signal_strength DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_market_watch_safe(uuid, boolean, text) IS 'Returns market watch data with access control - bot-aware';

GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, text) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 7: Update grants to maintain compatibility
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_similar_players_safe(int, text, numeric, numeric, uuid, int, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_player_accessible(int, uuid, boolean) TO anon, authenticated, service_role;
