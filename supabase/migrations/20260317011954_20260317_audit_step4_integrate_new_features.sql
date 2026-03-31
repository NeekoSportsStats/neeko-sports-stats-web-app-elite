
/*
  # Audit Step 4: Integrate New Features into afl.player_projection

  ## Changes
  1. Add columns to afl.player_projection:
     - position_concession_multiplier  — from afl.player_opponent_concession
     - volatility_score                — from afl.player_variation (replaces feature_player_form.volatility proxy)
     - stability_score                 — from afl.player_variation

  2. Repopulate afl.player_projection with:
     - projection_final now includes position_concession_multiplier
     - risk_rating driven by variation.volatility_score (more accurate)
     - projection_confidence driven by variation.stability_score

  ## Updated Projection Formula
  projection_final =
    form_rating
    * matchup_mult           (from feature_matchup avg, already ~1.0 scale)
    * venue_mult             (from feature_venue avg)
    * rest_mult              (1.05 / 1.00 / 0.95)
    * position_concession_mult  (from player_opponent_concession, clamped 0.92–1.08)

  ## Risk Rating (now from variation model)
  volatility_score 0–30   → LOW
  volatility_score 30–60  → MODERATE
  volatility_score 60+    → HIGH

  ## Projection Confidence (now from stability_score)
  projection_confidence = LEAST(95, GREATEST(40, stability_score))
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_projection'
      AND column_name = 'position_concession_multiplier'
  ) THEN
    ALTER TABLE afl.player_projection ADD COLUMN position_concession_multiplier numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_projection'
      AND column_name = 'volatility_score'
  ) THEN
    ALTER TABLE afl.player_projection ADD COLUMN volatility_score numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_projection'
      AND column_name = 'stability_score'
  ) THEN
    ALTER TABLE afl.player_projection ADD COLUMN stability_score numeric;
  END IF;
END $$;

WITH position_defaults AS (
  SELECT position_group,
    CASE position_group
      WHEN 'MID'  THEN 55.0
      WHEN 'RUC'  THEN 52.0
      WHEN 'DEF'  THEN 42.0
      WHEN 'FWD'  THEN 48.0
      ELSE 45.0
    END AS default_avg
  FROM (VALUES ('MID'),('RUC'),('DEF'),('FWD'),('UTIL')) AS pg(position_group)
),
agg_matchup AS (
  SELECT player_id,
    avg(matchup_rating) AS avg_matchup_mult
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT player_id,
    avg(venue_multiplier) AS avg_venue_mult
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id, rest_days
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
),
next_opponent AS (
  SELECT cpt.player_id, ng.home_team_id, ng.away_team_id, cpt.team_id
  FROM afl.v_current_player_team cpt
  LEFT JOIN afl.v_next_games ng ON ng.team_id = cpt.team_id
),
concession AS (
  SELECT
    no.player_id,
    COALESCE(poc.concession_multiplier, 1.0) AS position_concession_mult
  FROM next_opponent no
  JOIN afl.players p ON p.player_id = no.player_id
  LEFT JOIN afl.player_opponent_concession poc
    ON poc.defence_team_id = CASE
      WHEN no.home_team_id = no.team_id THEN no.away_team_id
      ELSE no.home_team_id
    END
    AND poc.position_group = COALESCE(p.position_group, 'FWD')
),
form_base AS (
  SELECT
    p.player_id,
    p.position_group,
    f.games_played,
    f.season_avg,
    f.last5_avg,
    f.last10_avg,
    f.ceiling    AS feature_ceiling,
    f.floor      AS feature_floor,
    pd.default_avg,
    CASE
      WHEN COALESCE(f.games_played, 0) <= 2 THEN pd.default_avg
      ELSE (
        COALESCE(NULLIF(f.last5_avg,  0), pd.default_avg) * 0.50 +
        COALESCE(NULLIF(f.last10_avg, 0), pd.default_avg) * 0.30 +
        COALESCE(NULLIF(f.season_avg, 0), pd.default_avg) * 0.20
      )
    END AS form_rating
  FROM afl.players p
  JOIN afl.feature_player_form f ON f.player_id = p.player_id
  LEFT JOIN position_defaults pd ON pd.position_group = COALESCE(p.position_group, 'FWD')
),
with_all_multipliers AS (
  SELECT
    fb.*,
    COALESCE(am.avg_matchup_mult, 1.0)   AS matchup_mult,
    COALESCE(av.avg_venue_mult, 1.0)     AS venue_mult,
    CASE
      WHEN COALESCE(lr.rest_days, 7) > 5  THEN 1.05
      WHEN COALESCE(lr.rest_days, 7) >= 3 THEN 1.00
      ELSE 0.95
    END                                  AS rest_mult,
    COALESCE(c.position_concession_mult, 1.0) AS pos_concession_mult,
    COALESCE(pv.volatility_score, 50.0)  AS volatility_score,
    COALESCE(pv.stability_score,  50.0)  AS stability_score
  FROM form_base fb
  LEFT JOIN agg_matchup am    ON am.player_id = fb.player_id
  LEFT JOIN agg_venue   av    ON av.player_id = fb.player_id
  LEFT JOIN latest_rest lr    ON lr.player_id = fb.player_id
  LEFT JOIN concession  c     ON c.player_id  = fb.player_id
  LEFT JOIN afl.player_variation pv ON pv.player_id = fb.player_id
),
projections AS (
  SELECT
    player_id,
    GREATEST(0.0, round(
      form_rating * matchup_mult * venue_mult * rest_mult * pos_concession_mult, 1
    )) AS projection_final,
    GREATEST(
      COALESCE(feature_ceiling, 0),
      CEIL(form_rating * 1.25)
    )::integer AS ceiling,
    GREATEST(0.0, LEAST(
      COALESCE(NULLIF(feature_floor::numeric, 0), form_rating * 0.75),
      form_rating * 0.75
    )) AS floor,
    round(form_rating, 1)                  AS form_rating,
    round(matchup_mult, 4)                 AS matchup_rating,
    round(venue_mult, 4)                   AS venue_rating,
    round(rest_mult, 2)                    AS rest_rating,
    round(pos_concession_mult, 4)          AS position_concession_multiplier,
    round(volatility_score, 1)             AS volatility_score,
    round(stability_score, 1)              AS stability_score,
    CASE
      WHEN volatility_score < 30 THEN 'LOW'
      WHEN volatility_score < 60 THEN 'MODERATE'
      ELSE 'HIGH'
    END                                    AS risk_rating,
    LEAST(95.0, GREATEST(40.0, stability_score)) AS projection_confidence,
    round(stability_score * 0.60 + (100.0 - volatility_score) * 0.40, 1) AS consistency_score
  FROM with_all_multipliers
)
INSERT INTO afl.player_projection (
  player_id, projection_final, ceiling, floor,
  form_rating, matchup_rating, venue_rating, rest_rating,
  consistency_score, risk_rating, projection_confidence,
  position_concession_multiplier, volatility_score, stability_score,
  generated_at
)
SELECT
  player_id, projection_final, ceiling, floor,
  form_rating, matchup_rating, venue_rating, rest_rating,
  consistency_score, risk_rating, projection_confidence,
  position_concession_multiplier, volatility_score, stability_score,
  now()
FROM projections
ON CONFLICT (player_id) DO UPDATE SET
  projection_final               = EXCLUDED.projection_final,
  ceiling                        = EXCLUDED.ceiling,
  floor                          = EXCLUDED.floor,
  form_rating                    = EXCLUDED.form_rating,
  matchup_rating                 = EXCLUDED.matchup_rating,
  venue_rating                   = EXCLUDED.venue_rating,
  rest_rating                    = EXCLUDED.rest_rating,
  consistency_score              = EXCLUDED.consistency_score,
  risk_rating                    = EXCLUDED.risk_rating,
  projection_confidence          = EXCLUDED.projection_confidence,
  position_concession_multiplier = EXCLUDED.position_concession_multiplier,
  volatility_score               = EXCLUDED.volatility_score,
  stability_score                = EXCLUDED.stability_score,
  generated_at                   = now();
