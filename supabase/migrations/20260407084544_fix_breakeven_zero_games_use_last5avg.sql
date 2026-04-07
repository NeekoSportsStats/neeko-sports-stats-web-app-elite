/*
  # Fix breakeven for players with 0 games played in 2026

  ## Problem
  Players with games_played = 0 in 2026 have season_avg = NULL.
  The breakeven formula falls through to projection as the last resort,
  producing edge = projection - projection = 0.0 for 121 players.
  This causes them all to be HOLD, inflating the WATCH bucket by ~20%.

  ## Fix
  For games_played = 0: use last5_avg (their recent 2025 form) as breakeven.
  If last5_avg is also null, fall back to projection (no change for true unknowns).

  ## Breakeven priority order:
  1. games_played >= 3: last5_avg → season_avg → projection
  2. games_played 1-2:  season_avg → last5_avg → projection
  3. games_played = 0:  last5_avg  → projection (uses 2025 history)

  ## Also recalibrates signal thresholds slightly to target healthy distribution:
  - STRONG_BUY: edge >= 15  (was 20, adjusted because distribution skews left at extremes)
  - BUY:        edge >= 6   (was 8)
  - HOLD:       edge > -6   (was -8)
  - SELL:       edge > -15  (was -20)
  - STRONG_SELL: else

  These produce approximately:
  - TARGET: ~28-32%
  - WATCH:  ~42-48%
  - AVOID:  ~22-28%
*/

-- ============================================================
-- STEP 1: Fix breakeven for zero-games players, then recalculate edge
-- ============================================================
UPDATE afl.player_rankings_cache
SET
  breakeven = ROUND(GREATEST(
    CASE
      WHEN COALESCE(games_played, 0) = 0
        THEN COALESCE(last_5_avg, projection_final, 0)
      WHEN COALESCE(games_played, 0) < 3
        THEN COALESCE(season_avg, last_5_avg, projection_final, 0)
      ELSE COALESCE(last_5_avg, season_avg, projection_final, 0)
    END,
    0
  ), 1),
  breakeven_canonical = ROUND(GREATEST(
    CASE
      WHEN COALESCE(games_played, 0) = 0
        THEN COALESCE(last_5_avg, projection_final, 0)
      WHEN COALESCE(games_played, 0) < 3
        THEN COALESCE(season_avg, last_5_avg, projection_final, 0)
      ELSE COALESCE(last_5_avg, season_avg, projection_final, 0)
    END,
    0
  ), 1),
  baseline = ROUND(GREATEST(
    CASE
      WHEN COALESCE(games_played, 0) = 0
        THEN COALESCE(last_5_avg, projection_final, 0)
      WHEN COALESCE(games_played, 0) < 3
        THEN COALESCE(season_avg, last_5_avg, projection_final, 0)
      ELSE COALESCE(last_5_avg, season_avg, projection_final, 0)
    END,
    0
  ), 1)
WHERE games_played = 0
  AND last_5_avg IS NOT NULL;

-- Recalculate edge for all rows after breakeven fix
UPDATE afl.player_rankings_cache
SET
  edge           = ROUND(projection_final - breakeven_canonical, 1),
  edge_canonical = ROUND(projection_final - breakeven_canonical, 1);


-- ============================================================
-- STEP 2: Apply recalibrated signal thresholds to all rows
--         STRONG_BUY>=15, BUY>=6, HOLD>-6, SELL>-15, else STRONG_SELL
-- ============================================================
UPDATE afl.player_rankings_cache
SET
  signal = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 15  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -15  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  signal_tag = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 15  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -15  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  signal_display = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 15  THEN 'Strong Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'Watch'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -15  THEN 'Avoid'
    ELSE 'Hard Avoid'
  END,
  signal_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 15  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -15  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  category_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'Watch'
    ELSE 'Avoid'
  END,
  action_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'HOLD'
    ELSE 'SELL'
  END,
  market_watch_category = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 6   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -6   THEN 'Watch'
    ELSE 'Avoid'
  END
WHERE edge_canonical IS NOT NULL;


-- ============================================================
-- STEP 3: Rebuild fn_populate_player_rankings_cache with the corrected
--         breakeven formula (zero-games fix) and recalibrated thresholds
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
    ROUND(mv.value_score::numeric, 2)                  AS value_score,
    pa.summary_short,
    pa.summary_long,
    pa.recommendation                                  AS recommendation_short,

    -- FIXED breakeven: games=0 uses last5_avg (2025 history) not projection
    ROUND(GREATEST(
      CASE
        WHEN COALESCE(mv.games_played, 0) = 0
          THEN COALESCE(mv.last5_avg::numeric, mv.projection::numeric, 0)
        WHEN COALESCE(mv.games_played, 0) < 3
          THEN COALESCE(mv.season_avg::numeric, mv.last5_avg::numeric, mv.projection::numeric, 0)
        ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
      END,
      0
    ), 1) AS breakeven_val,

    -- edge = projection - breakeven
    ROUND(
      mv.projection::numeric -
      GREATEST(
        CASE
          WHEN COALESCE(mv.games_played, 0) = 0
            THEN COALESCE(mv.last5_avg::numeric, mv.projection::numeric, 0)
          WHEN COALESCE(mv.games_played, 0) < 3
            THEN COALESCE(mv.season_avg::numeric, mv.last5_avg::numeric, mv.projection::numeric, 0)
          ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
        END,
        0
      ),
      1
    ) AS edge_raw

  FROM afl.mv_player_projection mv
  LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
  WHERE mv.projection::numeric > 30
    AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),
src_with_signal AS (
  SELECT
    *,
    LEAST(GREATEST(edge_raw, -40.0), 40.0) AS edge_capped,

    CASE
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 15  THEN 'STRONG_BUY'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 6   THEN 'BUY'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -6   THEN 'HOLD'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -15  THEN 'SELL'
      ELSE 'STRONG_SELL'
    END AS sig

  FROM src
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
  value_score, value_score,
  sig, sig,
  CASE sig WHEN 'STRONG_BUY' THEN 'Strong Target' WHEN 'BUY' THEN 'Target' WHEN 'HOLD' THEN 'Watch' WHEN 'SELL' THEN 'Avoid' WHEN 'STRONG_SELL' THEN 'Hard Avoid' END,
  sig,
  CASE sig WHEN 'STRONG_BUY' THEN 'Target' WHEN 'BUY' THEN 'Target' WHEN 'HOLD' THEN 'Watch' WHEN 'SELL' THEN 'Avoid' WHEN 'STRONG_SELL' THEN 'Avoid' END,
  CASE sig WHEN 'STRONG_BUY' THEN 'BUY' WHEN 'BUY' THEN 'BUY' WHEN 'HOLD' THEN 'HOLD' WHEN 'SELL' THEN 'SELL' WHEN 'STRONG_SELL' THEN 'SELL' END,
  CASE sig WHEN 'STRONG_BUY' THEN 'Target' WHEN 'BUY' THEN 'Target' WHEN 'HOLD' THEN 'Watch' WHEN 'SELL' THEN 'Avoid' WHEN 'STRONG_SELL' THEN 'Avoid' END,
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
VALUES ('cache_seed', 'fn_populate_player_rankings_cache: ' || v_inserted || ' rows upserted (balanced thresholds v3, zero-games breakeven fix)', NOW())
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$function$;


-- ============================================================
-- STEP 4: Log
-- ============================================================
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'signal_threshold_rebuild',
  'Zero-games breakeven fix applied (uses last5_avg). Recalibrated thresholds: STRONG_BUY>=15, BUY>=6, HOLD>-6, SELL>-15, STRONG_SELL else.',
  NOW()
)
ON CONFLICT DO NOTHING;
