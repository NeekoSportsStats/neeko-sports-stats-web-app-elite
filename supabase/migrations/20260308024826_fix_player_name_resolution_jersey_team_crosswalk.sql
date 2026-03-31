/*
  # Fix: Player Name Resolution for 2026 Raw Stats

  ## Problem
  197 of 208 rows in afl.raw_2026_player_stats have placeholder names
  like "Player#1059" because the API-sports ingest does not include player
  names in its stats payload — only player IDs and jersey numbers.

  The fix is a two-step crosswalk:
    1. Normalise the long team names from the API ("Carlton Blues" → "Carlton")
       to match the short names used in afl.players_canonical.
    2. Join on jumper_number + normalised team to resolve the real player name,
       position, and internal player_id.

  ## Team Name Normalisation Map
  API name               → Canonical name
  Carlton Blues          → Carlton
  Sydney Swans           → Sydney
  Geelong Cats           → Geelong
  Gold Coast Suns        → Gold Coast
  Greater Western Sydney Giants → Greater Western Sydney
  Hawthorn Hawks         → Hawthorn
  Brisbane Lions         → Brisbane
  (Western Bulldogs matches already)

  ## Changes
  - UPDATE afl.raw_2026_player_stats: resolve player_name, position
    from players_canonical via jersey_number + normalised team
  - Safe: only updates rows where player_name LIKE 'Player#%'
  - No schema changes, no drops

  ## Expected Result
  Majority of 197 placeholder rows resolved to real player names.
*/

UPDATE afl.raw_2026_player_stats AS s
SET
  player_name = pc.player_name,
  position    = pc.position
FROM afl.players_canonical pc
WHERE s.player_name LIKE 'Player#%'
  AND pc.jumper_number = (s.api_payload->'player'->>'number')::numeric
  AND pc.season = 2026
  AND pc.team = CASE s.team
    WHEN 'Carlton Blues'                    THEN 'Carlton'
    WHEN 'Sydney Swans'                     THEN 'Sydney'
    WHEN 'Geelong Cats'                     THEN 'Geelong'
    WHEN 'Gold Coast Suns'                  THEN 'Gold Coast'
    WHEN 'Greater Western Sydney Giants'    THEN 'Greater Western Sydney'
    WHEN 'Hawthorn Hawks'                   THEN 'Hawthorn'
    WHEN 'Brisbane Lions'                   THEN 'Brisbane'
    WHEN 'Adelaide Crows'                   THEN 'Adelaide'
    WHEN 'Richmond Tigers'                  THEN 'Richmond'
    WHEN 'Collingwood Magpies'              THEN 'Collingwood'
    WHEN 'Melbourne Demons'                 THEN 'Melbourne'
    WHEN 'North Melbourne Kangaroos'        THEN 'North Melbourne'
    WHEN 'Essendon Bombers'                 THEN 'Essendon'
    WHEN 'Fremantle Dockers'                THEN 'Fremantle'
    WHEN 'Port Adelaide Power'              THEN 'Port Adelaide'
    WHEN 'St Kilda Saints'                  THEN 'St Kilda'
    WHEN 'West Coast Eagles'                THEN 'West Coast'
    ELSE s.team
  END;
