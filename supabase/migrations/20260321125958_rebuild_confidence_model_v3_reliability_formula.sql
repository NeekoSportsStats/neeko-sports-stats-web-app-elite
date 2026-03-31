/*
  # Confidence Model v3 — Reliability-Based Formula

  ## Problem with v2 (Percentile-Rank)
  The percentile-rank approach measures *relative quality* not *reliability*.
  It makes every top player look highly confident regardless of actual
  data completeness, form volatility, or injury risk. All top players
  cluster at 85-92 with no meaningful differentiation.

  ## New Approach: Component-Based Reliability Score
  Confidence should answer: "How predictable is this player's next score?"

  Formula:
    confidence =
      (consistency_score * 0.30)   -- historical score reliability (0–1 scale)
    + (form_stability    * 0.20)   -- recent vs season form alignment (0–1 scale)
    + (games_played_factor * 0.20) -- data completeness this season (0–1 scale)
    + (role_stability    * 0.15)   -- positional/role signal (0–1 scale)
    + (matchup_stability * 0.10)   -- opponent difficulty neutrality (0–1 scale)
    - (risk_factor       * 0.35)   -- injury/volatility risk penalty (0–1 scale)

  Support metrics:
    consistency_score   = consistency / 100              (already 10–90 → 0.1–0.9)
    form_stability      = 1 - ABS(form_score - 75) / 75  (deviation from neutral 75)
    games_played_factor = LEAST(1.0, games_played / 10)  (max weight at 10 games)
    role_stability      = COALESCE(upside_rating / 100, 0.7) * 0.5 + 0.5  (moderate by default)
    matchup_stability   = 1.0 - ABS(matchup_multiplier - 1.0) * 2.0  (1.0 = perfectly neutral)
    risk_factor         = risk_rating / 100              (already 0–100 → 0–1)

  Output:
    raw mapped to 0..1 range, then scaled:
    confidence = LEAST(95, GREATEST(35, 35 + raw * 60))

  Labels:
    >= 78: Elite
    >= 62: Strong
    >= 48: Medium
    <  48: Fragile

  Validation targets:
    - rookies / 0-game players → Fragile/Medium (<60)
    - risky players (risk_rating > 60) → <65
    - experienced consistent players → Strong/Elite
    - avg should sit 52–68 (early season with few games)
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
      player_id,

      -- consistency_score: historical score variance (0.1–0.9 normalised to 0–1)
      COALESCE(consistency, 50.0) / 100.0 AS consistency_score,

      -- form_stability: how close recent form is to neutral (75 = average score)
      -- 0 = extreme deviation, 1 = bang on average
      GREATEST(0.0, 1.0 - ABS(COALESCE(form_score, 75.0) - 75.0) / 75.0) AS form_stability,

      -- games_played_factor: data completeness (caps at 10 games = full confidence)
      LEAST(1.0, COALESCE(games_played, 0)::numeric / 10.0) AS games_played_factor,

      -- role_stability: upside_rating proxies role certainty
      -- high upside (>50) = breakout risk = less stable role
      -- low upside (<30) = known role = more stable
      -- map: 0 upside → 1.0 stability, 100 upside → 0.5 stability
      GREATEST(0.0, 1.0 - COALESCE(upside_rating, 30.0) / 200.0) AS role_stability,

      -- matchup_stability: how neutral is the matchup
      -- multiplier near 1.0 = neutral = stable prediction
      GREATEST(0.0, 1.0 - ABS(COALESCE(matchup_multiplier::numeric, 1.0) - 1.0) * 5.0) AS matchup_stability,

      -- risk_factor: direct risk penalty (0–1)
      COALESCE(risk_rating, 50.0) / 100.0 AS risk_factor

    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      (
          (consistency_score   * 0.30)
        + (form_stability      * 0.20)
        + (games_played_factor * 0.20)
        + (role_stability      * 0.15)
        + (matchup_stability   * 0.10)
        - (risk_factor         * 0.35)
      ) AS raw_score
    FROM components
  ),
  normalised AS (
    SELECT
      player_id,
      -- raw range: approximately -0.10 to +0.85
      -- shift up by 0.30 to anchor low end, then scale to 0..1
      -- final: clamp 35..95
      ROUND(
        LEAST(95.0, GREATEST(35.0,
          35.0 + LEAST(1.0, GREATEST(0.0, (raw_score + 0.30) / 1.15)) * 60.0
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
    'model',   'v3_reliability',
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
