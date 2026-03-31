/*
  # Rebuild value_score Formula — v2 (Post-Audit Fix)

  ## Summary
  Full replacement of the value_score calculation across the projection engine and rankings cache,
  based on findings from the 2026-03-18 audit.

  ## Problems Fixed
  1. ZERO COLLAPSE: 54% of players scored exactly 0 due to GREATEST(0, ...) floor — removed
  2. INVALID CHEAP PLAYERS: price <= $250k with games_played = 0 were dominating top rankings — excluded via NULL
  3. ZERO-SIGNAL ZONE: $250k–$500k band (175 players, 97% zero) now gets real positive/negative scores
  4. POSITION BIAS: Forward players structurally penalised by fixed 60-point baseline — replaced with price-relative expected score

  ## New Formula
  ```
  value_score = (projection_final - expected_score)
              + (ceiling - projection_final) * 0.25
              - (volatility_score * 0.15)
  ```
  Where: expected_score = price / 10000
  (e.g. $600k player → expected 60pts; $1.2m player → expected 120pts)

  Exclusion: price <= $250k AND games_played = 0 → NULL (pre-season placeholder prices)

  ## New Value Tiers (percentile-based on non-null scores)
  - ELITE:   top 20% (≥ ~7.0)
  - STRONG:  top 40% (≥ ~1.9)
  - SOLID:   top 60% (≥ ~-1.8)
  - NEUTRAL: top 80% (≥ ~-6.6)
  - FADE:    bottom 20% (< -6.6)

  ## Distribution After Fix
  - Before: median = 0, 54% zero, range [0, 13.9]
  - After:  median ≈ 0, 49% negative / 49% positive, range [-35, +48]

  ## Tables Modified
  - afl.refresh_projection_engine() — Step 5 (feature_price insert)
  - afl.populate_rankings_cache_from_source() — value tiers + thresholds
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Rebuild refresh_projection_engine with new value_score in Step 5
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
v_count     integer;
v_conf      text;
v_roles     text;
v_venue     text;
v_breakout  text;
v_curr_week integer;
BEGIN

-- Step 0: determine current 2026 week for season decay weighting
SELECT COALESCE(MAX(g.week), 0) INTO v_curr_week
FROM afl.games g
WHERE g.season = 2026;

-- Step 1: role signal refresh
SELECT afl.refresh_player_role_signals() INTO v_roles;

-- Step 2: venue-position concession refresh
SELECT afl.refresh_opponent_position_venue_concession() INTO v_venue;

-- Step 3: breakout model refresh
SELECT afl.refresh_player_breakout_model() INTO v_breakout;

-- Step 4: feature_player_form with season-weighted averages
INSERT INTO afl.feature_player_form (
player_id, games_played, season_avg, last3_avg, last5_avg, last10_avg,
ceiling, floor, volatility, consistency, form_score, form_momentum, updated_at
)
WITH season_weights AS (
SELECT
GREATEST(0.1, 0.6 - v_curr_week * 0.04)::numeric AS w_2025,
1.0::numeric                                       AS w_2026
),
ranked_scores AS (
SELECT
pg.player_id,
pg.fantasy_score,
g.season,
g.week,
ROW_NUMBER() OVER (
PARTITION BY pg.player_id
ORDER BY g.game_date DESC, pg.game_id DESC
) AS rn,
pg.fantasy_score * CASE
WHEN g.season = 2026 THEN (SELECT w_2026 FROM season_weights)
WHEN g.season = 2025 THEN (SELECT w_2025 FROM season_weights)
ELSE 0.1
END AS weighted_score,
COUNT(*) FILTER (WHERE pg.fantasy_score > 0)
OVER (PARTITION BY pg.player_id) AS total_games,
COUNT(*) FILTER (WHERE pg.fantasy_score > 0 AND g.season = 2026)
OVER (PARTITION BY pg.player_id) AS games_2026
FROM afl.player_games pg
JOIN afl.games g ON g.game_id = pg.game_id
WHERE pg.fantasy_score > 0
),
agg AS (
SELECT
player_id,
MAX(games_2026)::integer                                              AS games_played,
ROUND(SUM(weighted_score)::numeric / NULLIF(COUNT(*), 0), 2)         AS season_avg,
ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 3)::numeric, 2)         AS last3_avg,
ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)         AS last5_avg,
ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 10)::numeric, 2)        AS last10_avg,
PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score)::integer  AS ceiling,
PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score)::integer  AS floor,
ROUND(CASE
WHEN AVG(fantasy_score) = 0 THEN NULL
ELSE STDDEV(fantasy_score)::numeric / AVG(fantasy_score)::numeric * 100
END, 2) AS volatility
FROM ranked_scores
GROUP BY player_id
)
SELECT
a.player_id,
COALESCE(a.games_played, 0),
a.season_avg,
a.last3_avg,
a.last5_avg,
a.last10_avg,
a.ceiling,
a.floor,
a.volatility,
ROUND(LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(a.volatility, 50.0))), 1),
ROUND(
CASE WHEN COALESCE(rs.role_change_flag, false) = true THEN
COALESCE(a.last5_avg,  a.season_avg, 0) * 0.60
+ COALESCE(a.last10_avg, a.season_avg, 0) * 0.25
+ COALESCE(a.season_avg, 0) * 0.15
ELSE
COALESCE(a.last3_avg,  a.season_avg, 0) * 0.35
+ COALESCE(a.last5_avg,  a.season_avg, 0) * 0.25
+ COALESCE(a.last10_avg, a.season_avg, 0) * 0.25
+ COALESCE(a.season_avg, 0) * 0.15
END
, 2) AS form_score,
ROUND(COALESCE(a.last3_avg, a.season_avg, 0) - COALESCE(a.last10_avg, a.season_avg, 0), 2),
now()
FROM agg a
LEFT JOIN afl.player_role_signals rs ON rs.player_id = a.player_id
ON CONFLICT (player_id) DO UPDATE SET
games_played  = EXCLUDED.games_played,
season_avg    = EXCLUDED.season_avg,
last3_avg     = EXCLUDED.last3_avg,
last5_avg     = EXCLUDED.last5_avg,
last10_avg    = EXCLUDED.last10_avg,
ceiling       = EXCLUDED.ceiling,
floor         = EXCLUDED.floor,
volatility    = EXCLUDED.volatility,
consistency   = EXCLUDED.consistency,
form_score    = EXCLUDED.form_score,
form_momentum = EXCLUDED.form_momentum,
updated_at    = now();

-- Step 5: feature_price — NEW value_score formula v2
-- Formula: (projection_final - expected_score) + (ceiling - projection_final) * 0.25 - (volatility_score * 0.15)
-- expected_score = price / 10000  (e.g. $600k → 60pts expected)
-- Exclusion: price <= $250k AND games_played = 0 (pre-season placeholder pricing)
-- No floor/ceiling clamp — allow negatives so the full population is differentiated
INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
SELECT
p.player_id,
pp2.price,
CASE
  -- Exclude pre-season placeholder prices with no game data
  WHEN pp2.price IS NULL OR pp2.price = 0 THEN NULL
  WHEN pp2.price <= 250000 AND COALESCE(fpf.games_played, 0) = 0 THEN NULL
  WHEN proj.projection_final IS NULL THEN NULL
  ELSE ROUND((
    -- Core: projection vs price-implied expected score
    (proj.projection_final::numeric - (pp2.price::numeric / 10000.0))
    -- Ceiling bonus: upside potential weighted at 25%
    + (COALESCE(proj.ceiling::numeric, proj.projection_final::numeric) - proj.projection_final::numeric) * 0.25
    -- Volatility penalty: risk-adjusted discount at 15%
    - (COALESCE(proj.volatility_score::numeric, 30.0) * 0.15)
  )::numeric, 2)
END AS value_score,
now()
FROM afl.players p
LEFT JOIN (
  SELECT DISTINCT ON (player_id) player_id, price
  FROM afl.player_prices
  ORDER BY player_id, updated_at DESC
) pp2 ON pp2.player_id = p.player_id
LEFT JOIN afl.player_projection proj ON proj.player_id = p.player_id
LEFT JOIN afl.feature_player_form fpf ON fpf.player_id = p.player_id
ON CONFLICT (player_id) DO UPDATE SET
price       = EXCLUDED.price,
value_score = EXCLUDED.value_score,
updated_at  = now();

-- Step 6: confidence refresh
SELECT afl.refresh_player_projection_confidence() INTO v_conf;

-- Step 7: populate venue_position_multiplier on player_projection
UPDATE afl.player_projection pp
SET venue_position_multiplier = COALESCE(opvc.concession_multiplier, 1.0)
FROM afl.players               pl
JOIN afl.v_current_player_team cpt ON cpt.player_id = pl.player_id
JOIN afl.v_next_games          ng  ON ng.team_id = cpt.team_id
LEFT JOIN afl.opponent_position_venue_concession opvc
ON  opvc.opponent_team_id = CASE
WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
ELSE ng.home_team_id
END
AND opvc.venue          = COALESCE(ng.venue, '')
AND opvc.position_group = COALESCE(pl.position_group, 'FWD')
WHERE pl.player_id = pp.player_id;

-- Step 8: refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

-- Step 9: sync AI prompt inputs
INSERT INTO ai.player_prompt_inputs (
player_id, player_name, team_name, position, price, projection, ceiling, floor,
risk, confidence, consistency, value_score, matchup_rating, venue_multiplier,
rest_days, form_score, form_momentum, neeko_rating, input_hash, created_at
)
SELECT
mv.player_id, mv.player_name, mv.team_name, mv.position, mv.price,
mv.projection, mv.ceiling, mv.floor, mv.risk, mv.confidence, mv.consistency,
mv.value_score, mv.matchup_rating, mv.venue_multiplier, mv.rest_days,
mv.form_score, mv.form_momentum, mv.neeko_rating,
md5(
COALESCE(mv.projection::text,        '') ||
COALESCE(mv.confidence::text,        '') ||
COALESCE(mv.risk::text,              '') ||
COALESCE(mv.value_score::text,       '') ||
COALESCE(mv.consistency::text,       '') ||
COALESCE(mv.matchup_rating::text,    '') ||
COALESCE(mv.price::text,             '')
),
now()
FROM afl.mv_player_projection mv
ON CONFLICT (player_id) DO UPDATE SET
player_name      = EXCLUDED.player_name,
team_name        = EXCLUDED.team_name,
position         = EXCLUDED.position,
price            = EXCLUDED.price,
projection       = EXCLUDED.projection,
ceiling          = EXCLUDED.ceiling,
floor            = EXCLUDED.floor,
risk             = EXCLUDED.risk,
confidence       = EXCLUDED.confidence,
consistency      = EXCLUDED.consistency,
value_score      = EXCLUDED.value_score,
matchup_rating   = EXCLUDED.matchup_rating,
venue_multiplier = EXCLUDED.venue_multiplier,
rest_days        = EXCLUDED.rest_days,
form_score       = EXCLUDED.form_score,
form_momentum    = EXCLUDED.form_momentum,
neeko_rating     = EXCLUDED.neeko_rating,
input_hash       = EXCLUDED.input_hash,
created_at       = now();

GET DIAGNOSTICS v_count = ROW_COUNT;

RETURN
'Projection engine refreshed. AI prompt inputs synced: ' || v_count ||
'. Confidence: ' || v_conf ||
'. Roles: ' || v_roles ||
'. Venue matchup: ' || v_venue ||
'. Breakout: ' || v_breakout ||
'. 2026 week: ' || v_curr_week ||
'. 2025 weight: ' || GREATEST(0.1, 0.6 - v_curr_week * 0.04);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Rebuild populate_rankings_cache_from_source with new tiers
-- The value_score scale has changed from [0, 14] → [-35, +48]
-- Thresholds are now percentile-driven at runtime (computed from live data)
-- New tiers: ELITE / STRONG / SOLID / NEUTRAL / FADE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
v_max_neeko  numeric;
v_val_elite  numeric;
v_val_strong numeric;
v_val_solid  numeric;
v_val_neutral numeric;
v_cap_min    numeric;
v_cap_max    numeric;
BEGIN

-- Compute max neeko for scaling
SELECT GREATEST(MAX(
round(
pp2.projection_final * 0.40
+ COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp2.projection_confidence, 50.0) * 0.20
+ COALESCE(pp2.consistency_score, 50.0) * 0.15
+ COALESCE(fp.value_score, 0.0) * 0.20
- COALESCE(pp2.volatility_score, 50.0) * 0.05
, 1)
), 1.0)
INTO v_max_neeko
FROM afl.player_projection pp2
LEFT JOIN afl.feature_price fp ON fp.player_id = pp2.player_id
LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp2.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp2.player_id;

-- Compute data-driven value tier thresholds from live distribution
-- Top 20% = ELITE, 20–40% = STRONG, 40–60% = SOLID, 60–80% = NEUTRAL, bottom 20% = FADE
SELECT
  PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY nr.value_score),
  PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY nr.value_score),
  PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY nr.value_score),
  PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY nr.value_score)
INTO v_val_elite, v_val_strong, v_val_solid, v_val_neutral
FROM afl.mv_player_rankings nr
WHERE nr.value_score IS NOT NULL;

-- Fallbacks if no data
v_val_elite   := COALESCE(v_val_elite,   7.0);
v_val_strong  := COALESCE(v_val_strong,  1.9);
v_val_solid   := COALESCE(v_val_solid,  -1.8);
v_val_neutral := COALESCE(v_val_neutral, -6.6);

-- Captain score normalisation range
SELECT
COALESCE(MIN(
nr2.ceiling * 0.40
+ nr2.projection * 0.25
+ COALESCE(nr2.consistency, 50.0) * 0.15
+ COALESCE(nr2.confidence, 50.0) * 0.10
+ COALESCE(nr2.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
- COALESCE(nr2.volatility_score, 50.0) * 0.05
), 0),
COALESCE(NULLIF(MAX(
nr2.ceiling * 0.40
+ nr2.projection * 0.25
+ COALESCE(nr2.consistency, 50.0) * 0.15
+ COALESCE(nr2.confidence, 50.0) * 0.10
+ COALESCE(nr2.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
- COALESCE(nr2.volatility_score, 50.0) * 0.05
), 0), 1)
INTO v_cap_min, v_cap_max
FROM afl.mv_player_rankings nr2;

DELETE FROM afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, position, position_group,
projection_final, projection, ceiling, floor, consistency, form_score,
neeko_rating, neeko_rating_raw, neeko_rating_scaled,
best_value_score, price, value_score, value_tag, value_tier,
projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
upside_rating, upside_pct, captain_score, captain_rating,
games_played,
ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
recommendation_strength,
ai_summary, ai_updated_at,
consistency_tier, total_count, cached_at, created_at,
start_sit_decision, edge_score, edge_tier, market_watch_category
)
SELECT
nr.player_id,
nr.player_name,
nr.team_name,
nr.team_name,
nr."position",
nr."position",

nr.projection::numeric                                            AS projection_final,
nr.projection::double precision                                   AS projection,
nr.ceiling::double precision,
nr.floor::double precision,
nr.consistency::double precision,
nr.form_score::double precision,

-- neeko_rating: value_score now on new scale; use COALESCE(..., 0) not 50
round(
nr.projection::numeric * 0.40
+ COALESCE(nr.confidence, 50.0)::numeric * 0.20
+ COALESCE(nr.consistency, 50.0)::numeric * 0.15
+ COALESCE(nr.value_score, 0.0)::numeric * 0.20
- COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
, 1)::double precision                                            AS neeko_rating,

round(
nr.projection::numeric * 0.40
+ COALESCE(nr.confidence, 50.0)::numeric * 0.20
+ COALESCE(nr.consistency, 50.0)::numeric * 0.15
+ COALESCE(nr.value_score, 0.0)::numeric * 0.20
- COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
, 1)::double precision                                            AS neeko_rating_raw,

LEAST(100.0, ROUND((
round(
nr.projection::numeric * 0.40
+ COALESCE(nr.confidence, 50.0)::numeric * 0.20
+ COALESCE(nr.consistency, 50.0)::numeric * 0.15
+ COALESCE(nr.value_score, 0.0)::numeric * 0.20
- COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
, 1) / v_max_neeko
) * 100.0, 1))::double precision                                  AS neeko_rating_scaled,

round((
nr.projection::numeric                            * 0.45
+ COALESCE(nr.value_score, 0.0)::numeric * 10.0   * 0.35
+ COALESCE(nr.confidence, 50.0)::numeric           * 0.20
), 1)::double precision                                            AS best_value_score,

COALESCE(pp.price, nr.price)::integer,
nr.value_score::double precision,

-- value_tag: 5-tier system (ELITE / STRONG / SOLID / NEUTRAL / FADE)
CASE
  WHEN nr.value_score IS NULL THEN NULL
  WHEN nr.value_score >= v_val_elite  THEN 'ELITE VALUE'
  WHEN nr.value_score >= v_val_strong THEN 'STRONG VALUE'
  WHEN nr.value_score >= v_val_solid  THEN 'SOLID VALUE'
  WHEN nr.value_score >= v_val_neutral THEN 'NEUTRAL'
  ELSE 'FADE'
END                                                                AS value_tag,

-- value_tier (same labels, used for filtering)
CASE
  WHEN nr.value_score IS NULL THEN NULL
  WHEN nr.value_score >= v_val_elite  THEN 'ELITE VALUE'
  WHEN nr.value_score >= v_val_strong THEN 'STRONG VALUE'
  WHEN nr.value_score >= v_val_solid  THEN 'SOLID VALUE'
  WHEN nr.value_score >= v_val_neutral THEN 'NEUTRAL'
  ELSE 'FADE'
END                                                                AS value_tier,

LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision AS projection_confidence,

CASE
  WHEN COALESCE(nr.confidence, 50) >= 70
  THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
  WHEN COALESCE(nr.confidence, 50) <= 45
  THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
  ELSE COALESCE(nr.volatility_score, 50.0)
END::double precision                                              AS risk_rating,

CASE
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
  ELSE 'TOUGH'
END                                                                AS matchup_rating,
CASE
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
  WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
  ELSE 'TOUGH'
END                                                                AS matchup_label,
COALESCE(nr.matchup_multiplier::numeric, 1.0)                     AS matchup_multiplier,

LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
COALESCE(nr.breakout_probability * 100.0, 0)::double precision    AS upside_pct,

-- Captain score normalized 0–100
LEAST(100.0, GREATEST(0.0,
ROUND(
100.0 * (
(
nr.ceiling::numeric * 0.40
+ nr.projection::numeric * 0.25
+ COALESCE(nr.consistency, 50.0)::numeric * 0.15
+ COALESCE(nr.confidence, 50.0)::numeric * 0.10
+ COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
- COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
) - v_cap_min
) / NULLIF(v_cap_max - v_cap_min, 0)
, 1)
))::double precision                                               AS captain_score,

CASE
  WHEN LEAST(100.0, GREATEST(0.0,
    ROUND(100.0 * ((nr.ceiling::numeric * 0.40 + nr.projection::numeric * 0.25
    + COALESCE(nr.consistency, 50.0)::numeric * 0.15 + COALESCE(nr.confidence, 50.0)::numeric * 0.10
    + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
    - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05) - v_cap_min)
    / NULLIF(v_cap_max - v_cap_min, 0), 1)
  )) >= 80 THEN 'Elite Captain'
  WHEN LEAST(100.0, GREATEST(0.0,
    ROUND(100.0 * ((nr.ceiling::numeric * 0.40 + nr.projection::numeric * 0.25
    + COALESCE(nr.consistency, 50.0)::numeric * 0.15 + COALESCE(nr.confidence, 50.0)::numeric * 0.10
    + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
    - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05) - v_cap_min)
    / NULLIF(v_cap_max - v_cap_min, 0), 1)
  )) >= 60 THEN 'Strong Captain'
  WHEN LEAST(100.0, GREATEST(0.0,
    ROUND(100.0 * ((nr.ceiling::numeric * 0.40 + nr.projection::numeric * 0.25
    + COALESCE(nr.consistency, 50.0)::numeric * 0.15 + COALESCE(nr.confidence, 50.0)::numeric * 0.10
    + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
    - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05) - v_cap_min)
    / NULLIF(v_cap_max - v_cap_min, 0), 1)
  )) >= 40 THEN 'Captain Option'
  ELSE 'Avoid'
END                                                                AS captain_rating,

COALESCE(nr.games_played, 0)::integer                             AS games_played,

-- ai_recommendation: recalibrated to new value_score scale
-- BUY: elite value (top 20%) + strong projection + low volatility
-- HOLD: solid value (top 60%) + decent projection
-- SELL: everything else
CASE
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  AND COALESCE(nr.volatility_score, 50.0) <= 45.0
  THEN 'BUY'
  WHEN COALESCE(nr.value_score, -99) >= v_val_solid
  AND nr.projection::numeric >= 70
  THEN 'HOLD'
  ELSE 'SELL'
END                                                                AS ai_recommendation,

CASE
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  AND COALESCE(nr.volatility_score, 50.0) <= 45.0
  THEN 'green'
  WHEN COALESCE(nr.value_score, -99) >= v_val_solid
  AND nr.projection::numeric >= 70
  THEN 'grey'
  ELSE 'red'
END                                                                AS recommendation_color,

aia.summary_short                                                  AS recommendation_short,
aia.summary_long                                                   AS recommendation_why,

CASE
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  AND COALESCE(nr.volatility_score, 50.0) <= 45.0
  AND COALESCE(nr.confidence, 50) >= 70
  THEN 'STRONG'
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  THEN 'MODERATE'
  WHEN COALESCE(nr.value_score, -99) >= v_val_solid
  AND nr.projection::numeric >= 70
  THEN 'MODERATE'
  ELSE 'WEAK'
END                                                                AS recommendation_strength,

aia.summary_long                                                   AS ai_summary,
aia.generated_at                                                   AS ai_updated_at,

CASE
  WHEN nr.consistency >= 75 THEN 'Elite'
  WHEN nr.consistency >= 60 THEN 'Consistent'
  WHEN nr.consistency >= 40 THEN 'Volatile'
  ELSE 'Boom-Bust'
END                                                                AS consistency_tier,
0,
now(),
now(),

-- start_sit_decision
CASE
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  AND COALESCE(nr.volatility_score, 50.0) <= 45.0
  AND COALESCE(nr.confidence, 50) >= 60
  THEN 'START'
  WHEN NOT (COALESCE(nr.value_score, -99) >= v_val_solid AND nr.projection::numeric >= 70)
  THEN 'SIT'
  ELSE 'CONSIDER'
END                                                                AS start_sit_decision,

-- edge_score (0–100): uses value_score on new scale
-- Normalise value_score: compare to v_val_solid as zero-point, v_val_elite as full
CASE
  WHEN (
    CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END
  ) >= 2 THEN NULL
  ELSE LEAST(100, GREATEST(0, ROUND((
    LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
    LEAST(GREATEST(
      (COALESCE(nr.value_score, v_val_neutral) - v_val_neutral) /
      NULLIF(v_val_elite - v_val_neutral, 1), 0), 1) * 0.25 +
    LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
    LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
  ) * 100)::integer))
END                                                                AS edge_score,

-- edge_tier
CASE
  WHEN (
    CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END +
    CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END
  ) >= 2 THEN NULL
  WHEN LEAST(100, GREATEST(0, ROUND((
    LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
    LEAST(GREATEST(
      (COALESCE(nr.value_score, v_val_neutral) - v_val_neutral) /
      NULLIF(v_val_elite - v_val_neutral, 1), 0), 1) * 0.25 +
    LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
    LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
  ) * 100)::integer)) >= 90 THEN 'Elite Edge'
  WHEN LEAST(100, GREATEST(0, ROUND((
    LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
    LEAST(GREATEST(
      (COALESCE(nr.value_score, v_val_neutral) - v_val_neutral) /
      NULLIF(v_val_elite - v_val_neutral, 1), 0), 1) * 0.25 +
    LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
    LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
  ) * 100)::integer)) >= 75 THEN 'Strong Edge'
  WHEN LEAST(100, GREATEST(0, ROUND((
    LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
    LEAST(GREATEST(
      (COALESCE(nr.value_score, v_val_neutral) - v_val_neutral) /
      NULLIF(v_val_elite - v_val_neutral, 1), 0), 1) * 0.25 +
    LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
    LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
  ) * 100)::integer)) >= 60 THEN 'Playable Edge'
  ELSE 'Monitor'
END                                                                AS edge_tier,

-- market_watch_category
CASE
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  AND COALESCE(nr.volatility_score, 50.0) <= 45.0
  AND COALESCE(nr.games_played, 99) <= 3
  THEN 'CASH COW'
  WHEN COALESCE(nr.value_score, -99) >= v_val_elite
  AND nr.projection::numeric >= 95
  THEN 'BUY TARGET'
  WHEN NOT (COALESCE(nr.value_score, -99) >= v_val_solid AND nr.projection::numeric >= 70)
  AND COALESCE(nr.volatility_score, 50.0) >= 60.0
  THEN 'TRAP'
  WHEN NOT (COALESCE(nr.value_score, -99) >= v_val_solid AND nr.projection::numeric >= 70)
  THEN 'SELL'
  WHEN COALESCE(nr.form_score, 0) >= 70
  AND nr.projection::numeric >= 85
  THEN 'TRENDING UP'
  ELSE NULL
END                                                                AS market_watch_category

FROM afl.mv_player_rankings           nr
LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;
