
/*
  # Fix Jonty Faull — Deactivate Richmond Ghost Player

  ## Problem
  There are two player records named "Jonty Faull":
  - player_id 1942 — team_id 12 (Richmond Tigers) — NOT in afl_2026_roster, stale duplicate
  - player_id 1944 — team_id 15 (West Coast Eagles) — IS in afl_2026_roster, the real 2026 player

  The Richmond record (1942) was an incorrect ingest artifact. It has no games in the 2026 season
  under the correct game data, and the afl_2026_roster canonical table only contains player_id 1944
  (WCE). The stale record was polluting the rankings, player lab, and AI input views with a
  duplicate Jonty Faull at Richmond.

  ## Changes
  1. Mark player_id 1942 as inactive (safe — preserves historical stats, just hides from live rankings)
  2. Remove stale player_prices rows for 1942 (incorrectly duplicated from the name-based price import)
  3. Delete from player_rankings_cache for player_id 1942
  4. Create v_team_mismatch_audit view to detect future name-collision issues

  ## Tables Modified
  - afl.players — active = false for player_id 1942
  - afl.player_prices — remove rows for player_id 1942
  - afl.player_rankings_cache — remove rows for player_id 1942

  ## New Objects
  - afl.v_team_mismatch_audit — finds players with same name mapped to multiple teams
*/

-- Step 1: Mark the Richmond ghost as inactive
UPDATE afl.players
SET active = false
WHERE player_id = 1942
  AND player_name = 'Jonty Faull';

-- Step 2: Remove the stale price rows for the ghost player
-- These were copied over because the name-based import matched "Jonty Faull" twice
DELETE FROM afl.player_prices
WHERE player_id = 1942;

-- Step 3: Remove from rankings cache so UI clears immediately
DELETE FROM afl.player_rankings_cache
WHERE player_id = 1942;

-- Step 4: Remove from player_projection if present
DELETE FROM afl.player_projection
WHERE player_id = 1942;

-- Step 5: Remove from AI analysis table if present
DELETE FROM public.ai_player_analysis
WHERE player_id = 1942;

-- Step 6: Create audit view to detect future name-collision / team-mismatch issues
CREATE OR REPLACE VIEW afl.v_team_mismatch_audit
WITH (security_invoker = true)
AS
SELECT
  vcp.player_name,
  COUNT(DISTINCT vcp.team_id)   AS team_count,
  array_agg(DISTINCT vcp.team_name ORDER BY vcp.team_name) AS teams,
  array_agg(DISTINCT vcp.player_id ORDER BY vcp.player_id) AS player_ids,
  COUNT(DISTINCT vcp.player_id) AS record_count
FROM afl.v_current_player_team vcp
JOIN afl.players p ON p.player_id = vcp.player_id AND p.active = true
GROUP BY vcp.player_name
HAVING COUNT(DISTINCT vcp.team_id) > 1
ORDER BY vcp.player_name;

GRANT SELECT ON afl.v_team_mismatch_audit TO authenticated;
