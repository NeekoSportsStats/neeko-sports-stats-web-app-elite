
/*
  # Projection Engine Rebuild — Step 3: Populate afl.player_projection

  ## Summary
  Inserts calculated projections for all players who have feature_player_form data.
  feature_matchup, feature_venue and feature_rest are multi-row historical tables,
  so we aggregate them to a single per-player summary before joining.

  ## Projection Formula
  form_rating = (0.5 * last5_avg) + (0.3 * last10_avg) + (0.2 * season_avg)

  projection_final = form_rating * matchup_mult * venue_mult * rest_mult

  ceiling = MAX(feature ceiling, form_rating * 1.25)
  floor   = MIN(feature floor,   form_rating * 0.75)

  ## Multiplier Aggregation
  - matchup: average matchup_rating across all historical opponents, normalised to 1.0 baseline at 50
  - venue:   average venue_multiplier across all historical venues
  - rest:    most recent rest_days mapped to multiplier (>5→1.05, 3-5→1.00, <3→0.95)
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
    round(avg(matchup_rating), 1) AS avg_matchup_rating
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT player_id,
    round(avg(venue_multiplier), 4) AS avg_venue_multiplier
  FROM afl.feature_venue
  GROUP BY player_id
),
agg_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    rest_days
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
    COALESCE(am.avg_matchup_rating, 50.0)             AS matchup_rating,
    COALESCE(am.avg_matchup_rating, 50.0) / 50.0      AS matchup_mult,
    COALESCE(av.avg_venue_multiplier, 1.0)             AS venue_rating,
    COALESCE(av.avg_venue_multiplier, 1.0)             AS venue_mult,
    CASE
      WHEN COALESCE(ar.rest_days, 7) > 5  THEN 1.05
      WHEN COALESCE(ar.rest_days, 7) >= 3 THEN 1.00
      ELSE 0.95
    END AS rest_mult
  FROM form_base fb
  LEFT JOIN agg_matchup am ON am.player_id = fb.player_id
  LEFT JOIN agg_venue   av ON av.player_id = fb.player_id
  LEFT JOIN agg_rest    ar ON ar.player_id = fb.player_id
),
projections AS (
  SELECT
    player_id,
    GREATEST(0.0, round(form_rating * matchup_mult * venue_mult * rest_mult, 1))  AS projection_final,
    GREATEST(
      COALESCE(feature_ceiling, 0),
      CEIL(form_rating * 1.25)
    )::integer AS ceiling,
    GREATEST(0.0, LEAST(
      COALESCE(NULLIF(feature_floor::numeric, 0), form_rating * 0.75),
      form_rating * 0.75
    )) AS floor,
    round(form_rating, 1)          AS form_rating,
    round(matchup_rating, 1)       AS matchup_rating,
    round(venue_rating, 3)         AS venue_rating,
    round(rest_mult, 2)            AS rest_rating,
    round(COALESCE(consistency, 50.0), 1) AS consistency_score,
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
