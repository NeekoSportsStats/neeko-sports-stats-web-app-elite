/*
  # Confidence Model v4 — Calibrated Spread Formula

  ## Problem with v3
  Distribution was too compressed (avg 73.9, min 47.7, only 1 Fragile):
  - matchup_stability barely varies (0.903–0.972) — almost no signal
  - games_played_factor capped at 0.30 (only 3 games played this season)
  - raw score range was ~0.38–0.74, causing output to cluster 62–79

  ## Changes in v4
  1. Replace matchup_stability with form_momentum signal:
     - form_momentum from mv_player_projection (-40.3 to +35.0)
     - positive momentum → more predictable (trending up = confidence)
     - normalised to 0..1 range: (momentum + 40) / 75

  2. Remove games_played_factor cap at 10 — use season-relative max (3):
     - LEAST(1.0, games_played / 3.0) → rookies/0-game = 0, 3 games = 1.0

  3. Recalibrate raw → confidence mapping:
     - Raw range: worst ~-0.15, best ~0.85
     - Map: raw + 0.15 / 1.00 → 0..1 scale
     - Then: 35 + scaled * 60 → 35..95

  ## Formula
    confidence =
      (consistency_score    * 0.30)   -- historical reliability (0–1)
    + (form_stability       * 0.20)   -- recent vs neutral alignment (0–1)
    + (games_played_factor  * 0.20)   -- season data completeness (0–1)
    + (role_stability       * 0.15)   -- role certainty proxy (0–1)
    + (form_momentum_score  * 0.10)   -- recent direction of travel (0–1)
    - (risk_factor          * 0.35)   -- injury/volatility penalty (0–1)

  ## Support Metrics
    consistency_score    = consistency / 100
    form_stability       = 1 - ABS(form_score - 75) / 75    [clamped 0..1]
    games_played_factor  = LEAST(1.0, games_played / 3.0)   [season-relative]
    role_stability       = 1.0 - upside_rating / 200.0      [0.5..1.0]
    form_momentum_score  = (form_momentum + 40.0) / 75.0    [clamped 0..1]
    risk_factor          = risk_rating / 100.0

  ## Expected Distribution
    - 0-game players: raw ≈ 0.30 consistency + 0 gamesf + 0.87 role - 0.35 risk → ~0.35 raw → ~55–60
    - Risky inconsistent: raw ≈ low everything - 0.35 → <0.25 → <50 (Fragile/Medium)
    - Elite experienced: raw ≈ 0.85 consistency + 1.0 gamesf + stable role - low risk → >0.70 → 75+

  ## Clamp
    LEAST(95, GREATEST(35, 35 + LEAST(1,GREATEST(0,(raw+0.15)/1.00)) * 60))

  ## Labels
    >= 78: Elite
    >= 62: Strong
    >= 48: Medium
    <  48: Fragile
*/

CREATE OR REPLACE FUNCTION afl.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_min     numeric;
  v_max     numeric;
  v_avg     numeric;
  v_elite   integer;
  v_strong  integer;
  v_medium  integer;
  v_fragile integer;
BEGIN
  WITH components AS (
    SELECT
      rc.player_id,

      -- 1. Consistency score: historical score reliability (0.1–0.9)
      COALESCE(rc.consistency, 50.0) / 100.0
        AS consistency_score,

      -- 2. Form stability: deviation from neutral form (75 = average AFL score)
      --    0 = extreme deviation (200+ or 0), 1 = exactly at neutral
      GREATEST(0.0, 1.0 - ABS(COALESCE(rc.form_score, 75.0) - 75.0) / 75.0)
        AS form_stability,

      -- 3. Games played factor: season data completeness
      --    Season max = 3 games so far, so cap at 3 for full credit
      LEAST(1.0, COALESCE(rc.games_played, 0)::numeric / 3.0)
        AS games_played_factor,

      -- 4. Role stability: inverse of breakout probability
      --    High upside (uncertain role) → lower stability
      --    Range 0.5 (max upside=100) to 1.0 (upside=0)
      GREATEST(0.0, 1.0 - COALESCE(rc.upside_rating, 30.0) / 200.0)
        AS role_stability,

      -- 5. Form momentum score: direction of recent performance
      --    Positive momentum = trending up = more predictable/reliable
      --    mv.form_momentum range: -40.3 to +35.0
      --    Normalise: (momentum + 40) / 75 → 0..1
      GREATEST(0.0, LEAST(1.0,
        (COALESCE(mv.form_momentum, 0.0) + 40.0) / 75.0
      )) AS form_momentum_score,

      -- 6. Risk factor: penalty for injury/volatility risk (0–1)
      COALESCE(rc.risk_rating, 50.0) / 100.0
        AS risk_factor

    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.mv_player_projection mv ON mv.player_id = rc.player_id
    WHERE rc.player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      ROUND((
          (consistency_score    * 0.30)
        + (form_stability       * 0.20)
        + (games_played_factor  * 0.20)
        + (role_stability       * 0.15)
        + (form_momentum_score  * 0.10)
        - (risk_factor          * 0.35)
      )::numeric, 4) AS raw_score
    FROM components
  ),
  normalised AS (
    SELECT
      player_id,
      raw_score,
      -- Raw range: worst ≈ -0.15, best ≈ 0.85 → span 1.00
      -- Shift +0.15 then divide by 1.00 to get 0..1
      -- Then map 0..1 → 35..95 (span 60)
      ROUND(
        LEAST(95.0, GREATEST(35.0,
          35.0 + LEAST(1.0, GREATEST(0.0, raw_score + 0.15)) * 60.0
        ))::numeric,
        1
      ) AS new_confidence
    FROM scored
  )
  UPDATE afl.player_rankings_cache r
  SET
    projection_confidence = n.new_confidence,
    confidence_label = CASE
      WHEN n.new_confidence >= 78 THEN 'Elite'
      WHEN n.new_confidence >= 62 THEN 'Strong'
      WHEN n.new_confidence >= 48 THEN 'Medium'
      ELSE 'Fragile'
    END
  FROM normalised n
  WHERE r.player_id = n.player_id;

  SELECT
    MIN(projection_confidence),
    MAX(projection_confidence),
    ROUND(AVG(projection_confidence)::numeric, 1),
    COUNT(*) FILTER (WHERE confidence_label = 'Elite'),
    COUNT(*) FILTER (WHERE confidence_label = 'Strong'),
    COUNT(*) FILTER (WHERE confidence_label = 'Medium'),
    COUNT(*) FILTER (WHERE confidence_label = 'Fragile')
  INTO v_min, v_max, v_avg, v_elite, v_strong, v_medium, v_fragile
  FROM afl.player_rankings_cache;

  RETURN jsonb_build_object(
    'ok',      true,
    'model',   'v4_calibrated_spread',
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
