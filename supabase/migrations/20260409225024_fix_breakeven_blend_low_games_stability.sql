/*
  # Fix breakeven stability for players with very few games played

  ## Problem
  Players with 1-2 games in the current season have unstable season averages
  that distort the edge calculation.

  Example: Hugh McCluggage scored 20 in round 1 only.
  - season_avg = 20 (based on 1 game)
  - last5_avg = 83 (prior season form)
  - breakeven was 20, edge = 82 → STRONG_START with inflated signal

  ## Fix: Weighted blend for small sample sizes
  
  Breakeven formula:
  - 0 games:   use COALESCE(last5_avg, last3_avg, last10_avg, projection)   [no current season data]
  - 1-2 games: 40% season_avg + 60% COALESCE(last5_avg, last3_avg, projection)  [blend for stability]
  - 3+ games:  season_avg only  [enough data to trust]

  This prevents 1-game outliers from creating artificially inflated edge values.

  ## Changes
  - Rebuilds afl.fn_populate_player_rankings_cache() with blended breakeven
  - Rebuilds afl.populate_rankings_cache() with same blended breakeven
  - Immediately re-runs cache population
*/

-- ============================================================
-- STEP 1: Rebuild seed function with blended breakeven
-- ============================================================

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $function$
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
  --   0 games:   prior-season rolling avg (no current data)
  --   1-2 games: blended 40% current / 60% prior (small sample, dampen outliers)
  --   3+ games:  season_avg only (enough data to trust)
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
  CASE
    WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 15  THEN 'STRONG_START'
    WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 6   THEN 'START'
    WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -6   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -15  THEN 'SIT'
    ELSE 'STRONG_SIT'
  END AS sig
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
  ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
  summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
  summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
  recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
  cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'cache_seed',
  'fn_populate_player_rankings_cache: ' || v_inserted || ' rows upserted (blended breakeven: 0gp=last5, 1-2gp=40/60 blend, 3+gp=season_avg)',
  NOW()
)
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$function$;


-- ============================================================
-- STEP 2: Same blended breakeven in the enrichment/update pass
-- ============================================================

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN

  WITH projection_data AS (
    SELECT
      mv.player_id,
      mv.player_name,
      mv.team_name,
      mv.team_id,
      mv.position,
      COALESCE(mv.price, 0)                  AS price,
      ROUND(mv.projection::numeric, 1)       AS projection_final,
      mv.projection::double precision        AS projection,
      ROUND(mv.season_avg::numeric, 1)       AS season_avg,
      ROUND(mv.last3_avg::numeric, 1)        AS last_3_avg,
      ROUND(mv.last5_avg::numeric, 1)        AS last_5_avg,
      mv.ceiling::double precision           AS ceiling,
      mv.floor::double precision             AS floor,
      ROUND(mv.consistency::numeric, 1)      AS consistency,
      ROUND(mv.form_score::numeric, 1)       AS form_score,
      mv.opponent_name                       AS matchup_label,
      mv.matchup_multiplier::numeric         AS matchup_multiplier,
      ROUND(mv.neeko_rating::numeric, 1)     AS neeko_rating,
      ROUND(mv.confidence::numeric, 1)       AS projection_confidence,
      mv.confidence_tier,
      CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision AS risk_rating,
      mv.games_played,
      COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
      pl.manual_status,
      COALESCE(pl.manual_status, 'active') AS status,

      -- BREAKEVEN: stable blended estimate
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
      pa.recommendation AS recommendation_short

    FROM afl.mv_player_projection mv
    LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
    LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
    WHERE mv.projection::numeric > 30
    AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
  ),
  projection_with_edge AS (
    SELECT
      *,
      ROUND(projection_final - breakeven_val, 1) AS edge_val
    FROM projection_data
  ),
  projection_with_signal AS (
    SELECT
      *,
      LEAST(GREATEST(edge_val, -40.0), 40.0) AS edge_capped,
      CASE
        WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) >= 15  THEN 'STRONG_START'
        WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) >= 6   THEN 'START'
        WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) > -6   THEN 'HOLD'
        WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) > -15  THEN 'SIT'
        ELSE 'STRONG_SIT'
      END AS sig
    FROM projection_with_edge
  )
  UPDATE afl.player_rankings_cache rc
  SET
    player_name           = pp.player_name,
    team                  = pp.team_name,
    team_name             = pp.team_name,
    team_id               = pp.team_id,
    position              = pp.position,
    price                 = pp.price,
    projection_final      = pp.projection_final,
    projection            = pp.projection,
    season_avg            = pp.season_avg,
    last_3_avg            = pp.last_3_avg,
    last_5_avg            = pp.last_5_avg,
    ceiling               = pp.ceiling,
    floor                 = pp.floor,
    consistency           = pp.consistency,
    form_score            = pp.form_score,
    matchup_label         = pp.matchup_label,
    matchup_multiplier    = pp.matchup_multiplier,
    neeko_rating          = pp.neeko_rating,
    neeko_rating_scaled   = pp.neeko_rating,
    projection_confidence = pp.projection_confidence,
    confidence_tier       = pp.confidence_tier,
    risk_rating           = pp.risk_rating,
    games_played          = pp.games_played,
    is_available          = pp.is_available,
    manual_status         = pp.manual_status,
    status                = pp.status,
    breakeven             = pp.breakeven_val,
    breakeven_canonical   = pp.breakeven_val,
    baseline              = pp.breakeven_val,
    edge                  = pp.edge_val,
    edge_canonical        = pp.edge_val,
    value_score           = pp.edge_val,
    value_score_canonical = pp.edge_val,
    signal                = pp.sig,
    signal_tag            = pp.sig,
    signal_canonical      = pp.sig,
    signal_display        = CASE pp.sig
      WHEN 'STRONG_START' THEN 'Strong Start'
      WHEN 'START'        THEN 'Start'
      WHEN 'HOLD'         THEN 'Watch'
      WHEN 'SIT'          THEN 'Avoid'
      WHEN 'STRONG_SIT'   THEN 'Hard Avoid'
    END,
    category_canonical    = CASE pp.sig
      WHEN 'STRONG_START' THEN 'Target'
      WHEN 'START'        THEN 'Target'
      WHEN 'HOLD'         THEN 'Watch'
      WHEN 'SIT'          THEN 'Avoid'
      WHEN 'STRONG_SIT'   THEN 'Avoid'
    END,
    action_canonical      = CASE pp.sig
      WHEN 'STRONG_START' THEN 'START'
      WHEN 'START'        THEN 'START'
      WHEN 'HOLD'         THEN 'HOLD'
      WHEN 'SIT'          THEN 'SIT'
      WHEN 'STRONG_SIT'   THEN 'SIT'
    END,
    market_watch_category = CASE pp.sig
      WHEN 'STRONG_START' THEN 'Target'
      WHEN 'START'        THEN 'Target'
      WHEN 'HOLD'         THEN 'Watch'
      WHEN 'SIT'          THEN 'Avoid'
      WHEN 'STRONG_SIT'   THEN 'Avoid'
    END,
    ai_summary            = COALESCE(pp.summary_short,        rc.ai_summary),
    summary_short         = COALESCE(pp.summary_short,        rc.summary_short),
    summary_long          = COALESCE(pp.summary_long,         rc.summary_long),
    recommendation_short  = COALESCE(pp.recommendation_short, rc.recommendation_short),
    cached_at             = NOW()
  FROM projection_with_signal pp
  WHERE rc.player_id = pp.player_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES (
    'cache_enrichment',
    'populate_rankings_cache: ' || v_updated || ' rows updated (blended breakeven: 0gp=last5, 1-2gp=40/60, 3+gp=season_avg)',
    NOW()
  )
  ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_enrichment_error', 'populate_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$function$;


-- ============================================================
-- STEP 3: Re-run immediately to apply blended breakeven
-- ============================================================

SELECT afl.fn_populate_player_rankings_cache();
