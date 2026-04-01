/*
  # Create Missing Safe Data Access RPCs

  Creates only the missing RPC functions:
  - get_player_detail_safe - for individual player pages
  - get_position_players_safe - for position rankings pages
  
  Note: get_team_players_safe already exists and is working correctly
*/

-- Drop existing functions if they exist to allow recreation
DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, int);

-- ============================================================================
-- Create get_player_detail_safe function
-- ============================================================================

CREATE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  team_name text,
  player_position text,
  position_group text,
  price int,
  prev_price int,
  price_change int,
  price_change_pct numeric,
  projection_final numeric,
  projection_confidence numeric,
  ceiling numeric,
  floor numeric,
  consistency numeric,
  form_score numeric,
  neeko_rating numeric,
  neeko_rating_scaled numeric,
  value_score numeric,
  best_value_score numeric,
  value_tag text,
  value_tier text,
  breakeven numeric,
  avg_last_3 numeric,
  avg_last_5 numeric,
  season_avg numeric,
  games_played int,
  ai_recommendation text,
  recommendation_color text,
  recommendation_short text,
  summary_short text,
  summary_long text,
  upside_pct numeric,
  bye_round int,
  manual_status text,
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

  -- Return player data with access control
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
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ceiling ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.floor ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.consistency ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.form_score ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.best_value_score ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tag ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.breakeven ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.avg_last_3 ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.avg_last_5 ELSE NULL END,
    c.season_avg,
    c.games_played,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END,
    c.bye_round,
    c.manual_status,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END
  FROM afl.player_rankings_cache c
  WHERE LOWER(c.player_name) = LOWER(p_player_name)
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_player_detail_safe(text, uuid) IS 'Returns single player detail with access control - locks premium fields for non-accessible players';

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- Create get_position_players_safe function
-- ============================================================================

CREATE FUNCTION public.get_position_players_safe(
  p_position_code text,
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  player_id int,
  player_name text,
  team text,
  player_position text,
  neeko_rating numeric,
  projection_final numeric,
  projection_confidence numeric,
  value_score numeric,
  price int,
  ai_recommendation text,
  recommendation_color text,
  upside_pct numeric,
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

  -- Return position players with access control
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.neeko_rating,
    c.projection_final,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score ELSE NULL END,
    c.price,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END
  FROM afl.player_rankings_cache c
  WHERE c."position" = p_position_code
    AND c.player_id IS NOT NULL
    AND c.projection_final IS NOT NULL
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_position_players_safe(text, uuid, int) IS 'Returns position rankings with access control - locks premium fields for non-accessible players';

GRANT EXECUTE ON FUNCTION public.get_position_players_safe(text, uuid, int) TO anon, authenticated, service_role;
