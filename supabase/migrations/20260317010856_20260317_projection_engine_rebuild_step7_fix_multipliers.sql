
/*
  # Projection Engine Rebuild — Step 7: Fix Projection Multipliers

  The matchup_rating in feature_matchup is already a multiplier (range ~0.82–1.21),
  not a 0–100 score. Step 3 incorrectly divided it by 50, collapsing all projections
  to near zero. This migration corrects the formula and repopulates player_projection.

  Corrected formula:
    projection_final = form_rating * matchup_mult * venue_mult * rest_mult
    - matchup_mult = avg(matchup_rating)  [already a multiplier, 1.0 = neutral]
    - venue_mult   = avg(venue_multiplier) [already a multiplier]
    - rest_mult    = 1.05 / 1.00 / 0.95 based on rest_days

  Display column matchup_rating stored as raw multiplier value.
  The MV and downstream views display it as-is; frontend can scale to 0-100 if needed.
*/

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
    f.volatility,
    f.consistency,
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
with_multipliers AS (
  SELECT
    fb.*,
    COALESCE(am.avg_matchup_mult, 1.0) AS matchup_mult,
    COALESCE(av.avg_venue_mult, 1.0)   AS venue_mult,
    CASE
      WHEN COALESCE(lr.rest_days, 7) > 5  THEN 1.05
      WHEN COALESCE(lr.rest_days, 7) >= 3 THEN 1.00
      ELSE 0.95
    END AS rest_mult
  FROM form_base fb
  LEFT JOIN agg_matchup am ON am.player_id = fb.player_id
  LEFT JOIN agg_venue   av ON av.player_id = fb.player_id
  LEFT JOIN latest_rest lr ON lr.player_id = fb.player_id
),
projections AS (
  SELECT
    player_id,
    GREATEST(0.0, round(form_rating * matchup_mult * venue_mult * rest_mult, 1)) AS projection_final,
    GREATEST(
      COALESCE(feature_ceiling, 0),
      CEIL(form_rating * 1.25)
    )::integer AS ceiling,
    GREATEST(0.0, LEAST(
      COALESCE(NULLIF(feature_floor::numeric, 0), form_rating * 0.75),
      form_rating * 0.75
    )) AS floor,
    round(form_rating, 1)                        AS form_rating,
    round(matchup_mult, 4)                       AS matchup_rating,
    round(venue_mult, 4)                         AS venue_rating,
    round(rest_mult, 2)                          AS rest_rating,
    round(COALESCE(consistency, 50.0), 1)        AS consistency_score,
    CASE
      WHEN COALESCE(volatility, 28.0) / NULLIF(form_rating, 0) < 0.25 THEN 'LOW'
      WHEN COALESCE(volatility, 28.0) / NULLIF(form_rating, 0) < 0.40 THEN 'MODERATE'
      ELSE 'HIGH'
    END AS risk_rating,
    LEAST(95.0, GREATEST(40.0,
      100.0 - (COALESCE(volatility, 28.0) / NULLIF(form_rating, 0) * 100.0)
    )) AS projection_confidence
  FROM with_multipliers
)
INSERT INTO afl.player_projection (
  player_id, projection_final, ceiling, floor,
  form_rating, matchup_rating, venue_rating, rest_rating,
  consistency_score, risk_rating, projection_confidence, generated_at
)
SELECT
  player_id, projection_final, ceiling, floor,
  form_rating, matchup_rating, venue_rating, rest_rating,
  consistency_score, risk_rating, projection_confidence, now()
FROM projections
ON CONFLICT (player_id) DO UPDATE SET
  projection_final      = EXCLUDED.projection_final,
  ceiling               = EXCLUDED.ceiling,
  floor                 = EXCLUDED.floor,
  form_rating           = EXCLUDED.form_rating,
  matchup_rating        = EXCLUDED.matchup_rating,
  venue_rating          = EXCLUDED.venue_rating,
  rest_rating           = EXCLUDED.rest_rating,
  consistency_score     = EXCLUDED.consistency_score,
  risk_rating           = EXCLUDED.risk_rating,
  projection_confidence = EXCLUDED.projection_confidence,
  generated_at          = now();
