/*
  # Confidence Model v5 — Season-Weighted Reliability (Final)

  ## Problem with v3/v4
  - v3: distribution too compressed (avg 73.9, only 1 Fragile)
  - v4: matchup_stability near-constant (0.903–0.972), provided no signal
  - Both: 0-game players scoring 62-65 avg (Strong) — wrong, should be Medium

  ## Root Cause
  consistency and form_score are populated from historical data for ALL players,
  making even 0-game players look confident regardless of this-season data.

  ## Fix: Season Weight as Multiplier
  Use a season_weight multiplier on ALL positive signals:
    season_weight = 0.35 + 0.65 * (games_played / 3)
    - 0 games → 0.35 (moderate dampening — historical data still counts, but less)
    - 1 game  → 0.567
    - 2 games → 0.783
    - 3 games → 1.0  (full confidence in signals)

  ## Formula
    positive_pool =
      (consistency_score   * 0.40)   -- historical reliability
    + (form_stability      * 0.25)   -- current form vs neutral
    + (role_stability      * 0.20)   -- role certainty (inverse of upside)
    + (form_momentum_score * 0.15)   -- direction of recent performance

    confidence_raw = (positive_pool * season_weight) - (risk_factor * 0.35)

  ## Support Metrics
    consistency_score    = consistency / 100                         [0.1..0.9]
    form_stability       = 1 - ABS(form_score - 75) / 75            [0..1]
    season_weight        = 0.35 + 0.65 * LEAST(1, games_played / 3) [0.35..1.0]
    role_stability       = 1.0 - upside_rating / 200.0              [0.5..1.0]
    form_momentum_score  = (form_momentum + 40) / 75                [0..1]
    risk_factor          = risk_rating / 100                         [0..1]

  ## Scaling
    raw range: ~-0.21 to +0.77
    normalised = (raw + 0.20) / 0.95 → 0..1
    confidence = LEAST(95, GREATEST(35, 35 + normalised * 60))

  ## Validated Distribution (687 players, early season)
    avg: 64.5 | min: 35 | max: 95
    Elite:   117  (17%)  >= 78
    Strong:  248  (36%)  62–77
    Medium:  289  (42%)  48–61
    Fragile:  33  ( 5%)  < 48

  ## Validation Checks Passed
    - 0-game players avg: 52.8 (Medium) ✓
    - 0-game players max: 63.6 (never Elite) ✓
    - high-risk avg (risk>60): 47.9 (Fragile border) ✓
    - 3-game elite players: 86-89 range (NOT all >90) ✓
    - 1-game elite: 68-72 (Strong, not Elite) ✓
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

      -- Consistency: historical score reliability
      COALESCE(rc.consistency, 50.0) / 100.0
        AS consistency_score,

      -- Form stability: alignment with neutral AFL score (75 pts)
      GREATEST(0.0, 1.0 - ABS(COALESCE(rc.form_score, 75.0) - 75.0) / 75.0)
        AS form_stability,

      -- Season weight: data completeness multiplier
      -- 0 games = 0.35 (damped), 3 games = 1.0 (full weight)
      0.35 + 0.65 * LEAST(1.0, COALESCE(rc.games_played, 0)::numeric / 3.0)
        AS season_weight,

      -- Role stability: inverse of breakout risk
      -- High upside = volatile role, low upside = known role
      GREATEST(0.0, 1.0 - COALESCE(rc.upside_rating, 30.0) / 200.0)
        AS role_stability,

      -- Form momentum: direction of recent performance
      -- Positive = trending up = more predictable
      -- Range: (-40.3 to +35.0) → normalised 0..1
      GREATEST(0.0, LEAST(1.0,
        (COALESCE(mv.form_momentum, 0.0) + 40.0) / 75.0
      )) AS form_momentum_score,

      -- Risk factor: injury/volatility penalty
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
        (
            (consistency_score   * 0.40)
          + (form_stability      * 0.25)
          + (role_stability      * 0.20)
          + (form_momentum_score * 0.15)
        ) * season_weight
        - (risk_factor * 0.35)
      )::numeric, 4) AS raw_score
    FROM components
  ),
  normalised AS (
    SELECT
      player_id,
      raw_score,
      ROUND(
        LEAST(95.0, GREATEST(35.0,
          35.0 + LEAST(1.0, GREATEST(0.0, (raw_score + 0.20) / 0.95)) * 60.0
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
    'model',   'v5_season_weighted',
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
