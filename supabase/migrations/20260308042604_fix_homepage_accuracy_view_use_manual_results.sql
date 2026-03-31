/*
  # Fix Homepage Accuracy View — Use Manual Projection Results

  ## Problem
  v_projection_accuracy_homepage was returning the auto-computed join (167 players,
  avg_error 17.46) instead of the curated manual_projection_results table which
  contains the correct validated dataset (176 players, avg_error 16.26).

  The UNION ALL preferred the auto row first because it was non-zero, so the manual
  data was never surfaced.

  ## Fix
  Rebuild v_projection_accuracy_homepage to source directly from
  afl.manual_projection_results when it has data, falling back to the auto view.

  ## No projection logic is changed — only the homepage view.
*/

CREATE OR REPLACE VIEW afl.v_projection_accuracy_homepage AS
SELECT
  players_analysed,
  avg_error,
  within_10,
  within_15,
  within_20,
  'manual' AS source
FROM afl.v_projection_accuracy_manual
WHERE players_analysed > 0

UNION ALL

SELECT
  players_analysed,
  avg_error,
  within_10,
  within_15,
  within_20,
  'auto' AS source
FROM afl.v_projection_accuracy_round
WHERE players_analysed > 0

LIMIT 1;

GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;
