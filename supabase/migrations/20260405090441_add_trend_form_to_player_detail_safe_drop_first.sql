/*
  # Add trend/form columns to get_player_detail_safe RPC

  ## Changes
  - Drops and recreates `get_player_detail_safe` to include:
    - `trend_signal` (STRONG_UP | UP | STABLE | DOWN | STRONG_DOWN)
    - `trend_score` (projection_final - baseline)
    - `form_delta` (form_score - season_avg)
    - `form_label` (HOT | IN FORM | NORMAL | COLD | ICE COLD)
    - `season_avg` (season average fantasy points)
    - `last_3_avg` (last 3 games average)
  - All trend/form fields are gated the same as other premium fields
*/

DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);

CREATE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  player_id integer,
  player_name text,
  team text,
  team_name text,
  player_position text,
  position_group text,
  price integer,
  prev_price integer,
  price_change integer,
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
  games_played integer,
  recommendation_color text,
  recommendation_short text,
  summary_short text,
  summary_long text,
  upside_pct numeric,
  bye_round integer,
  manual_status text,
  captain_rating text,
  captain_score numeric,
  is_locked boolean,
  is_premium boolean,
  signal text,
  edge numeric,
  baseline numeric,
  trend_signal text,
  trend_score numeric,
  form_delta numeric,
  form_label text,
  season_avg numeric,
  last_3_avg numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean := false;
  v_free_ids   int[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN is_manual_premium = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.profiles
    WHERE id = p_user_id;
  END IF;

  SELECT get_free_player_ids() INTO v_free_ids;

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
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_color ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.recommendation_short, c.summary_short) ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END::numeric,
    c.bye_round,
    c.manual_status,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_rating ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.captain_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END,
    v_is_premium,
    c.signal,
    c.edge,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.baseline ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.trend_signal ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.trend_score ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.form_delta ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.form_label ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.season_avg ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.last_3_avg ELSE NULL END::numeric
  FROM afl.player_rankings_cache c
  WHERE LOWER(c.player_name) = LOWER(p_player_name)
  LIMIT 1;
END;
$$;
