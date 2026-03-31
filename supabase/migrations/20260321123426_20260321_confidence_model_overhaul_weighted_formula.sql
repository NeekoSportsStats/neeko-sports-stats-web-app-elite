/*
  # Confidence Model Overhaul — Weighted Formula

  ## Summary
  The existing confidence model (fn_rebuild_confidence_scores) was producing scores
  in the 30–86 range despite labels claiming 52–92. The label thresholds (Elite>=80,
  Strong>=70) were calibrated for 52–92 but actual scores were 30–86, causing all 103
  "Elite" players to have avg confidence of 59.9 — completely wrong.

  ## Root Cause
  The raw_score = 0.35*cons + 0.25*neeko_rank + 0.20*upside_adj + 0.20*data_comp
  The normalised = 52 + raw_score * 40 should give 52..92 BUT the normalised formula
  was being bypassed — the UPDATE used raw_score * 40 without the +52 offset properly
  applying to all records. Also the formula lacked form_score and matchup inputs.

  ## New Formula (from spec)
  confidence_raw = 
    (consistency_score * 0.25)      — data: consistency (0..1)
    + (form_score_norm * 0.25)      — data: form_score normalised to 0..1
    + (matchup_norm * 0.15)         — data: matchup_multiplier normalised
    + (role_stability * 0.15)       — proxy: upside_rating normalised
    + (games_played_factor * 0.10)  — data completeness relative to season peers
    - (risk_factor * 0.20)          — data: risk_rating/100

  Final: LEAST(95, GREATEST(35, 35 + raw * 60))
  This maps 0..1 raw to 35..95 with real spread.

  ## New Labels (calibrated to new formula)
  - >= 80: Elite
  - >= 65: Strong  
  - >= 50: Medium
  - <  50: Fragile

  ## Changes
  - DROP and recreate afl.fn_rebuild_confidence_scores()
  - Immediately execute to populate correct values
  - No schema changes required
*/

CREATE OR REPLACE FUNCTION afl.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_max_games  integer;
  v_min        numeric;
  v_max        numeric;
  v_avg        numeric;
  v_elite      integer;
  v_strong     integer;
  v_medium     integer;
  v_fragile    integer;
BEGIN
  -- Get max games played this season as dynamic completeness cap
  SELECT GREATEST(1, MAX(games_played))
  INTO v_max_games
  FROM afl.player_rankings_cache;

  WITH base AS (
    SELECT
      player_id,

      -- consistency_score: already 0..1 (clamped)
      COALESCE(LEAST(1.0, GREATEST(0.0, consistency)), 0.35) AS cons_norm,

      -- form_score: typically 0..100, normalise to 0..1
      COALESCE(LEAST(1.0, GREATEST(0.0, form_score / 100.0)), 0.40) AS form_norm,

      -- matchup: multiplier typically 0.80..1.20, centre and scale to 0..1
      -- 0.80 → 0.0, 1.00 → 0.5, 1.20 → 1.0
      COALESCE(
        LEAST(1.0, GREATEST(0.0, (COALESCE(matchup_multiplier, 1.0) - 0.80) / 0.40)),
        0.50
      ) AS matchup_norm,

      -- role_stability: use upside_rating (0..100) as proxy for role certainty
      -- High upside_rating = defined role = high stability
      COALESCE(LEAST(1.0, GREATEST(0.0, COALESCE(upside_rating, 40.0) / 100.0)), 0.40) AS role_norm,

      -- games_played_factor: completeness relative to season max
      CASE
        WHEN v_max_games <= 0 THEN 0.30
        ELSE LEAST(1.0, COALESCE(games_played, 0)::numeric / v_max_games)
      END AS games_factor,

      -- risk_factor: risk_rating 0..100, normalise to 0..1
      COALESCE(LEAST(1.0, GREATEST(0.0, COALESCE(risk_rating, 50.0) / 100.0)), 0.50) AS risk_factor

    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      ROUND((
          (cons_norm    * 0.25)
        + (form_norm    * 0.25)
        + (matchup_norm * 0.15)
        + (role_norm    * 0.15)
        + (games_factor * 0.10)
        - (risk_factor  * 0.20)
      )::numeric, 4) AS raw_score
    FROM base
  ),
  -- Map raw (which ranges roughly -0.20..0.90) to 35..95
  -- Formula: 35 + raw_score * 60 → when raw=0 score=35, raw=1 score=95
  -- Clamped: LEAST(95, GREATEST(35, value))
  normalised AS (
    SELECT
      player_id,
      ROUND(LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0))::numeric, 1) AS new_confidence,
      CASE
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 80 THEN 'Elite'
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 65 THEN 'Strong'
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 50 THEN 'Medium'
        ELSE 'Fragile'
      END AS new_label
    FROM scored
  )
  UPDATE afl.player_rankings_cache r
  SET
    projection_confidence = n.new_confidence,
    confidence_label      = n.new_label
  FROM normalised n
  WHERE r.player_id = n.player_id;

  SELECT
    MIN(projection_confidence),
    MAX(projection_confidence),
    AVG(projection_confidence),
    COUNT(*) FILTER (WHERE confidence_label = 'Elite'),
    COUNT(*) FILTER (WHERE confidence_label = 'Strong'),
    COUNT(*) FILTER (WHERE confidence_label = 'Medium'),
    COUNT(*) FILTER (WHERE confidence_label = 'Fragile')
  INTO v_min, v_max, v_avg, v_elite, v_strong, v_medium, v_fragile
  FROM afl.player_rankings_cache;

  RETURN jsonb_build_object(
    'ok',      (v_avg BETWEEN 50 AND 85),
    'min',     ROUND(v_min::numeric, 1),
    'max',     ROUND(v_max::numeric, 1),
    'avg',     ROUND(v_avg::numeric, 1),
    'elite',   v_elite,
    'strong',  v_strong,
    'medium',  v_medium,
    'fragile', v_fragile
  );
END;
$$;

-- Execute immediately to populate correct values
SELECT afl.fn_rebuild_confidence_scores();
