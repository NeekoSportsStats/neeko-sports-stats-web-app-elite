/*
  # Patch source tables: players and players_raw for identity overrides

  ## Changes
  1. Update afl.players.player_name for player_id 1944 → 'Matthew Flynn'
     (player_id 1942 is already correct as 'Jonty Faull')
  2. Update afl.players_raw.player_name for all rows where player_id = 1944
  3. Update afl.player_games to correct all historical rows for player_id 1944

  ## Why source tables are patched
  - afl.mv_player_projection reads player_name directly from afl.players
  - fn_sync_player_games_from_raw resolves player_name from afl.players at sync time
  - Patching the source means all future pipeline runs auto-correct without joins
  - The override table acts as a permanent backup/guard layer on top

  ## Safety
  - No rows are deleted
  - No player_id values are changed
  - Only player_name (and position where applicable) is corrected
*/

UPDATE afl.players
SET player_name = 'Matthew Flynn',
    position_group = 'RUC'
WHERE player_id = 1944;

UPDATE afl.players_raw
SET player_name = 'Matthew Flynn'
WHERE player_id = 1944;

UPDATE afl.player_games
SET player_name = 'Matthew Flynn'
WHERE player_id = 1944;
