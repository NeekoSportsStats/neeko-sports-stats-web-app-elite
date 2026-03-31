
/*
  # Restore Jonty Faull (Richmond) — Projection + Cache

  ## Problem
  player_id 1942 (Jonty Faull, Richmond Tigers) was removed from afl.player_projection
  in a prior migration that incorrectly treated him as a ghost. He has 17 real game
  entries (16 in 2025 + 1 in 2026) with genuine stats (no hitouts, forward/midfielder)
  and is a distinct player from player_id 1944 (Jonty Faull, WCE ruckman).

  ## Fix
  Re-seed player_projection for 1942 using computed averages from his actual game data:
  - season_avg: 39 pts
  - ceiling: 49 (p85)
  - floor: 26 (p15)
  - consistency: derived from stddev (13) relative to mean (39)
  - volatility: inverse of consistency
  - All multipliers default to neutral (1.0) — pipeline will refine on next scheduled run
*/

INSERT INTO afl.player_projection (
  player_id,
  projection_final,
  ceiling,
  floor,
  form_rating,
  matchup_rating,
  venue_rating,
  rest_rating,
  consistency_score,
  risk_rating,
  projection_confidence,
  generated_at,
  position_concession_multiplier,
  volatility_score,
  stability_score,
  pace_multiplier,
  venue_position_multiplier
)
SELECT
  1942,
  -- projection_final: blend of season avg (60%) and last3 avg (40%)
  round((39.0 * 0.60) + (45.0 * 0.40), 2),
  -- ceiling (p85 from actual data)
  49,
  -- floor (p15 from actual data)
  26,
  -- form_rating: last3 avg
  45.0,
  -- matchup_rating: neutral
  1.0,
  -- venue_rating: neutral
  1.0,
  -- rest_rating: neutral
  1.0,
  -- consistency_score: 100 - (stddev/mean * 100), clamped 0–100
  LEAST(100, GREATEST(0, round(100.0 - (13.0 / NULLIF(39.0, 0) * 100)))),
  -- risk_rating
  'MEDIUM',
  -- projection_confidence: moderate for 16+ games
  55.0,
  now(),
  -- position_concession_multiplier: neutral
  1.0,
  -- volatility_score: inverse of consistency
  LEAST(100, GREATEST(0, round(13.0 / NULLIF(39.0, 0) * 100))),
  -- stability_score: same as consistency
  LEAST(100, GREATEST(0, round(100.0 - (13.0 / NULLIF(39.0, 0) * 100)))),
  -- pace_multiplier: neutral
  1.0,
  -- venue_position_multiplier: neutral
  1.0
WHERE NOT EXISTS (
  SELECT 1 FROM afl.player_projection WHERE player_id = 1942
);
