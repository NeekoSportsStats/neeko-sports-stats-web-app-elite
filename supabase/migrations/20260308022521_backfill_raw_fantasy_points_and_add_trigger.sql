/*
  # Backfill raw_2026_player_stats fantasy_points + add auto-compute trigger

  ## Summary
  The raw ingestion table `afl.raw_2026_player_stats` stores API-delivered box-score
  stats but receives `fantasy_points = 0` from the source API. The existing
  `afl.set_fantasy_points()` function already has the correct AFL scoring formula
  and is used by the canonical transform. This migration:

  1. Backfills `fantasy_points` for all existing rows where it is 0 but stat
     columns are populated (kicks / handballs etc.), using the existing
     `afl.set_fantasy_points()` function.

  2. Creates a BEFORE INSERT OR UPDATE trigger on `afl.raw_2026_player_stats` that
     automatically computes and writes `fantasy_points` whenever a row is inserted
     or updated with a zero / null score but non-zero stats. This ensures every
     future ingest round is scored without any manual step.

  ## Scoring rules applied (via afl.set_fantasy_points)
    Kick           × 3
    Handball       × 2
    Mark           × 3
    Tackle         × 4
    Hitout         × 1
    Goal           × 6
    Behind         × 1
    Free Kick For  × 1
    Free Kick Agst × -3

  ## Tables modified
    - `afl.raw_2026_player_stats` — fantasy_points backfilled, trigger added

  ## New objects
    - Function: `afl.fn_auto_compute_raw_fantasy_points()` — trigger function
    - Trigger:  `trg_raw_player_stats_compute_fantasy_points` on raw_2026_player_stats
*/

-- ── 1. Backfill existing Round 0 rows ────────────────────────────────────────
UPDATE afl.raw_2026_player_stats
SET fantasy_points = afl.set_fantasy_points(
  kicks,
  handballs,
  marks,
  tackles,
  hitouts,
  goals,
  behinds,
  free_kicks_for,
  free_kicks_against
)
WHERE fantasy_points = 0
  AND (
    COALESCE(kicks, 0) + COALESCE(handballs, 0) + COALESCE(marks, 0)
    + COALESCE(tackles, 0) + COALESCE(goals, 0) + COALESCE(behinds, 0)
    + COALESCE(hitouts, 0)
  ) > 0;

-- ── 2. Trigger function — runs on every INSERT or UPDATE ─────────────────────
CREATE OR REPLACE FUNCTION afl.fn_auto_compute_raw_fantasy_points()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.fantasy_points, 0) = 0 THEN
    NEW.fantasy_points := afl.set_fantasy_points(
      NEW.kicks,
      NEW.handballs,
      NEW.marks,
      NEW.tackles,
      NEW.hitouts,
      NEW.goals,
      NEW.behinds,
      NEW.free_kicks_for,
      NEW.free_kicks_against
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Attach trigger to raw table ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_raw_player_stats_compute_fantasy_points
  ON afl.raw_2026_player_stats;

CREATE TRIGGER trg_raw_player_stats_compute_fantasy_points
  BEFORE INSERT OR UPDATE ON afl.raw_2026_player_stats
  FOR EACH ROW
  EXECUTE FUNCTION afl.fn_auto_compute_raw_fantasy_points();
