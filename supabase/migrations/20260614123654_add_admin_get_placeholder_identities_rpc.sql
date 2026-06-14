
-- Admin RPC to list all Player# placeholder identities directly from the raw cache table
-- This bypasses the public view filter so admins can see and manage them.
CREATE OR REPLACE FUNCTION public.admin_get_placeholder_identities()
RETURNS TABLE(
  player_id    integer,
  player_name  text,
  team_name    text,
  "position"   text,
  games_played integer,
  season_avg   numeric,
  projection   numeric,
  price        numeric,
  jumper_number integer
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
SELECT
  prc.player_id,
  prc.player_name,
  prc.team_name,
  prc.position,
  prc.games_played,
  ROUND(prc.season_avg::numeric, 1) AS season_avg,
  ROUND(prc.projection::numeric, 1) AS projection,
  prc.price,
  (
    SELECT r.player_number
    FROM afl.raw_player_stats r
    WHERE r.player_id = prc.player_id
      AND r.season = 2026
      AND r.player_number IS NOT NULL
    LIMIT 1
  ) AS jumper_number
FROM afl.player_rankings_cache prc
WHERE prc.player_name LIKE 'Player#%'
ORDER BY prc.games_played DESC, prc.projection DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_placeholder_identities() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_get_placeholder_identities() TO service_role;
