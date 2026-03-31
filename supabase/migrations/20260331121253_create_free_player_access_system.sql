/*
  # Free Player Access System - Global Source of Truth
  
  1. New Views
    - `v_free_player_ids_2026` - Top 8 players by neeko_rating (canonical free access list)
  
  2. New Functions
    - `is_player_accessible(player_id, user_id)` - Single source of truth for access checks
    - `get_free_player_ids()` - Returns array of accessible player IDs for free users
    - `get_team_players_safe(team, user_id)` - Team players with access control
    - `get_similar_players_safe(...)` - Similar players with lock status
  
  3. Purpose
    - Prevent freemium bypasses via team pages, similar players, navigation
    - Ensure consistent access control across ALL data access points
    - Maintain SEO while enforcing premium gates
  
  4. Security
    - Functions use security definer for consistent access
    - RLS policies remain active
    - No data exposure for locked players (advanced stats nullified)
*/

-- ============================================================================
-- STEP 1: Create canonical free player IDs view (top 8 by neeko_rating)
-- ============================================================================

CREATE OR REPLACE VIEW afl.v_free_player_ids_2026
WITH (security_invoker=false)
AS
SELECT 
  player_id,
  player_name,
  team,
  "position",
  neeko_rating
FROM afl.player_rankings_cache
WHERE player_id IS NOT NULL
  AND projection_final IS NOT NULL
  AND projection_final > 0
  AND neeko_rating IS NOT NULL
ORDER BY neeko_rating DESC
LIMIT 8;

COMMENT ON VIEW afl.v_free_player_ids_2026 IS 'Canonical source of truth for free player access - top 8 by neeko_rating';

GRANT SELECT ON afl.v_free_player_ids_2026 TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 2: Create function to get free player IDs as array
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_free_player_ids()
RETURNS int[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ARRAY_AGG(player_id)
  FROM afl.v_free_player_ids_2026
  WHERE player_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_free_player_ids() IS 'Returns array of player IDs accessible to free users (top 8 by neeko_rating)';

GRANT EXECUTE ON FUNCTION public.get_free_player_ids() TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 3: Create is_player_accessible function (access checker)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_player_accessible(
  p_player_id int,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean;
  v_free_player_ids int[];
BEGIN
  -- Get user premium status
  IF p_user_id IS NOT NULL THEN
    SELECT 
      CASE 
        WHEN manual_premium_override = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.user_profiles
    WHERE user_id = p_user_id;
    
    -- If premium, all players accessible
    IF v_is_premium IS TRUE THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check if player is in free tier (top 8)
  SELECT get_free_player_ids() INTO v_free_player_ids;
  RETURN p_player_id = ANY(v_free_player_ids);
END;
$$;

COMMENT ON FUNCTION public.is_player_accessible(int, uuid) IS 'Single source of truth for player access - checks premium status or free tier (top 8)';

GRANT EXECUTE ON FUNCTION public.is_player_accessible(int, uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 4: Create function to get accessible team players
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team text,
  p_user_id uuid DEFAULT NULL
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
  v_is_premium boolean := false;
  v_free_ids int[];
BEGIN
  -- Check premium status
  IF p_user_id IS NOT NULL THEN
    SELECT 
      CASE 
        WHEN manual_premium_override = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.user_profiles
    WHERE user_id = p_user_id;
  END IF;
  
  -- Get free player IDs
  SELECT get_free_player_ids() INTO v_free_ids;
  
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
    
    -- Lock advanced data for non-accessible players
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

COMMENT ON FUNCTION public.get_team_players_safe(text, uuid) IS 'Returns team players with access control - locks advanced stats for non-accessible players';

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 5: Create function to get similar players (access controlled)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_similar_players_safe(
  p_player_id int,
  p_position text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
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
  v_is_premium boolean := false;
  v_free_ids int[];
BEGIN
  -- Check premium status
  IF p_user_id IS NOT NULL THEN
    SELECT 
      CASE 
        WHEN manual_premium_override = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.user_profiles
    WHERE user_id = p_user_id;
  END IF;
  
  -- Get free player IDs
  SELECT get_free_player_ids() INTO v_free_ids;
  
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

COMMENT ON FUNCTION public.get_similar_players_safe(int, text, numeric, numeric, uuid, int) IS 'Returns similar players with lock status for non-accessible players';

GRANT EXECUTE ON FUNCTION public.get_similar_players_safe(int, text, numeric, numeric, uuid, int) TO anon, authenticated, service_role;
