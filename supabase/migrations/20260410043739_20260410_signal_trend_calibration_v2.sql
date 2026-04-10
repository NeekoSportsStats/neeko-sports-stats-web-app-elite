/*
  # Signal + Trend Calibration v2

  ## Summary
  Recalibrates threshold values in fn_populate_player_rankings_cache to produce
  more balanced signal distributions.

  ## Changes

  ### 1. Signal Thresholds (START / HOLD / SIT via edge_capped)
  OLD: STRONG_START >= 15, START >= 6, HOLD > -6, SIT > -15, STRONG_SIT else
  NEW: STRONG_START >= 15, START >= 8, HOLD > -8, SIT > -15, STRONG_SIT else

  Rationale: START was ~37% (target 20-30%). Tightening entry from 6→8 and
  exit from -6→-8 pulls START down toward 25-30% and SIT up toward 25-28%.

  ### 2. Trend Thresholds (STRONG_UP / UP / STABLE / DOWN / STRONG_DOWN)
  OLD: STRONG_UP >= 12, UP >= 5, STABLE > -3, DOWN > -10, STRONG_DOWN else
  NEW: STRONG_UP >= 18, UP >= 8, STABLE > -5, DOWN > -15, STRONG_DOWN else

  Rationale: STRONG_UP + UP were ~42% combined (inflated). Wider thresholds
  expand STABLE band and reduce noise from small projection deltas.

  ## No structural changes — only threshold values modified.
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted int;
BEGIN

WITH src AS (
  SELECT
    mv.player_id,
    mv.player_name,
    mv.team_name,
    mv.team_id,
    mv.position,
    COALESCE(mv.price, 0)                              AS price,
    ROUND(mv.projection::numeric, 1)                   AS projection_final,
    mv.projection::double precision                    AS projection,
    ROUND(mv.season_avg::numeric, 1)                   AS season_avg,
    ROUND(mv.last3_avg::numeric, 1)                    AS last_3_avg,
    ROUND(mv.last5_avg::numeric, 1)                    AS last_5_avg,
    mv.ceiling::double precision                       AS ceiling,
    mv.floor::double precision                         AS floor,
    ROUND(mv.consistency::numeric, 1)                  AS consistency,
    ROUND(mv.form_score::numeric, 1)                   AS form_score,
    mv.opponent_name                                   AS matchup_label,
    mv.matchup_multiplier::numeric                     AS matchup_multiplier,
    ROUND(mv.neeko_rating::numeric, 1)                 AS neeko_rating,
    ROUND(mv.confidence::numeric, 1)                   AS projection_confidence,
    mv.confidence_tier,
    CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision AS risk_rating,
    mv.games_played,
    COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
    pl.manual_status,
    COALESCE(pl.manual_status, 'active')               AS status,

    -- BREAKEVEN: stable estimate based on games played
    ROUND(
      GREATEST(
        CASE
          WHEN COALESCE(mv.games_played, 0) = 0 THEN
            COALESCE(
              mv.last5_avg::numeric,
              mv.last3_avg::numeric,
              mv.last10_avg::numeric,
              mv.projection::numeric
            )
          WHEN COALESCE(mv.games_played, 0) <= 2 THEN
            (
              0.4 * mv.season_avg::numeric
              + 0.6 * COALESCE(
                mv.last5_avg::numeric,
                mv.last3_avg::numeric,
                mv.last10_avg::numeric,
                mv.season_avg::numeric
              )
            )
          ELSE
            mv.season_avg::numeric
        END,
        0
      ),
      1
    ) AS breakeven_val,

    pa.summary_short,
    pa.summary_long,
    pa.recommendation                                  AS recommendation_short

  FROM afl.mv_player_projection mv
  LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
  WHERE mv.projection::numeric > 30
  AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),
src_with_edge AS (
  SELECT
    *,
    ROUND(projection_final - breakeven_val, 1) AS edge_raw
  FROM src
),
src_with_signal AS (
  SELECT
    *,
    LEAST(GREATEST(edge_raw, -40.0), 40.0) AS edge_capped,
    -- SIGNAL: tightened START to >=8 and SIT to <=-8 (was 6/-6)
    -- This pulls START from ~37% toward 25-30%, pushes HOLD broader
    CASE
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 15  THEN 'STRONG_START'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 8   THEN 'START'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -8   THEN 'HOLD'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -15  THEN 'SIT'
      ELSE 'STRONG_SIT'
    END AS sig,
    -- TREND: wider bands (was 12/5/-3/-10)
    -- STRONG_UP >=18, UP >=8, STABLE >-5, DOWN >-15, else STRONG_DOWN
    ROUND(
      projection_final - COALESCE(season_avg, last_5_avg, last_3_avg),
      1
    ) AS trend_score_val,
    CASE
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 18  THEN 'STRONG_UP'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 8   THEN 'UP'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -5   THEN 'STABLE'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -15  THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS trend_signal_val
  FROM src_with_edge
)
INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, team_id, position,
  price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
  ceiling, floor, consistency, form_score, matchup_label, matchup_multiplier,
  neeko_rating, neeko_rating_scaled, projection_confidence, confidence_tier, risk_rating,
  games_played, is_available, manual_status, status,
  breakeven, breakeven_canonical, baseline,
  edge, edge_canonical,
  value_score, value_score_canonical,
  signal, signal_tag, signal_display, signal_canonical,
  category_canonical, action_canonical, market_watch_category,
  trend_score, trend_signal,
  ai_summary, summary_short, summary_long, recommendation_short,
  cached_at
)
SELECT
  player_id, player_name, team_name, team_name, team_id, position,
  price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
  ceiling, floor, consistency, form_score, matchup_label, matchup_multiplier,
  neeko_rating, neeko_rating, projection_confidence, confidence_tier, risk_rating,
  games_played, is_available, manual_status, status,
  breakeven_val, breakeven_val, breakeven_val,
  edge_raw, edge_raw,
  edge_raw, edge_raw,
  sig, sig,
  CASE sig
    WHEN 'STRONG_START' THEN 'Strong Start'
    WHEN 'START'        THEN 'Start'
    WHEN 'HOLD'         THEN 'Watch'
    WHEN 'SIT'          THEN 'Avoid'
    WHEN 'STRONG_SIT'   THEN 'Hard Avoid'
  END,
  sig,
  CASE sig
    WHEN 'STRONG_START' THEN 'Target'
    WHEN 'START'        THEN 'Target'
    WHEN 'HOLD'         THEN 'Watch'
    WHEN 'SIT'          THEN 'Avoid'
    WHEN 'STRONG_SIT'   THEN 'Avoid'
  END,
  CASE sig
    WHEN 'STRONG_START' THEN 'START'
    WHEN 'START'        THEN 'START'
    WHEN 'HOLD'         THEN 'HOLD'
    WHEN 'SIT'          THEN 'SIT'
    WHEN 'STRONG_SIT'   THEN 'SIT'
  END,
  CASE sig
    WHEN 'STRONG_START' THEN 'Target'
    WHEN 'START'        THEN 'Target'
    WHEN 'HOLD'         THEN 'Watch'
    WHEN 'SIT'          THEN 'Avoid'
    WHEN 'STRONG_SIT'   THEN 'Avoid'
  END,
  trend_score_val, trend_signal_val,
  summary_short, summary_short, summary_long, recommendation_short,
  NOW()

FROM src_with_signal

ON CONFLICT (player_id) DO UPDATE SET
  player_name           = EXCLUDED.player_name,
  team                  = EXCLUDED.team,
  team_name             = EXCLUDED.team_name,
  team_id               = EXCLUDED.team_id,
  position              = EXCLUDED.position,
  price                 = EXCLUDED.price,
  projection_final      = EXCLUDED.projection_final,
  projection            = EXCLUDED.projection,
  season_avg            = EXCLUDED.season_avg,
  last_3_avg            = EXCLUDED.last_3_avg,
  last_5_avg            = EXCLUDED.last_5_avg,
  ceiling               = EXCLUDED.ceiling,
  floor                 = EXCLUDED.floor,
  consistency           = EXCLUDED.consistency,
  form_score            = EXCLUDED.form_score,
  matchup_label         = EXCLUDED.matchup_label,
  matchup_multiplier    = EXCLUDED.matchup_multiplier,
  neeko_rating          = EXCLUDED.neeko_rating,
  neeko_rating_scaled   = EXCLUDED.neeko_rating_scaled,
  projection_confidence = EXCLUDED.projection_confidence,
  confidence_tier       = EXCLUDED.confidence_tier,
  risk_rating           = EXCLUDED.risk_rating,
  games_played          = EXCLUDED.games_played,
  is_available          = EXCLUDED.is_available,
  manual_status         = EXCLUDED.manual_status,
  status                = EXCLUDED.status,
  breakeven             = EXCLUDED.breakeven,
  breakeven_canonical   = EXCLUDED.breakeven_canonical,
  baseline              = EXCLUDED.baseline,
  edge                  = EXCLUDED.edge,
  edge_canonical        = EXCLUDED.edge_canonical,
  value_score           = EXCLUDED.value_score,
  value_score_canonical = EXCLUDED.value_score_canonical,
  signal                = EXCLUDED.signal,
  signal_tag            = EXCLUDED.signal_tag,
  signal_display        = EXCLUDED.signal_display,
  signal_canonical      = EXCLUDED.signal_canonical,
  category_canonical    = EXCLUDED.category_canonical,
  action_canonical      = EXCLUDED.action_canonical,
  market_watch_category = EXCLUDED.market_watch_category,
  trend_score           = EXCLUDED.trend_score,
  trend_signal          = EXCLUDED.trend_signal,
  ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
  summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
  summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
  recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
  cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'cache_seed',
  'fn_populate_player_rankings_cache (calibration v2): ' || v_inserted || ' rows upserted',
  NOW()
)
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$$;
