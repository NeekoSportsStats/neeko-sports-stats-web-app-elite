/*
  # Create Player Identity Anomaly Detector

  ## Purpose
  Automatically detects API mislabelling of players by scanning afl.player_games
  for rows where the same player_id has been recorded with multiple names or team IDs.

  ## New Views
  - `admin.v_player_identity_issues`
    - player_id: the affected player
    - name_variants: count of distinct names recorded for this player_id
    - team_variants: count of distinct team_ids recorded for this player_id
    - rows: total game rows for this player
    - variant_names: array of all name variants seen (for debugging)
    - variant_teams: array of all team names seen (for debugging)
    - has_override: whether a manual override already exists in player_identity_overrides
    - severity: 'critical' if both name and team vary, 'warning' otherwise

  ## Security
  - View is in admin schema, readable by service_role and authenticated admins
  - No RLS needed as admin schema views are already restricted
*/

CREATE OR REPLACE VIEW admin.v_player_identity_issues AS
SELECT
  pg.player_id,
  COUNT(DISTINCT pg.player_name)                        AS name_variants,
  COUNT(DISTINCT pg.team_id)                            AS team_variants,
  COUNT(*)                                              AS rows,
  ARRAY_AGG(DISTINCT pg.player_name ORDER BY pg.player_name) AS variant_names,
  ARRAY_AGG(DISTINCT pg.team_name   ORDER BY pg.team_name)   AS variant_teams,
  (o.player_id IS NOT NULL)                             AS has_override,
  CASE
    WHEN COUNT(DISTINCT pg.player_name) > 1
     AND COUNT(DISTINCT pg.team_id)    > 1 THEN 'critical'
    ELSE 'warning'
  END                                                   AS severity
FROM afl.player_games pg
LEFT JOIN afl.player_identity_overrides o ON o.player_id = pg.player_id
GROUP BY pg.player_id, o.player_id
HAVING
  COUNT(DISTINCT pg.player_name) > 1
  OR COUNT(DISTINCT pg.team_id)  > 1
ORDER BY severity DESC, name_variants DESC, team_variants DESC;

GRANT SELECT ON admin.v_player_identity_issues TO service_role;
