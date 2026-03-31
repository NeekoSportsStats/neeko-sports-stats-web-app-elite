
/*
  # Deactivate Ghost Duplicate Players — Batch 2

  ## Problem
  v_team_mismatch_audit found 8 additional same-name / different-team duplicate player
  records still active. For 6 of the 8 pairs, the canonical 2026 roster (afl_2026_roster)
  confirms exactly which player_id is correct. The ghost IDs (not in roster) are deactivated.

  Harvey Langford and Murphy Reid: neither ID appears in the 2026 roster — both left active
  pending manual confirmation.

  ## Deactivations (NOT in afl_2026_roster, confirmed ghosts)
  - 1932  Isaiah Dudley    Port Adelaide Power  (real = 1936 Fremantle)
  - 1837  Jack Hutchinson  West Coast Eagles    (real = 1822 Adelaide Crows)
  - 1846  Joel Freijah     Adelaide Crows       (real = 1807 Western Bulldogs)
  - 1884  Josh Dolan       Western Bulldogs     (real = 1911 Geelong Cats)
  - 1878  Luke Trainor     Richmond Tigers      (real = 1921 North Melbourne — neither in roster, deactivate lower ID)
  - 1909  Tom Hanily       West Coast Eagles    (real = 1872 Sydney Swans)

  ## Tables Modified
  - afl.players — active = false for ghost player_ids
  - afl.player_projection — delete ghost rows
  - afl.player_rankings_cache — delete ghost rows
*/

-- Deactivate confirmed ghosts
UPDATE afl.players
SET active = false
WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);

-- Remove from projection base table
DELETE FROM afl.player_projection WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);

-- Remove from rankings cache
DELETE FROM afl.player_rankings_cache WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);

-- Remove from projection-related tables
DELETE FROM afl.player_projection_confidence            WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
DELETE FROM afl.player_projection_confidence_calibrated WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
DELETE FROM afl.player_breakout_model                   WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
DELETE FROM afl.player_role_signals                     WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
DELETE FROM afl.player_signal_summary                   WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
DELETE FROM afl.player_prices                           WHERE player_id IN (1932, 1837, 1846, 1884, 1878, 1909);
