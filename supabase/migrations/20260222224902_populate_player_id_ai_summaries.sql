
/*
  # Populate player_id in ai_player_summaries

  ## Summary
  Back-fills player_id on all existing rows using a team + player name join
  against afl.players. One known outlier (Callum M. Brown / GWS Giants, round 0)
  has a name/team format mismatch and is resolved via direct assignment using
  player_id=705 (Callum Brown / Greater Western Sydney).

  ## Changes
  - UPDATE afl.ai_player_summaries: set player_id via join on afl.players
  - Direct fix for the one unresolvable name-format mismatch row

  ## Notes
  - No rows deleted, no data lost
  - Only player_id column is written
*/

UPDATE afl.ai_player_summaries s
SET player_id = p.player_id
FROM afl.players p
WHERE s.player = p.player_name
  AND s.team = p.team
  AND s.player_id IS NULL;

UPDATE afl.ai_player_summaries
SET player_id = 705
WHERE player = 'Callum M. Brown'
  AND team = 'Greater Western Sydney Giants'
  AND player_id IS NULL;
