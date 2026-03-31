/*
  # Phase 2 + 7: Fix value_score Formula and Season Weighting

  ## Problem
  - feature_price.value_score is always NULL in the pipeline (Step 5 of refresh_projection_engine sets it to NULL)
  - This causes neeko_rating to fall back to value_score=50 for all players
  - Rookies with $230k prices were getting value_scores of 400+ due to bad formula

  ## Fix
  New value_score formula: LEAST((projection_final - 60) / (price / 100000), 130)
  - A player projecting 120 at $600k = (120-60)/(6) = 10 — low value
  - A player projecting 90 at $300k = (90-60)/(3) = 10 — fair
  - A player projecting 80 at $230k = (80-60)/(2.3) = 8.7 — modest
  - A player projecting 115 at $400k = (115-60)/(4) = 13.75 — strong
  - Capped at 130 to prevent infinite scaling on cheap players with no games

  ## Phase 7: Season Weighting in feature_player_form
  - 2026 games: weight = 1.0
  - 2025 games: weight = GREATEST(0.1, 0.6 - week * 0.04)
  - As 2026 rounds progress, 2025 data becomes increasingly discounted
  - Current week 0 (pre-season): 2025 weight = 0.6 — still significant
  - Week 5: 2025 weight = 0.4
  - Week 13+: 2025 weight = 0.1 (minimum)

  ## Changes
  - Updates Step 5 in refresh_projection_engine to compute real value_score
  - Updates Step 4 to apply season-weighted averages
  - Rebuilds the full afl.refresh_projection_engine function
*/

CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $function$
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
-- 2026 games weight = 1.0
-- 2025 games weight = GREATEST(0.1, 0.6 - current_2026_week * 0.04)
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
    -- weighted score for season avg
    pg.fantasy_score * CASE
      WHEN g.season = 2026 THEN (SELECT w_2026 FROM season_weights)
      WHEN g.season = 2025 THEN (SELECT w_2025 FROM season_weights)
      ELSE 0.1
    END AS weighted_score,
    COUNT(*) FILTER (WHERE pg.fantasy_score > 0)
      OVER (PARTITION BY pg.player_id) AS total_games,
    -- count 2026 games only
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
    -- season_avg uses weighted scores (2025 discounted based on how far into 2026 we are)
    ROUND(SUM(weighted_score)::numeric / NULLIF(COUNT(*), 0), 2)         AS season_avg,
    -- last3/5/10 use most recent games regardless of season (recency matters most)
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

-- Step 5: feature_price — compute REAL value_score
-- Formula: LEAST((projection_final - 60) / (price / 100000), 130)
-- Clamped at 0 minimum and 130 maximum
-- Requires player_projection to have projection_final populated
INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
SELECT
  p.player_id,
  pp2.price,
  CASE
    WHEN pp2.price IS NULL OR pp2.price = 0 OR pp2.price < 100000 THEN NULL
    WHEN proj.projection_final IS NULL THEN NULL
    ELSE LEAST(
      130.0,
      GREATEST(
        0.0,
        (proj.projection_final::numeric - 60.0) / (pp2.price::numeric / 100000.0)
      )
    )
  END AS value_score,
  now()
FROM afl.players p
LEFT JOIN (
  SELECT DISTINCT ON (player_id) player_id, price
  FROM afl.player_prices
  ORDER BY player_id, updated_at DESC
) pp2 ON pp2.player_id = p.player_id
LEFT JOIN afl.player_projection proj ON proj.player_id = p.player_id
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

-- Step 8: refresh materialized view (uses new neeko_rating formula from Phase 1)
REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

-- Step 9: sync AI prompt inputs with fixed input_hash (Phase 5)
-- Hash now includes: projection_final, confidence, risk, value_score, consistency, matchup, price
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
  -- Phase 5: fixed input_hash includes all key projection fields
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
$function$;
