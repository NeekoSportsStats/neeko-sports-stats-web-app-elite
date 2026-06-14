
-- Patch all RPCs and internal views that query player_rankings_cache directly
-- to exclude placeholder identities (player_name LIKE 'Player#%').

-- 1. afl.v_rankings_unified — internal view, used by captain RPC and others
CREATE OR REPLACE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,
  price::numeric AS price,
  prev_price::numeric AS prev_price,
  price_change::numeric AS price_change,
  price_change_pct,
  projection_final,
  projection_final AS projection,
  projection_confidence::numeric AS projection_confidence,
  confidence_tier,
  confidence_label,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate::numeric AS ceiling_estimate,
  floor_estimate::numeric AS floor_estimate,
  breakeven_canonical,
  breakeven_canonical AS breakeven,
  edge_canonical,
  edge_canonical AS edge,
  edge_canonical AS value_score,
  signal_canonical,
  signal_canonical AS signal,
  signal_canonical AS signal_tag,
  signal_display,
  category_canonical,
  category_canonical AS category,
  action_canonical,
  action_canonical AS action,
  action_display,
  trend_score,
  trend_signal,
  form_score::numeric AS form_score,
  form_delta,
  form_label,
  neeko_rating::numeric AS neeko_rating,
  neeko_rating::numeric AS neeko_rating_scaled,
  consistency::numeric AS consistency,
  consistency_tier,
  upside_rating::numeric AS upside_rating,
  upside_pct::numeric AS upside_pct,
  risk_rating::numeric AS risk_rating,
  captain_score::numeric AS captain_score,
  captain_rating,
  matchup_label,
  matchup_multiplier,
  summary_short,
  summary_short AS why,
  summary_long,
  summary_long AS why_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round::numeric AS bye_round,
  bye_next_round,
  games_played::numeric AS games_played,
  UPPER(COALESCE(manual_status, status, '')) = ANY (ARRAY['INJURED', 'OUT', 'OMITTED']) AS is_injured,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  total_count::bigint AS total_count,
  decision_score,
  confidence_score_100,
  confidence_percentile,
  value_band,
  action_reason_1,
  action_reason_2,
  confidence_reason_1,
  confidence_reason_2
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL
  AND projection_final > 30::numeric
  AND player_name NOT LIKE 'Player#%';

-- 2. get_captain_recommendations_free(p_limit) — direct cache query
CREATE OR REPLACE FUNCTION public.get_captain_recommendations_free(p_limit integer DEFAULT 5)
RETURNS TABLE(
  player_id text, player_name text, player_team text, player_position text,
  projection_final numeric, ceiling_estimate numeric, consistency_score numeric,
  captain_score numeric, captain_rating text, captain_confidence numeric
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
SELECT
  c.player_id::text,
  c.player_name::text,
  c.team                                          AS player_team,
  c.position                                      AS player_position,
  c.projection_final,
  COALESCE(c.ceiling_estimate, c.ceiling)::numeric AS ceiling_estimate,
  c.consistency::numeric                           AS consistency_score,
  c.captain_score::numeric                         AS captain_score,
  c.captain_rating::text                           AS captain_rating,
  COALESCE(c.projection_confidence, 70)::numeric   AS captain_confidence
FROM afl.player_rankings_cache c
WHERE c.captain_score IS NOT NULL
  AND c.captain_score > 0
  AND UPPER(COALESCE(c.manual_status, c.status, '')) NOT IN ('INJURED', 'OUT', 'OMITTED')
  AND COALESCE(c.is_bye, false) = false
  AND c.projection_final IS NOT NULL
  AND c.player_name NOT LIKE 'Player#%'
ORDER BY c.captain_score DESC NULLS LAST
LIMIT p_limit;
$$;

-- 3. search_available_players — direct cache query
CREATE OR REPLACE FUNCTION public.search_available_players(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  player_id bigint, player_name text, team text, player_pos text,
  projection_final numeric, neeko_rating numeric, is_available boolean,
  status text, is_bye boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
BEGIN
  IF v_query = '' THEN
    RETURN QUERY
    SELECT
      c.player_id::bigint,
      c.player_name,
      c.team,
      c.position          AS player_pos,
      c.projection_final,
      c.neeko_rating::numeric,
      COALESCE(c.is_available, true) AS is_available,
      c.status,
      COALESCE(c.is_bye, false)      AS is_bye
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND c.player_name IS NOT NULL
      AND COALESCE(c.is_available, true) = true
      AND c.player_name NOT LIKE 'Player#%'
    ORDER BY c.neeko_rating DESC NULLS LAST
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      c.player_id::bigint,
      c.player_name,
      c.team,
      c.position          AS player_pos,
      c.projection_final,
      c.neeko_rating::numeric,
      COALESCE(c.is_available, true) AS is_available,
      c.status,
      COALESCE(c.is_bye, false)      AS is_bye
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND c.player_name IS NOT NULL
      AND c.player_name ILIKE '%' || v_query || '%'
      AND COALESCE(c.is_available, true) = true
      AND c.player_name NOT LIKE 'Player#%'
    ORDER BY c.neeko_rating DESC NULLS LAST
    LIMIT p_limit;
  END IF;
END;
$$;

-- 4. get_team_overview_safe — direct cache query (including subquery for top_player_name)
CREATE OR REPLACE FUNCTION public.get_team_overview_safe(
  p_team text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  team_name text, total_players bigint, avg_projection numeric,
  avg_neeko_rating numeric, top_player_name text, top_player_projection numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_team AS team_name,
    COUNT(*)::bigint AS total_players,
    ROUND(AVG(c.projection_final), 1) AS avg_projection,
    ROUND(AVG(c.neeko_rating), 1) AS avg_neeko_rating,
    (
      SELECT player_name
      FROM afl.player_rankings_cache
      WHERE team = p_team
        AND player_name NOT LIKE 'Player#%'
      ORDER BY neeko_rating DESC NULLS LAST
      LIMIT 1
    ) AS top_player_name,
    (
      SELECT projection_final
      FROM afl.player_rankings_cache
      WHERE team = p_team
        AND player_name NOT LIKE 'Player#%'
      ORDER BY neeko_rating DESC NULLS LAST
      LIMIT 1
    ) AS top_player_projection
  FROM afl.player_rankings_cache c
  WHERE c.team = p_team
    AND c.player_name NOT LIKE 'Player#%';
END;
$$;
