/*
  # Projection Engine Rebuild — Step 6: v_rankings_master Frontend View

  ## Purpose
  Single endpoint for all frontend ranking queries.
  The frontend must ONLY query this view — no direct table or feature table access.

  ## Source
  Joins afl.mv_player_projection with ai.player_ai_analysis.
  All player metadata (name, team, position, price) is denormalised here
  so the frontend makes a single query.

  ## Captain score
  Derived as projection × 2 × (consistency / 100) — a risk-weighted captain metric.

  ## Score probabilities
  Derived from projection + volatility using a normal approximation:
    prob_80  = P(score >= 80)  — simple tier from projection / 80
    prob_100 = P(score >= 100) — simple tier from projection / 100
    prob_120 = P(score >= 120) — simple tier from projection / 120
  Clamped 0–1. These are relative indicators, not calibrated probabilities.

  ## Security
  - SECURITY DEFINER so anon role can read through RLS on underlying tables.
  - GRANT SELECT to authenticated and anon.
*/

DROP VIEW IF EXISTS afl.v_rankings_master;

CREATE OR REPLACE VIEW afl.v_rankings_master
WITH (security_invoker = false)
AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.team_id,
  mv.position,
  mv.price,

  -- Next game context
  mv.game_date,
  mv.venue,
  mv.opponent_name,
  mv.is_home,

  -- Projection chain
  mv.projection,
  mv.floor,
  mv.ceiling,

  -- Risk / confidence
  mv.risk,
  mv.confidence,
  mv.consistency,

  -- Value
  mv.value_score,

  -- Neeko rating
  mv.neeko_rating,

  -- Captain score (risk-weighted double)
  ROUND(mv.projection * 2.0 * (COALESCE(mv.consistency, 50.0) / 100.0), 1) AS captain_score,

  -- Score probability tiers (relative indicators, clamped 0–1)
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 80.0  - 0.3))::numeric, 3) AS prob_80,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 100.0 - 0.3))::numeric, 3) AS prob_100,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 120.0 - 0.3))::numeric, 3) AS prob_120,

  -- Form context
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_score,
  mv.form_momentum,
  mv.games_played,

  -- Matchup context
  mv.matchup_rating,
  mv.opponent_rank_vs_position,

  -- Venue / rest context
  mv.venue_multiplier,
  mv.home_advantage,
  mv.rest_days,
  mv.short_turnaround_flag,

  -- AI analysis
  ai.recommendation      AS ai_recommendation,
  ai.summary_short       AS ai_summary_short,
  ai.summary_long        AS ai_summary_long,
  ai.confidence          AS ai_confidence,
  ai.generated_at        AS ai_generated_at,

  mv.updated_at

FROM afl.mv_player_projection mv
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = mv.player_id
ORDER BY mv.neeko_rating DESC NULLS LAST;

GRANT SELECT ON afl.v_rankings_master TO authenticated;
GRANT SELECT ON afl.v_rankings_master TO anon;

-- ─────────────────────────────────────────
-- Pipeline refresh function
-- Called at the end of the processing pipeline to update all layers atomically.
-- Sequence:
--   1. Re-populate feature tables
--   2. Re-populate player_projection
--   3. Refresh materialized view
--   4. Re-populate ai.player_prompt_inputs
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, ai, public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Step 1: feature_player_form
  INSERT INTO afl.feature_player_form (
    player_id, games_played, season_avg, last3_avg, last5_avg, last10_avg,
    ceiling, floor, volatility, consistency, form_score, form_momentum, updated_at
  )
  WITH ranked_scores AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn,
      COUNT(*) FILTER (WHERE pg.fantasy_score > 0) OVER (PARTITION BY pg.player_id) AS total_games
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  agg AS (
    SELECT
      player_id,
      MAX(total_games)::integer                                                        AS games_played,
      ROUND(AVG(fantasy_score)::numeric, 2)                                            AS season_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 3)::numeric, 2)                    AS last3_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)                    AS last5_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 10)::numeric, 2)                   AS last10_avg,
      PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score)::integer             AS ceiling,
      PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score)::integer             AS floor,
      ROUND(CASE
        WHEN AVG(fantasy_score) = 0 THEN NULL
        ELSE STDDEV(fantasy_score)::numeric / AVG(fantasy_score)::numeric * 100
      END, 2) AS volatility
    FROM ranked_scores GROUP BY player_id
  )
  SELECT
    player_id, COALESCE(games_played, 0),
    season_avg, last3_avg, last5_avg, last10_avg, ceiling, floor, volatility,
    ROUND(LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(volatility, 50.0))), 1),
    ROUND(
      COALESCE(last3_avg, season_avg, 0) * 0.35 + COALESCE(last5_avg, season_avg, 0) * 0.25 +
      COALESCE(last10_avg, season_avg, 0) * 0.25 + COALESCE(season_avg, 0) * 0.15, 2),
    ROUND(COALESCE(last3_avg, season_avg, 0) - COALESCE(last10_avg, season_avg, 0), 2),
    now()
  FROM agg
  ON CONFLICT (player_id) DO UPDATE SET
    games_played = EXCLUDED.games_played, season_avg = EXCLUDED.season_avg,
    last3_avg = EXCLUDED.last3_avg, last5_avg = EXCLUDED.last5_avg,
    last10_avg = EXCLUDED.last10_avg, ceiling = EXCLUDED.ceiling,
    floor = EXCLUDED.floor, volatility = EXCLUDED.volatility,
    consistency = EXCLUDED.consistency, form_score = EXCLUDED.form_score,
    form_momentum = EXCLUDED.form_momentum, updated_at = now();

  -- Step 2: feature_price
  INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
  SELECT p.player_id, pp.price, NULL, now()
  FROM afl.players p
  LEFT JOIN (
    SELECT DISTINCT ON (player_id) player_id, price
    FROM afl.player_prices ORDER BY player_id, updated_at DESC
  ) pp ON pp.player_id = p.player_id
  ON CONFLICT (player_id) DO UPDATE SET price = EXCLUDED.price, updated_at = now();

  -- Step 3: refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

  -- Step 4: sync prompt inputs
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
      COALESCE(mv.projection::text, '') || COALESCE(mv.ceiling::text, '') ||
      COALESCE(mv.floor::text, '') || COALESCE(mv.matchup_rating::text, '') ||
      COALESCE(mv.price::text, '') || COALESCE(mv.form_score::text, '') ||
      COALESCE(mv.neeko_rating::text, '')
    ), now()
  FROM afl.mv_player_projection mv
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = EXCLUDED.player_name, team_name = EXCLUDED.team_name,
    position = EXCLUDED.position, price = EXCLUDED.price,
    projection = EXCLUDED.projection, ceiling = EXCLUDED.ceiling,
    floor = EXCLUDED.floor, risk = EXCLUDED.risk,
    confidence = EXCLUDED.confidence, consistency = EXCLUDED.consistency,
    value_score = EXCLUDED.value_score, matchup_rating = EXCLUDED.matchup_rating,
    venue_multiplier = EXCLUDED.venue_multiplier, rest_days = EXCLUDED.rest_days,
    form_score = EXCLUDED.form_score, form_momentum = EXCLUDED.form_momentum,
    neeko_rating = EXCLUDED.neeko_rating, input_hash = EXCLUDED.input_hash,
    created_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Projection engine refreshed. AI prompt inputs synced: ' || v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.refresh_projection_engine() TO service_role;
