/*
  # Split Signal Engine: Trend + Value (v2)

  ## Summary
  Introduces dual signal architecture, keeping existing populate function intact.
  Only adds new columns and backfills from existing cache data.

  ## New Columns on afl.player_rankings_cache
  - `trend_score`  (NUMERIC): projection_final minus baseline (season_avg)
  - `trend_signal` (TEXT):    STRONG_UP / UP / STABLE / DOWN / STRONG_DOWN
  - `value_signal` (TEXT):    STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL

  ## Signal Thresholds
  ### Trend (vs own baseline)
  - STRONG_UP:   >= +20
  - UP:          >= +10
  - STABLE:      >= -5
  - DOWN:        >= -15
  - STRONG_DOWN: < -15

  ### Value (vs breakeven / price)
  - STRONG_BUY:  edge >= +15
  - BUY:         edge >= +5
  - HOLD:        edge >= -5
  - SELL:        edge >= -15
  - STRONG_SELL: edge < -15

  ## Page Mapping
  - Rankings / Current Round / Start-Sit / Teams → trend_signal
  - Market Watch → value_signal
  - Edge Board → both sections
  - Player page → both displayed
*/

-- ─── Step 1: Add new columns ─────────────────────────────────────────────────
ALTER TABLE afl.player_rankings_cache
  ADD COLUMN IF NOT EXISTS trend_score  NUMERIC,
  ADD COLUMN IF NOT EXISTS trend_signal TEXT,
  ADD COLUMN IF NOT EXISTS value_signal TEXT;

-- ─── Step 2: Backfill from existing cache data ────────────────────────────────
UPDATE afl.player_rankings_cache
SET
  trend_score = ROUND(
    projection_final - COALESCE(season_avg, last_3_avg, projection_final),
    1
  ),
  trend_signal = CASE
    WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 20  THEN 'STRONG_UP'
    WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 10  THEN 'UP'
    WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -5  THEN 'STABLE'
    WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -15 THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END,
  value_signal = CASE
    WHEN COALESCE(edge, 0) >= 15  THEN 'STRONG_BUY'
    WHEN COALESCE(edge, 0) >= 5   THEN 'BUY'
    WHEN COALESCE(edge, 0) >= -5  THEN 'HOLD'
    WHEN COALESCE(edge, 0) >= -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END
WHERE projection_final IS NOT NULL;

-- ─── Step 3: Also update signal/signal_tag to reflect trend (not price) ───────
-- This fixes legacy pages that still read signal — they now get trend-based values
-- instead of the old elite-guard price-based signals.
UPDATE afl.player_rankings_cache
SET
  signal = trend_signal,
  signal_tag = CASE
    WHEN trend_signal IN ('STRONG_UP', 'UP')          THEN 'Target'
    WHEN trend_signal = 'STABLE'                      THEN 'Watch'
    ELSE 'Avoid'
  END
WHERE trend_signal IS NOT NULL;

-- ─── Step 4: Create a function to apply dual signals during cache updates ─────
-- This is called AFTER the main populate to patch in the new columns.
CREATE OR REPLACE FUNCTION afl.fn_apply_dual_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  UPDATE afl.player_rankings_cache
  SET
    trend_score = ROUND(
      projection_final - COALESCE(season_avg, last_3_avg, projection_final),
      1
    ),
    trend_signal = CASE
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 20  THEN 'STRONG_UP'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 10  THEN 'UP'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -5  THEN 'STABLE'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END,
    value_signal = CASE
      WHEN COALESCE(edge, 0) >= 15  THEN 'STRONG_BUY'
      WHEN COALESCE(edge, 0) >= 5   THEN 'BUY'
      WHEN COALESCE(edge, 0) >= -5  THEN 'HOLD'
      WHEN COALESCE(edge, 0) >= -15 THEN 'SELL'
      ELSE 'STRONG_SELL'
    END,
    signal = CASE
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 20  THEN 'STRONG_UP'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 10  THEN 'UP'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -5  THEN 'STABLE'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END,
    signal_tag = CASE
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= 10 THEN 'Target'
      WHEN (projection_final - COALESCE(season_avg, last_3_avg, projection_final)) >= -5 THEN 'Watch'
      ELSE 'Avoid'
    END
  WHERE projection_final IS NOT NULL;
END;
$$;

-- ─── Step 5: Expose new columns in public view ────────────────────────────────
DROP VIEW IF EXISTS public.v_player_rankings_cache CASCADE;
CREATE VIEW public.v_player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling,
  floor,
  price,
  breakeven,
  edge,
  baseline,
  trend_score,
  trend_signal,
  value_signal,
  signal,
  signal_tag,
  neeko_rating,
  value_score,
  value_tier,
  recommendation_color,
  recommendation_short,
  consistency,
  form_score,
  upside_pct,
  matchup_rating,
  matchup_label,
  games_played,
  status,
  is_available,
  is_bye,
  bye_round,
  cached_at
FROM afl.player_rankings_cache;

GRANT SELECT ON public.v_player_rankings_cache TO anon, authenticated;

-- ─── Step 6: Rankings free view with trend columns ────────────────────────────
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;
CREATE VIEW public.v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling,
  floor,
  price,
  breakeven,
  edge,
  baseline,
  trend_score,
  trend_signal,
  value_signal,
  signal,
  signal_tag,
  neeko_rating,
  value_score,
  value_tier,
  consistency,
  form_score,
  games_played,
  status,
  is_available,
  is_bye,
  bye_round,
  cached_at
FROM afl.player_rankings_cache
WHERE is_available = true
ORDER BY projection_final DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
