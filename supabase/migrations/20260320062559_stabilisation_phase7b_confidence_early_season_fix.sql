
/*
  # Phase 7b: Confidence Model — Early Season Calibration

  ## Problem
  Early in the season (max 3 games played), data_comp caps at 0.30 for everyone,
  compressing all confidence scores into a 71–82 band with no Fragile/Medium.

  ## Fix
  1. Data completeness uses max(games_played) in current season as the cap 
     (so in round 3, cap=3 and spread is maintained relative to peers).
  2. Add an upside_pct / risk spread component so elite players differ from fragile.
  3. Widen normalisation range: 52 + raw * 40 → gives 52..92 range.

  ## Updated labels
  - >= 80: Elite
  - >= 70: Strong  
  - >= 60: Medium
  - <  60: Fragile
*/

CREATE OR REPLACE FUNCTION afl.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_max_games integer;
  v_min       numeric;
  v_max       numeric;
  v_avg       numeric;
  v_elite     integer;
  v_strong    integer;
  v_medium    integer;
  v_fragile   integer;
BEGIN
  -- Get max games played this season as dynamic cap
  SELECT GREATEST(1, MAX(games_played))
  INTO v_max_games
  FROM afl.player_rankings_cache;

  WITH base AS (
    SELECT
      player_id,

      -- consistency: direct 0–1
      COALESCE(LEAST(1.0, GREATEST(0.0, consistency)), 0.4) AS cons_norm,

      -- form stability: use neeko_rating as proxy for stable quality signal
      -- normalise neeko_rating to 0–1 using percent_rank
      PERCENT_RANK() OVER (ORDER BY COALESCE(neeko_rating, 0)) AS neeko_rank,

      -- risk-adjusted upside: high upside + low risk = confident
      COALESCE(
        LEAST(1.0, GREATEST(0.0,
          (COALESCE(upside_pct, 20.0) / 100.0) * (1.0 - COALESCE(risk_rating, 50.0) / 100.0)
        )),
        0.2
      ) AS upside_adj,

      -- data completeness relative to season peers
      CASE
        WHEN v_max_games <= 0 THEN 0.3
        ELSE LEAST(1.0, COALESCE(games_played, 0)::numeric / v_max_games)
      END AS data_comp
    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      ROUND((
        0.35 * cons_norm
      + 0.25 * neeko_rank
      + 0.20 * upside_adj
      + 0.20 * data_comp
      )::numeric, 4) AS raw_score
    FROM base
  ),
  -- normalise: 52 + raw_score * 40 → range ~52..92
  normalised AS (
    SELECT
      player_id,
      ROUND((52.0 + raw_score * 40.0)::numeric, 1) AS new_confidence,
      CASE
        WHEN (52.0 + raw_score * 40.0) >= 80 THEN 'Elite'
        WHEN (52.0 + raw_score * 40.0) >= 70 THEN 'Strong'
        WHEN (52.0 + raw_score * 40.0) >= 60 THEN 'Medium'
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

SELECT afl.fn_rebuild_confidence_scores();
