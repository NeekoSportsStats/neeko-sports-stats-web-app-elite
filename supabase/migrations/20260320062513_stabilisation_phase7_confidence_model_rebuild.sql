
/*
  # Phase 7: Confidence Model Rebuild

  ## Problem
  Current projection_confidence values cluster between 32–50 (avg 44.7).
  Labels are "Fragile" for almost all players. This is unrealistic and
  makes the metric meaningless for users.

  ## Root Cause
  The existing confidence column is populated from player_projection_confidence
  which uses raw probability values (0–1) scaled poorly, or uses columns that
  don't exist for most players (role_stability, data_completeness).

  ## Solution
  Build confidence from what we actually have in player_rankings_cache:
    - consistency score     (0.35 weight)
    - form stability        (0.25 weight — inverse of volatility proxy)
    - matchup clarity       (0.20 weight)
    - data completeness     (0.20 weight — games played proxy)

  Then normalise to the target range: 55 + score * 35
  This gives:
    - Worst possible: 55 (low consistency, high vol, bad matchup, no data)
    - Best possible:  90
    - Average target: 65–72

  ## Labels
  - >= 78: Elite
  - >= 68: Strong
  - >= 58: Medium
  - <  58: Fragile

  ## Tables modified
  - afl.player_rankings_cache (projection_confidence, confidence_label)
*/

CREATE OR REPLACE FUNCTION afl.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_min   numeric;
  v_max   numeric;
  v_avg   numeric;
  v_elite integer;
  v_strong integer;
  v_medium integer;
  v_fragile integer;
BEGIN
  WITH base AS (
    SELECT
      player_id,
      -- consistency: 0–1 range (direct)
      COALESCE(LEAST(1.0, GREATEST(0.0, consistency)), 0.5) AS cons_norm,

      -- form stability: inverse of abs(form_score - 50) / 50
      -- form_score 0-100; centre=50 means stable; deviation = instability
      COALESCE(
        LEAST(1.0, GREATEST(0.0,
          1.0 - ABS(COALESCE(form_score, 50.0) - 50.0) / 50.0
        )),
        0.5
      ) AS form_stab,

      -- matchup clarity: OK/Good matchup = better confidence, Tough = lower
      CASE matchup_rating
        WHEN 'Elite'    THEN 0.9
        WHEN 'Good'     THEN 0.75
        WHEN 'Average'  THEN 0.6
        WHEN 'Tough'    THEN 0.45
        WHEN 'Brutal'   THEN 0.3
        ELSE 0.55
      END AS matchup_clarity,

      -- data completeness: based on games_played (cap at 10 for full confidence)
      LEAST(1.0, COALESCE(games_played, 0)::numeric / 10.0) AS data_comp
    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      ROUND((
        0.35 * cons_norm
      + 0.25 * form_stab
      + 0.20 * matchup_clarity
      + 0.20 * data_comp
      )::numeric, 4) AS raw_score
    FROM base
  ),
  -- normalise: 55 + raw_score * 35 → range 55..90
  normalised AS (
    SELECT
      player_id,
      ROUND((55.0 + raw_score * 35.0)::numeric, 1) AS new_confidence,
      CASE
        WHEN (55.0 + raw_score * 35.0) >= 78 THEN 'Elite'
        WHEN (55.0 + raw_score * 35.0) >= 68 THEN 'Strong'
        WHEN (55.0 + raw_score * 35.0) >= 58 THEN 'Medium'
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

  -- Report distribution
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
    'ok',      (v_avg BETWEEN 62 AND 82),
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

-- Run immediately to fix existing data
SELECT afl.fn_rebuild_confidence_scores();
