
/*
  # Projection Engine Rebuild — Step 5: Rebuild Analytics Views

  Rebuilds four analytics views to read from afl.mv_player_projection.
  No references to legacy views. All column names match MV schema.

  Views rebuilt:
  - afl.v_captain_scores
  - afl.v_score_probabilities
  - afl.v_player_risk_model
  - public.v_neeko_intel_features_source_2026
*/

CREATE OR REPLACE VIEW afl.v_captain_scores AS
SELECT
  player_id,
  player_name,
  position AS position_group,
  team_name,
  projection,
  ceiling,
  consistency,
  round(projection * 0.45 + ceiling::numeric * 0.35 + consistency * 0.20, 2) AS captain_score
FROM afl.mv_player_projection;

CREATE OR REPLACE VIEW afl.v_score_probabilities AS
SELECT
  player_id,
  player_name,
  position AS position_group,
  team_name,
  projection,
  confidence,
  round(100.0 / (1.0 + exp((80.0  - projection) / GREATEST(1.0, 110.0 - confidence))), 1) AS prob_80_plus,
  round(100.0 / (1.0 + exp((100.0 - projection) / GREATEST(1.0, 110.0 - confidence))), 1) AS prob_100_plus,
  round(100.0 / (1.0 + exp((120.0 - projection) / GREATEST(1.0, 110.0 - confidence))), 1) AS prob_120_plus
FROM afl.mv_player_projection;

CREATE OR REPLACE VIEW afl.v_player_risk_model AS
WITH risk_raw AS (
  SELECT
    player_id,
    player_name,
    projection,
    confidence,
    CASE
      WHEN projection > 0 THEN (100.0 - confidence) / projection
      ELSE 0.5
    END AS risk_raw
  FROM afl.mv_player_projection
),
risk_bounds AS (
  SELECT min(risk_raw) AS min_risk, max(risk_raw) AS max_risk
  FROM risk_raw WHERE risk_raw > 0
),
normalized AS (
  SELECT
    r.player_id, r.player_name, r.projection, r.confidence, r.risk_raw,
    CASE
      WHEN (SELECT max_risk - min_risk FROM risk_bounds) = 0 THEN 50.0
      ELSE LEAST(90.0, GREATEST(10.0,
        10.0 + 80.0 * (r.risk_raw - (SELECT min_risk FROM risk_bounds))
        / NULLIF((SELECT max_risk - min_risk FROM risk_bounds), 0)
      ))
    END AS risk_percent
  FROM risk_raw r
)
SELECT
  player_id,
  player_name,
  projection,
  confidence,
  risk_raw,
  round(risk_percent, 1) AS risk_percent,
  CASE
    WHEN risk_percent < 20 THEN 'Very Safe'
    WHEN risk_percent < 40 THEN 'Safe'
    WHEN risk_percent < 60 THEN 'Moderate'
    WHEN risk_percent < 80 THEN 'Risky'
    ELSE 'High Risk'
  END AS risk_tier
FROM normalized;

CREATE OR REPLACE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  mv.player_id,
  mv.projection         AS projection_final,
  mv.ceiling            AS ceiling_estimate,
  mv.floor              AS floor_estimate,
  mv.consistency        AS consistency_score,
  mv.form_score         AS form_rating,
  COALESCE(mv.matchup_rating, 50) AS matchup_rating,
  COALESCE(mv.neeko_rating, 50)   AS upside_rating,
  mv.confidence         AS projection_confidence
FROM afl.mv_player_projection mv;
