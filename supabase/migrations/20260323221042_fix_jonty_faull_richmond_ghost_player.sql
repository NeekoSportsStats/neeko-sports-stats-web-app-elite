
/*
  # Targeted Identity Correction — 3 Players

  ## Analysis Summary

  ### Jonty Faull
  - player_id 1942 (Richmond Tigers): real player, 16 games in 2025 + 1 in 2026, no hitouts (forward/midfielder)
  - player_id 1944 (West Coast Eagles): real player, 15 games in 2025 + 2 in 2026, 13–40 hitouts (ruckman)
  - These are TWO DIFFERENT REAL PEOPLE with the same name.
  - player_id 1942 was incorrectly deactivated in a prior migration — REACTIVATE IT.
  - Restore prices for 1942, restore player_projection, reactivate in players table.
  - The 2026 roster only lists 1944 (WCE) because WCE Faull is the fantasy-targeted player,
    but Richmond Faull is genuinely active and must be visible in the system.

  ### Harvey Langford
  - player_id 1891 (Melbourne Demons): canonical player, 23 games in 2025 + 2 in 2026
  - player_id 1931 (Western Bulldogs): ghost, 1 row week 23 / 0 disposals / 0 goals / 0 fantasy
  - player_id 1891 already has a real week 23 entry (11 disposals, 45 pts)
  - Action: delete the 1931 ghost game row, deactivate 1931 in players

  ### Murphy Reid
  - player_id 1903 (Fremantle Dockers): canonical player, 24 games in 2025 + 2 in 2026
  - player_id 1907 (Western Bulldogs): ghost, 4 rows
    - weeks 2, 10, 11: all 0 stats — 1903 already has real entries for those weeks → delete
    - week 13: 5 disposals / 26 fantasy — 1903 has no week 13 entry → remap to 1903 + Fremantle
  - Action: remap week 13 row to 1903/Fremantle, delete weeks 2/10/11 ghost rows, deactivate 1907

  ## Tables Modified
  - afl.players — reactivate 1942, deactivate 1931 and 1907
  - afl.player_games — delete 4 ghost rows, remap 1 misassigned row
  - afl.player_prices — restore prices for 1942
*/

-- ─── JONTY FAULL — REACTIVATE RICHMOND PLAYER ────────────────────────────────

-- Reactivate player_id 1942 (Richmond Tigers Jonty Faull)
UPDATE afl.players
SET active = true
WHERE player_id = 1942 AND player_name = 'Jonty Faull';

-- Restore season start price for Richmond Faull if missing
INSERT INTO afl.player_prices (player_id, price, season, round, status, created_at, updated_at)
SELECT 1942, 370000, 2026, 0, 'ACTIVE', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM afl.player_prices WHERE player_id = 1942 AND season = 2026 AND round = 0
);

-- ─── HARVEY LANGFORD — DELETE GHOST ROW ─────────────────────────────────────

-- Delete the 1931 ghost game row (0 stats, week 23, 2025 — 1891 already has a real entry)
DELETE FROM afl.player_games
WHERE player_id = 1931
  AND player_name = 'Harvey Langford'
  AND season = 2025
  AND week = 23;

-- Deactivate ghost player record
UPDATE afl.players
SET active = false
WHERE player_id = 1931 AND player_name = 'Harvey Langford';

-- Clean ghost from downstream tables
DELETE FROM afl.player_prices                           WHERE player_id = 1931;
DELETE FROM afl.player_rankings_cache                  WHERE player_id = 1931;
DELETE FROM afl.player_projection                      WHERE player_id = 1931;
DELETE FROM afl.player_projection_confidence           WHERE player_id = 1931;
DELETE FROM afl.player_projection_confidence_calibrated WHERE player_id = 1931;
DELETE FROM afl.player_breakout_model                  WHERE player_id = 1931;
DELETE FROM afl.player_role_signals                    WHERE player_id = 1931;
DELETE FROM afl.player_signal_summary                  WHERE player_id = 1931;
DELETE FROM afl.players_raw WHERE player_id = 1931 AND NOT EXISTS (
  SELECT 1 FROM afl.player_games WHERE player_id = 1931
);

-- ─── MURPHY REID — REMAP WEEK 13, DELETE GHOST ROWS ─────────────────────────

-- Remap week 13 row from ghost 1907/WBD to canonical 1903/FRE
-- (1903 has no week 13 entry — this row contains real stats: 5 disposals, 26 fantasy)
UPDATE afl.player_games
SET
  player_id = 1903,
  team_id   = 6,
  team_name = 'Fremantle Dockers'
WHERE player_id = 1907
  AND player_name = 'Murphy Reid'
  AND season = 2025
  AND week = 13;

-- Delete weeks 2, 10, 11 ghost rows (1903 already has real entries for those weeks)
DELETE FROM afl.player_games
WHERE player_id = 1907
  AND player_name = 'Murphy Reid'
  AND season = 2025
  AND week IN (2, 10, 11);

-- Deactivate ghost player record
UPDATE afl.players
SET active = false
WHERE player_id = 1907 AND player_name = 'Murphy Reid';

-- Clean ghost from downstream tables
DELETE FROM afl.player_prices                           WHERE player_id = 1907;
DELETE FROM afl.player_rankings_cache                  WHERE player_id = 1907;
DELETE FROM afl.player_projection                      WHERE player_id = 1907;
DELETE FROM afl.player_projection_confidence           WHERE player_id = 1907;
DELETE FROM afl.player_projection_confidence_calibrated WHERE player_id = 1907;
DELETE FROM afl.player_breakout_model                  WHERE player_id = 1907;
DELETE FROM afl.player_role_signals                    WHERE player_id = 1907;
DELETE FROM afl.player_signal_summary                  WHERE player_id = 1907;
DELETE FROM afl.players_raw WHERE player_id = 1907 AND NOT EXISTS (
  SELECT 1 FROM afl.player_games WHERE player_id = 1907
);
