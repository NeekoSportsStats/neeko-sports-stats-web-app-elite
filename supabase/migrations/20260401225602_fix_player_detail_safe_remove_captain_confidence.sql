/*
  # Fix get_player_detail_safe - Remove Non-Existent captain_confidence Column

  The previous migration referenced captain_confidence which doesn't exist in player_rankings_cache.
  Available columns are: captain_score and captain_rating.

  Changes:
  1. Remove captain_confidence from return structure
  2. Use only columns that actually exist
*/

-- ============================================================================
-- Fix get_player_detail_safe - Remove captain_confidence
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);

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
  games_played int,
  ai_recommendation text,
  recommendation_color text,
  recommendation_short text,
  summary_short text,
  summary_long text,
  upside_pct numeric,
  bye_round int,
  manual_status text,
  captain_rating text,
  captain_score numeric,
  is_locked boolean,
  is_premium boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean := false;
  v_free_ids int[];
BEGIN
  -- Check premium status using correct table: public.profiles
  IF p_user_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN manual_premium_override = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.profiles
    WHERE id = p_user_id;
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
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ceiling ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.floor ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.consistency ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.form_score ELSE NULL END::numeric,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.best_value_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tag ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_tier ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.breakeven ELSE NULL END::numeric,
    c.games_played,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_recommendation ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END::numeric,
    c.bye_round,
    c.manual_status,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_rating ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END,
    v_is_premium
  FROM afl.player_rankings_cache c
  WHERE LOWER(c.player_name) = LOWER(p_player_name)
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_player_detail_safe(text, uuid) IS 'Returns single player detail with access control - sources from afl.player_rankings_cache, uses public.profiles for premium check';

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO anon, authenticated, service_role;