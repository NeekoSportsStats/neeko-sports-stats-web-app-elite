/*
  # Fix Rankings Engine Formula Bugs — Part 1

  ## Summary
  Patches three dimensional formula bugs in the rankings engine:

  1. **upside_rating always = 100**
     `breakout_probability` from `v_ai_player_metrics` is already on a ~93–109 scale.
     The cache populate function multiplied it by 100 again before clamping, making
     every player land at 100. Fix: remove the `* 100` multiplier.

  2. **projection_confidence structurally floored at ~47**
     The formula used `matchup_multiplier * 100 * 0.25 + pace_multiplier * 100 * 0.15`,
     treating ratios near 1.0 as if they were percentages, injecting a fixed ~35-pt
     floor regardless of player quality. Fix: use deviation from neutral (1.0) so the
     multiplier terms contribute +/- adjustments rather than a constant boost.

  3. **captain_score structurally floored at ~51**
     Same dimensional problem. All four multiplier terms were multiplied by 100,
     making the absolute floor ~40 pts before projection is added. No player could
     ever receive the 'Avoid' captain rating. Fix: same deviation-from-neutral approach.

  ## Formulas changed
  All changes are inside `afl.v_ai_player_metrics` (view rebuild).
  The cache population function is NOT changed — it reads from this view.

  ### Confidence (old → new)
  Old:
    projection * 0.60
    + matchup_multiplier * 100 * 0.25
    + pace_multiplier   * 100 * 0.15

  New:
    LEAST(100, GREATEST(0,
      (projection / 100.0) * 60.0
      + (matchup_multiplier - 1.0) * 200.0 * 0.25
      + (pace_multiplier   - 1.0) * 200.0 * 0.15
      + 40.0
    ))
  Interpretation:
    - base 40 pts (neutral player with 0 projection gets 40)
    - projection contributes 0–60 pts (100-pt projection gives +60)
    - matchup deviation ±0.37 → ±18.5 pts bonus/malus
    - pace deviation ±0.11 → ±3.3 pts bonus/malus
    - total range ≈ 18–100 for real players

  ### Captain Score (old → new)
  Old:
    projection * 0.55
    + matchup_multiplier * 100 * 0.20
    + venue_multiplier   * 100 * 0.15
    + pace_multiplier    * 100 * 0.10

  New:
    LEAST(100, GREATEST(0,
      (projection / 100.0) * 55.0
      + (matchup_multiplier - 1.0) * 200.0 * 0.20
      + (venue_multiplier   - 1.0) * 200.0 * 0.15
      + (pace_multiplier    - 1.0) * 200.0 * 0.10
      + 30.0
    ))
  Interpretation:
    - base 30 pts
    - projection 0–55 pts (100-pt proj gives +55)
    - matchup deviation ±0.37 → ±14.8 pts
    - venue deviation   ±0.08 → ±3.2 pts
    - pace deviation    ±0.11 → ±2.2 pts
    - total range ≈ 8–100 for real players
    - 'Avoid' (<60) reachable for any player projecting below ~55 with bad matchup
*/

CREATE OR REPLACE VIEW afl.v_ai_player_metrics AS
SELECT
  player_id,
  player_name,
  team_name,
  position_group,
  projection,
  base_projection,
  matchup_multiplier,
  venue_multiplier,
  pace_multiplier,
  projection_tier,
  matchup_rating,
  venue_rating,
  pace_environment,

  -- FIXED: captain_score — deviation-from-neutral approach, base 30pts
  LEAST(100, GREATEST(0,
    ROUND(
      (COALESCE(projection, 0) / 100.0) * 55.0
      + (COALESCE(matchup_multiplier, 1.0) - 1.0) * 200.0 * 0.20
      + (COALESCE(venue_multiplier,   1.0) - 1.0) * 200.0 * 0.15
      + (COALESCE(pace_multiplier,    1.0) - 1.0) * 200.0 * 0.10
      + 30.0,
    2)
  )) AS captain_score,

  -- FIXED: start_confidence — deviation-from-neutral approach, base 40pts
  LEAST(100, GREATEST(0,
    ROUND(
      (COALESCE(projection, 0) / 100.0) * 60.0
      + (COALESCE(matchup_multiplier, 1.0) - 1.0) * 200.0 * 0.25
      + (COALESCE(pace_multiplier,    1.0) - 1.0) * 200.0 * 0.15
      + 40.0,
    2)
  )) AS start_confidence,

  -- FIXED: breakout_probability — keep on 0-100 scale (was already ~93-109)
  -- use deviation from neutral so it spreads properly
  LEAST(100, GREATEST(0,
    ROUND(
      (COALESCE(matchup_multiplier, 1.0) - 1.0) * 200.0 * 0.40
      + (COALESCE(venue_multiplier,   1.0) - 1.0) * 200.0 * 0.30
      + (COALESCE(pace_multiplier,    1.0) - 1.0) * 200.0 * 0.30
      + 50.0,
    2)
  )) AS breakout_probability,

  ROUND((100::numeric - COALESCE(matchup_multiplier, 1.0) * 100::numeric) * 0.50
    + (100::numeric - COALESCE(venue_multiplier,   1.0) * 100::numeric) * 0.25
    + (100::numeric - COALESCE(pace_multiplier,    1.0) * 100::numeric) * 0.25, 2) AS bust_risk,

  ROUND(COALESCE(projection, 0) + COALESCE(matchup_multiplier, 1.0) * 10::numeric
    + COALESCE(venue_multiplier, 1.0) * 8::numeric
    + COALESCE(pace_multiplier,  1.0) * 6::numeric, 2) AS leverage_score

FROM afl.v_ai_player_signals s;
