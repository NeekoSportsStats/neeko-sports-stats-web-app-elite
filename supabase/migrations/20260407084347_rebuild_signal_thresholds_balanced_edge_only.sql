/*
  # Rebuild Signal Thresholds — Balanced, Edge-Only Model

  ## Summary
  Fixes the Market Watch signal distribution imbalance by:
  - Replacing old thresholds (STRONG_BUY >= 18, BUY >= 10, SELL <= -10, STRONG_SELL <= -18)
  - With new balanced thresholds (STRONG_BUY >= 20, BUY >= 8, HOLD > -8, SELL > -20, STRONG_SELL else)
  - Edge = 0 now correctly maps to HOLD (covered by edge > -8)
  - Extreme outliers capped at ±40 before threshold evaluation
  - All signal columns derived from a single CTE edge computation — no repetition

  ## New Threshold Rules
  - STRONG_BUY:  edge >= 20
  - BUY:         edge >= 8
  - HOLD:        edge > -8  (includes edge = 0)
  - SELL:        edge > -20
  - STRONG_SELL: edge <= -20

  ## Target Distribution
  - STRONG_BUY + BUY (TARGET): ~25–35%
  - HOLD (WATCH): ~40–50%
  - SELL + STRONG_SELL (AVOID): ~20–30%

  ## Changes
  1. Rebuild fn_populate_player_rankings_cache with new thresholds and CTE pattern
  2. Backfill all existing cache rows with corrected signals
  3. Rebuild v_free_player_ids_2026 to guarantee ≥2 TARGET, ≥2 WATCH, ≥2 AVOID free players
*/

-- ============================================================
-- STEP 1: Rebuild fn_populate_player_rankings_cache
--         Uses a CTE to compute edge once, applies new thresholds
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

    -- breakeven: season_avg for rookies (<3 games), last5_avg for established
    ROUND(GREATEST(
      CASE
        WHEN COALESCE(mv.games_played, 0) < 3
          THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
        ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
      END,
      0
    ), 1) AS breakeven_val,

    -- raw edge (projection - breakeven)
    ROUND(
      mv.projection::numeric -
      GREATEST(
        CASE
          WHEN COALESCE(mv.games_played, 0) < 3
            THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
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
    -- Cap extreme outliers ±40 for signal evaluation only
    LEAST(GREATEST(edge_raw, -40.0), 40.0) AS edge_capped,

    CASE
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 20  THEN 'STRONG_BUY'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 8   THEN 'BUY'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -8   THEN 'HOLD'
      WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -20  THEN 'SELL'
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

  sig,  -- signal
  sig,  -- signal_tag

  -- signal_display (human-readable labels)
  CASE sig
    WHEN 'STRONG_BUY'  THEN 'Strong Target'
    WHEN 'BUY'         THEN 'Target'
    WHEN 'HOLD'        THEN 'Watch'
    WHEN 'SELL'        THEN 'Avoid'
    WHEN 'STRONG_SELL' THEN 'Hard Avoid'
  END,

  sig,  -- signal_canonical

  -- category_canonical (3-level grouping for UI filters)
  CASE sig
    WHEN 'STRONG_BUY'  THEN 'Target'
    WHEN 'BUY'         THEN 'Target'
    WHEN 'HOLD'        THEN 'Watch'
    WHEN 'SELL'        THEN 'Avoid'
    WHEN 'STRONG_SELL' THEN 'Avoid'
  END,

  -- action_canonical
  CASE sig
    WHEN 'STRONG_BUY'  THEN 'BUY'
    WHEN 'BUY'         THEN 'BUY'
    WHEN 'HOLD'        THEN 'HOLD'
    WHEN 'SELL'        THEN 'SELL'
    WHEN 'STRONG_SELL' THEN 'SELL'
  END,

  -- market_watch_category
  CASE sig
    WHEN 'STRONG_BUY'  THEN 'Target'
    WHEN 'BUY'         THEN 'Target'
    WHEN 'HOLD'        THEN 'Watch'
    WHEN 'SELL'        THEN 'Avoid'
    WHEN 'STRONG_SELL' THEN 'Avoid'
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
VALUES ('cache_seed', 'fn_populate_player_rankings_cache: ' || v_inserted || ' rows upserted (balanced thresholds v2)', NOW())
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$function$;


-- ============================================================
-- STEP 2: Backfill existing cache rows with corrected signals
--         (applies immediately to all 594 existing rows)
-- ============================================================
UPDATE afl.player_rankings_cache
SET
  signal = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 20  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -20  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  signal_tag = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 20  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -20  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  signal_display = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 20  THEN 'Strong Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'Watch'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -20  THEN 'Avoid'
    ELSE 'Hard Avoid'
  END,
  signal_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 20  THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'HOLD'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -20  THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  category_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'Watch'
    ELSE 'Avoid'
  END,
  action_canonical = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'BUY'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'HOLD'
    ELSE 'SELL'
  END,
  market_watch_category = CASE
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) >= 8   THEN 'Target'
    WHEN LEAST(GREATEST(edge_canonical, -40.0), 40.0) > -8   THEN 'Watch'
    ELSE 'Avoid'
  END
WHERE edge_canonical IS NOT NULL;


-- ============================================================
-- STEP 3: Rebuild v_free_player_ids_2026
--         Guarantees ≥2 TARGET, ≥2 WATCH, ≥2 AVOID in free tier
-- ============================================================
DROP VIEW IF EXISTS afl.v_free_player_ids_2026;

CREATE VIEW afl.v_free_player_ids_2026 AS
WITH ranked_by_category AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
    neeko_rating,
    signal_canonical,
    category_canonical,
    ABS(edge_canonical) AS abs_edge,
    ROW_NUMBER() OVER (
      PARTITION BY category_canonical
      ORDER BY ABS(edge_canonical) DESC, neeko_rating DESC NULLS LAST
    ) AS rn
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
    AND projection_final IS NOT NULL
    AND projection_final > 0
    AND neeko_rating IS NOT NULL
    AND COALESCE(manual_status, 'active') NOT IN ('injured', 'out', 'bye', 'delisted', 'retired')
    AND is_available = true
),
guaranteed AS (
  SELECT player_id FROM ranked_by_category WHERE rn <= 2
),
top_overall AS (
  SELECT player_id
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
    AND projection_final IS NOT NULL
    AND projection_final > 0
    AND neeko_rating IS NOT NULL
    AND COALESCE(manual_status, 'active') NOT IN ('injured', 'out', 'bye', 'delisted', 'retired')
    AND is_available = true
  ORDER BY neeko_rating DESC NULLS LAST
  LIMIT 6
)
SELECT player_id FROM guaranteed
UNION
SELECT player_id FROM top_overall;

GRANT SELECT ON afl.v_free_player_ids_2026 TO anon, authenticated;


-- ============================================================
-- STEP 4: Log the change
-- ============================================================
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'signal_threshold_rebuild',
  'Balanced signal thresholds v2 applied: STRONG_BUY>=20, BUY>=8, HOLD>-8, SELL>-20, STRONG_SELL else. Free tier rebuilt with guaranteed TARGET/WATCH/AVOID slots.',
  NOW()
)
ON CONFLICT DO NOTHING;
