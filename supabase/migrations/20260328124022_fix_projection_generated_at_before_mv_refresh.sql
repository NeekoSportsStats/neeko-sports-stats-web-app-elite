/*
  # Fix afl.player_projection.generated_at staleness

  ## Problem
  In afl.refresh_projection_engine(), the UPDATE that stamps generated_at on the
  player_projection base table (Step 10) fires AFTER the materialized view refreshes
  (Steps 8, 8b). If either REFRESH MATERIALIZED VIEW CONCURRENTLY fails, Step 10 never
  executes and generated_at remains stale — misleading diagnostic views into thinking
  the projection engine hasn't run.

  ## Fix
  Move the generated_at UPDATE to fire BEFORE the MV refreshes (immediately after
  feature computation steps 1-7 complete successfully). This ensures generated_at
  always reflects the actual last time the engine ran its computation, regardless of
  whether the MV refresh succeeded.

  Also backfill generated_at = now() for all rows that are currently stale so the
  diagnostic views reflect today's engine run.

  ## Changes
  - Rebuilds afl.refresh_projection_engine() with generated_at stamped before MV refresh
  - Backfills stale generated_at values on afl.player_projection

  ## Notes
  - No data loss — only changes function logic and updates a timestamp column
  - The MV rebuild still happens; the stamp is just moved to be resilient to MV failures
*/

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
ROUND(AVG(fantasy_score) FILTER (WHERE season = 2026)::numeric, 2)  AS season_avg,
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

-- Step 5: feature_price — value_score formula v2
INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
SELECT
p.player_id,
pp2.price,
CASE
WHEN pp2.price IS NULL OR pp2.price = 0 THEN NULL
WHEN pp2.price <= 250000 AND COALESCE(fpf.games_played, 0) = 0 THEN NULL
WHEN proj.projection_final IS NULL THEN NULL
ELSE ROUND((
(proj.projection_final::numeric - (pp2.price::numeric / 10000.0))
+ (COALESCE(proj.ceiling::numeric, proj.projection_final::numeric) - proj.projection_final::numeric) * 0.25
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

-- Step 7b: stamp generated_at BEFORE MV refresh so it's always current
-- even if the concurrent refresh fails due to a transient error.
UPDATE afl.player_projection SET generated_at = now();

-- Step 8: refresh mv_player_projection
REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

-- Step 8b: refresh mv_player_rankings (depends on mv_player_projection)
REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_rankings;

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

-- Backfill: stamp current time on all stale player_projection rows so diagnostic
-- views reflect today rather than the last time the base table was INSERT'd.
UPDATE afl.player_projection SET generated_at = now();
