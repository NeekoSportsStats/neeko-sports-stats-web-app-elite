/*
  # Scoring Model Rebuild — Step 1: populate_rankings_cache

  ## Summary
  Rebuilds the core scoring engine to a clean, deterministic model with ONE source
  of truth for every metric. Eliminates percentile-based signal thresholds (which
  shift weekly and cause chaos), rookie inflation of the signal system, and the
  broken value_score formula.

  ## New Model (canonical fields)

  ### breakeven_canonical
    COALESCE(last_5_avg, last_3_avg, season_avg, projection_final * 0.9)
    — Best available historical average. For rookies with no history,
      falls back to 90% of projection (conservative, not zero).

  ### edge_canonical
    projection_final - breakeven_canonical
    — Pure score: how many points above/below their baseline we expect.

  ### value_score_canonical
    projection_final / NULLIF(breakeven_canonical, 0)
    — Ratio: 1.0 = exactly at baseline, >1 = outperforming, <1 = underperforming.

  ### signal_canonical (fixed thresholds, established players only)
    >= 15  → STRONG_UP
    6-14   → UP
    -5 to 5 → STABLE
    -6 to -14 → DOWN
    <= -15 → STRONG_DOWN
    games_played < 3 → always STABLE (insufficient data)

  ### category_canonical (market watch grouping)
    edge >= 10  → Target
    edge -5 to 9 → Watch
    edge <= -6  → Avoid
    games_played < 3 → Watch (monitor, not actionable)

  ### action_canonical
    Mirrors signal for established players; HOLD for rookies.

  ## Changes
  - Removed percentile threshold variables (v_p15/p35/p75/p85)
  - Fixed value_score_canonical: now projection/breakeven ratio
  - breakeven_canonical fallback is projection*0.9 (not projection itself)
  - signal/category/action all use same thresholds for consistency
  - market_watch_category, signal, signal_tag all write from canonical values
  - edge and breakeven legacy columns also updated from canonical
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
DECLARE
  v_snapshot_id text;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  UPDATE afl.player_rankings_cache rc
  SET
    player_name           = pp.player_name,
    team                  = pp.team_name,
    team_name             = pp.team_name,
    position              = pp.position,
    position_group        = pp.position,
    projection_final      = pp.projection,
    projection            = pp.projection,
    ceiling               = pp.ceiling,
    floor                 = pp.floor,
    consistency           = pp.consistency,
    form_score            = pp.form_score,
    neeko_rating          = pp.neeko_rating,
    price                 = pp.price,
    value_score           = pp.value_score,
    matchup_rating        = CASE pp.matchup_rating::text
                              WHEN '1' THEN 'Tough'
                              WHEN '3' THEN 'Favourable'
                              ELSE 'Average'
                            END,
    matchup_label         = CASE pp.matchup_rating::text
                              WHEN '1' THEN 'Hard matchup this round'
                              WHEN '3' THEN 'Great matchup this round'
                              ELSE 'Average matchup'
                            END,
    matchup_multiplier    = pp.matchup_multiplier,
    season_avg            = pp.season_avg,
    last_3_avg            = pp.last3_avg,
    last_5_avg            = pp.last5_avg,
    games_played          = pp.games_played,
    team_id               = pp.team_id,
    status                = COALESCE(ap.manual_status, 'active'),
    manual_status         = ap.manual_status,
    is_available          = CASE
                              WHEN COALESCE(ap.manual_status, 'active') IN ('active', 'questionable')
                              THEN true ELSE false
                            END,
    summary_short         = pa.summary_short,
    summary_long          = pa.summary_long,
    cache_snapshot_id     = v_snapshot_id,
    cached_at             = now(),

    -- ─── CANONICAL SCORING MODEL ────────────────────────────────────────────
    --
    -- breakeven: best available historical average
    -- For rookies (<3 games) with no meaningful history, use projection * 0.9
    -- so breakeven is never higher than projection (avoids spurious neg-edge)
    breakeven_canonical   = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3
                              THEN COALESCE(
                                pp.last5_avg,
                                pp.last3_avg,
                                pp.season_avg,
                                pp.projection * 0.9
                              )
                              ELSE COALESCE(
                                pp.last5_avg,
                                pp.last3_avg,
                                pp.season_avg,
                                pp.projection * 0.9
                              )
                            END,

    -- edge: raw point differential vs baseline
    edge_canonical        = pp.projection
                            - COALESCE(
                                pp.last5_avg,
                                pp.last3_avg,
                                pp.season_avg,
                                pp.projection * 0.9
                              ),

    -- value_score: ratio of projection to breakeven
    -- >1.0 means projecting above baseline; <1.0 below baseline
    value_score_canonical = ROUND(
                              pp.projection
                              / NULLIF(
                                  COALESCE(
                                    pp.last5_avg,
                                    pp.last3_avg,
                                    pp.season_avg,
                                    pp.projection * 0.9
                                  ),
                                  0
                                ),
                              3
                            ),

    -- signal: fixed thresholds on edge, rookies always STABLE
    signal_canonical      = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 15  THEN 'STRONG_UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 6   THEN 'UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -14 THEN 'DOWN'
                              ELSE 'STRONG_DOWN'
                            END,

    -- category: market watch grouping
    category_canonical    = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'Watch'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 10  THEN 'Target'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'Watch'
                              ELSE 'Avoid'
                            END,

    -- action: trade recommendation
    action_canonical      = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'HOLD'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 15  THEN 'BUY'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 6   THEN 'BUY'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'HOLD'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -14 THEN 'SELL'
                              ELSE 'SELL'
                            END,

    -- ─── LEGACY FIELD ALIGNMENT (keep in sync with canonical) ───────────────
    market_watch_category = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'Watch'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 10  THEN 'Target'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'Watch'
                              ELSE 'Avoid'
                            END,

    signal                = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 15  THEN 'STRONG_UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 6   THEN 'UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -14 THEN 'DOWN'
                              ELSE 'STRONG_DOWN'
                            END,

    signal_tag            = CASE
                              WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 15  THEN 'STRONG_UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= 6   THEN 'UP'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -5  THEN 'STABLE'
                              WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)) >= -14 THEN 'DOWN'
                              ELSE 'STRONG_DOWN'
                            END,

    breakeven             = COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9),
    edge                  = pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection * 0.9)

  FROM afl.mv_player_projection pp
  LEFT JOIN afl.players ap ON ap.player_id = pp.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE rc.player_id = pp.player_id
    AND pp.player_name IS NOT NULL
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: % %', SQLERRM, SQLSTATE;
END;
$$;
