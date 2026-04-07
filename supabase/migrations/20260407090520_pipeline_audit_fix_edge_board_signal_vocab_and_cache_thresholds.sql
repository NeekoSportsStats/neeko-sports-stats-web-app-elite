/*
  # Pipeline Audit Fix — Edge Board Signal Vocab + Cache Threshold Alignment

  ## Summary
  This migration fixes three critical pipeline breakages discovered in the full audit:

  ### 1. Edge Board: Dead Signal Vocabulary (CRITICAL — 0 rows every run)
  - populate_mv_edge_board() filters WHERE signal IN ('STRONG_UP', 'UP') and ('DOWN', 'STRONG_DOWN')
  - These signal values no longer exist in player_rankings_cache (renamed to STRONG_BUY/BUY/SELL/STRONG_SELL)
  - Result: edge board produces 0 rows every pipeline run
  - Fix: Replace all signal filters with the current vocabulary

  ### 2. afl.populate_rankings_cache() — Old Thresholds Override Correct Values
  - This function (called by pipeline step 8 via populate_rankings_cache_from_source) still has
    old thresholds: STRONG_BUY >= 18, BUY >= 10, STRONG_SELL <= -18, SELL <= -10
  - It also has the old breakeven bug: games_played < 3 check does not handle games_played = 0
    correctly, causing edge = 0 for all pre-season players
  - Every night, step 8 overwrites the correct signals written by step 7b with wrong ones
  - Fix: Align thresholds (>=15/>=6/>-6/>-15) and breakeven formula to match fn_populate_player_rankings_cache

  ### 3. Cron Job 186 — Redundant and Dangerous
  - stage4_cache_rebuild_2am fires at UTC 15:00, 30 minutes into the pipeline that already
    runs populate_rankings_cache_from_source() in step 8 at roughly the same time
  - Fix: Unschedule cron job 186 (the pipeline already handles this in step 8)

  ### 4. Immediate Edge Board Backfill
  - Run populate_mv_edge_board() immediately to populate the now-empty edge board table

  ## Changes
  - Rebuilt public.populate_mv_edge_board() with correct signal vocab (STRONG_BUY/BUY/SELL/STRONG_SELL)
  - Rebuilt afl.populate_rankings_cache() with aligned thresholds and games_played=0 breakeven fix
  - Unscheduled cron job 186 (stage4_cache_rebuild_2am)
  - Immediate populate_mv_edge_board() call to restore edge board data
*/

-- =============================================================================
-- FIX 1: Rebuild populate_mv_edge_board() with correct signal vocabulary
-- =============================================================================

CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_inserted int := 0;
BEGIN

WITH eligible AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final,
    c.ceiling_estimate,
    c.floor_estimate,
    c.upside_rating,
    c.risk_rating,
    c.projection_confidence,
    c.captain_score,
    c.captain_rating,
    c.neeko_rating,
    c.price,
    c.price_change,
    c.price_change_pct,
    c.value_score_canonical   AS value_score,
    c.signal_display           AS value_tag,
    c.summary_short            AS ai_summary,
    c.recommendation_color,
    c.consistency,
    c.signal_canonical         AS signal,
    c.edge_canonical
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  AND COALESCE(c.projection_final, 0) > 0
  AND COALESCE(c.is_available, true) = true
  AND COALESCE(c.manual_status, '') NOT IN ('injured', 'out', 'suspended')
  AND COALESCE(c.is_bye, false) = false
  AND c.player_name IS NOT NULL
  AND COALESCE(c.games_played, 0) >= 3
  AND COALESCE(c.price, 0) > 0
),

-- Captain: STRONG_BUY or BUY signal, highest captain_score
captain_ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(captain_score, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('STRONG_BUY', 'BUY')
  AND captain_score IS NOT NULL
  AND projection_final >= 60
),
top_captains AS (
  SELECT *, rn AS section_rank FROM captain_ranked WHERE rn <= 10
),

-- Breakout: STRONG_BUY signal, not already a captain, ranked by edge
breakout_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(edge_canonical, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal = 'STRONG_BUY'
  AND projection_final >= 50
  AND player_id NOT IN (SELECT player_id FROM top_captains)
),
top_breakouts AS (
  SELECT *, rn AS section_rank FROM breakout_ranked WHERE rn <= 10
),

-- Trap: SELL or STRONG_SELL signal, premium-priced players
trap_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(risk_rating, 0) DESC NULLS LAST, COALESCE(price, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('SELL', 'STRONG_SELL')
  AND price >= 250000
  AND player_id NOT IN (SELECT player_id FROM top_captains)
  AND player_id NOT IN (SELECT player_id FROM top_breakouts)
),
top_traps AS (
  SELECT *, rn AS section_rank FROM trap_ranked WHERE rn <= 10
),

all_sections AS (
  SELECT 'captain'::text AS section, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now() AS refreshed_at
  FROM top_captains
  UNION ALL
  SELECT 'breakout'::text, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_breakouts
  UNION ALL
  SELECT 'trap'::text, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_traps
)
INSERT INTO public.mv_edge_board (
  section, section_rank, player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
)
SELECT
  section, section_rank, player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
FROM all_sections
ON CONFLICT (section, section_rank) DO UPDATE SET
  player_id              = EXCLUDED.player_id,
  player_name            = EXCLUDED.player_name,
  team                   = EXCLUDED.team,
  position               = EXCLUDED.position,
  projection_final       = EXCLUDED.projection_final,
  ceiling_estimate       = EXCLUDED.ceiling_estimate,
  floor_estimate         = EXCLUDED.floor_estimate,
  upside_rating          = EXCLUDED.upside_rating,
  risk_rating            = EXCLUDED.risk_rating,
  projection_confidence  = EXCLUDED.projection_confidence,
  captain_score          = EXCLUDED.captain_score,
  captain_rating         = EXCLUDED.captain_rating,
  neeko_rating           = EXCLUDED.neeko_rating,
  price                  = EXCLUDED.price,
  price_change           = EXCLUDED.price_change,
  price_change_pct       = EXCLUDED.price_change_pct,
  value_score            = EXCLUDED.value_score,
  value_tag              = EXCLUDED.value_tag,
  ai_summary             = EXCLUDED.ai_summary,
  recommendation_color   = EXCLUDED.recommendation_color,
  refreshed_at           = EXCLUDED.refreshed_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'info',
  'populate_mv_edge_board',
  'edge_board_refreshed',
  'Edge board rebuilt (signal-aligned v2): ' || v_inserted || ' rows upserted',
  jsonb_build_object('rows_upserted', v_inserted, 'refreshed_at', now()),
  now()
);

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'error',
  'populate_mv_edge_board',
  'edge_board_refresh_error',
  'Edge board refresh failed: ' || SQLERRM,
  jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE),
  now()
);
RAISE;
END;
$function$;

-- =============================================================================
-- FIX 2: Rebuild afl.populate_rankings_cache() with aligned thresholds + breakeven fix
-- Canonical thresholds: >=15 STRONG_BUY, >=6 BUY, >-6 HOLD, >-15 SELL, else STRONG_SELL
-- Breakeven: games_played=0 uses last5_avg (2025 history), not projection fallback
-- =============================================================================

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $function$
DECLARE
v_snapshot_id text;
v_bad_count   int;
BEGIN
v_snapshot_id := gen_random_uuid()::text;

SELECT COUNT(*) INTO v_bad_count
FROM afl.mv_player_projection pp
WHERE NULLIF(pp.projection, 0) IS NULL OR pp.projection <= 30;

IF v_bad_count > 0 THEN
  INSERT INTO afl.system_logs (level, message, context, created_at)
  SELECT
    'warn',
    'populate_rankings_cache: skipping player with invalid projection — ' || pp.player_name,
    jsonb_build_object('player_id', pp.player_id, 'player_name', pp.player_name, 'projection', pp.projection),
    now()
  FROM afl.mv_player_projection pp
  WHERE NULLIF(pp.projection, 0) IS NULL OR pp.projection <= 30
  ON CONFLICT DO NOTHING;
END IF;

UPDATE afl.player_rankings_cache rc
SET
  player_name           = pp.player_name,
  team                  = pp.team_name,
  team_name             = pp.team_name,
  position              = pp.position,
  position_group        = pp.position_group,

  price                 = pp.price,
  prev_price            = pp.prev_price,
  price_change          = pp.price_change,
  price_change_pct      = pp.price_change_pct,

  projection_final      = NULLIF(pp.projection, 0),
  season_avg            = pp.season_avg,
  last_3_avg            = pp.last3_avg,
  last_5_avg            = pp.last5_avg,
  games_played          = pp.games_played,

  ceiling_estimate      = pp.ceiling_estimate,
  floor_estimate        = pp.floor_estimate,
  consistency           = pp.consistency_score,
  form_score            = pp.form_score,
  matchup_label         = pp.matchup_label,
  matchup_rating        = pp.matchup_rating::text,
  matchup_multiplier    = pp.matchup_multiplier,
  neeko_rating          = pp.neeko_rating,
  neeko_rating_scaled   = pp.neeko_rating_scaled,
  upside_pct            = pp.upside_pct,
  upside_rating         = pp.upside_rating,
  risk_rating           = pp.risk_rating,
  trend_signal          = pp.trend_signal,
  trend_score           = pp.trend_score,
  form_delta            = pp.form_delta,
  form_label            = pp.form_label,
  projection_confidence = pp.projection_confidence,
  captain_score         = pp.captain_score,
  captain_rating        = pp.captain_rating,
  is_available          = pp.is_available,
  bye_round             = pp.bye_round,
  is_bye                = pp.is_bye,
  bye_next_round        = pp.bye_next_round,

  -- BREAKEVEN: canonical formula — games_played=0 uses last5_avg (2025 history)
  breakeven_canonical = GREATEST(
    CASE
      WHEN COALESCE(pp.games_played, 0) = 0
        THEN COALESCE(pp.last5_avg, NULLIF(pp.projection, 0), 0)
      WHEN COALESCE(pp.games_played, 0) < 3
        THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection, 0), 0)
      ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
    END,
    0
  ),

  edge_canonical = NULLIF(pp.projection, 0) - GREATEST(
    CASE
      WHEN COALESCE(pp.games_played, 0) = 0
        THEN COALESCE(pp.last5_avg, NULLIF(pp.projection, 0), 0)
      WHEN COALESCE(pp.games_played, 0) < 3
        THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection, 0), 0)
      ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
    END,
    0
  ),

  value_score_canonical = CASE
    WHEN NULLIF(pp.projection, 0) IS NOT NULL
    THEN NULLIF(pp.projection, 0) - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) = 0
          THEN COALESCE(pp.last5_avg, NULLIF(pp.projection, 0), 0)
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection, 0), 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
      END,
      0
    )
    ELSE NULL
  END,

  -- SIGNAL: canonical thresholds >=15/>=6/>-6/>-15
  signal_canonical = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 15 THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -6 THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,

  category_canonical = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'Target'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) <= -6 THEN 'Avoid'
    ELSE 'Watch'
  END,

  action_canonical = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) <= -6 THEN 'SELL'
    ELSE 'HOLD'
  END,

  market_watch_category = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'Target'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) <= -6 THEN 'Avoid'
    ELSE 'Watch'
  END,

  signal = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 15 THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -6 THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,

  signal_tag = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 15 THEN 'STRONG_BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'BUY'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -6 THEN 'HOLD'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,

  signal_display = CASE
    WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 15 THEN 'Strong Target'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) >= 6 THEN 'Target'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -6 THEN 'Watch'
    WHEN LEAST(GREATEST(
        NULLIF(pp.projection, 0) - GREATEST(CASE
          WHEN COALESCE(pp.games_played,0)=0 THEN COALESCE(pp.last5_avg, NULLIF(pp.projection,0), 0)
          WHEN COALESCE(pp.games_played,0)<3 THEN COALESCE(pp.season_avg, pp.last5_avg, NULLIF(pp.projection,0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection,0), 0)
        END, 0), -40.0), 40.0) > -15 THEN 'Avoid'
    ELSE 'Hard Avoid'
  END,

  -- AI content: preserve existing, only overwrite when new data available
  ai_summary           = COALESCE(pa.summary, rc.ai_summary),
  summary_short        = COALESCE(pa.summary_short, rc.summary_short),
  summary_long         = COALESCE(pa.summary_long, rc.summary_long),
  ai_recommendation    = COALESCE(pa.recommendation, rc.ai_recommendation),
  ai_updated_at        = COALESCE(pa.generated_at, rc.ai_updated_at),
  ai_validation_passed = COALESCE(pa.validation_passed, rc.ai_validation_passed),
  recommendation_color = COALESCE(pa.recommendation_color, rc.recommendation_color),

  cached_at   = now(),
  snapshot_id = v_snapshot_id

FROM afl.mv_player_projection pp
LEFT JOIN afl.players ap ON ap.player_id = pp.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = pp.player_id
WHERE rc.player_id = pp.player_id
AND pp.player_name IS NOT NULL
AND NULLIF(pp.projection, 0) IS NOT NULL
AND pp.projection > 30
AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'populate_rankings_cache error: % %', SQLERRM, SQLSTATE;
END;
$function$;

-- =============================================================================
-- FIX 3: Disable cron job 186 (stage4_cache_rebuild_2am) — redundant with pipeline step 8
-- Using cron.unschedule by job name
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('stage4_cache_rebuild_2am');
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES (
    'info', 'pipeline_audit_fix', 'cron_job_disabled',
    'Unscheduled stage4_cache_rebuild_2am (jobid 186) — redundant with run_neeko_pipeline step 8',
    jsonb_build_object('jobname', 'stage4_cache_rebuild_2am', 'reason', 'duplicate of pipeline step 8, was overwriting correct signals with stale thresholds'),
    now()
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES ('warn', 'pipeline_audit_fix', 'cron_unschedule_warning', 'Could not unschedule stage4_cache_rebuild_2am: ' || SQLERRM, jsonb_build_object('error', SQLERRM), now());
END $$;

-- =============================================================================
-- FIX 4: Immediate edge board backfill with corrected function
-- =============================================================================

SELECT public.populate_mv_edge_board();
