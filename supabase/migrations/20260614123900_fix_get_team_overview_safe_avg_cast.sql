
-- Fix get_team_overview_safe: cast AVG to numeric before ROUND
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
    ROUND(AVG(c.projection_final)::numeric, 1) AS avg_projection,
    ROUND(AVG(c.neeko_rating)::numeric, 1) AS avg_neeko_rating,
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
