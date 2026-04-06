/*
  # Elite Signal System Upgrade — 5-Tier Signal Model

  ## Overview
  Upgrades signal system from basic BUY/HOLD/SELL to elite 5-tier system.
  Core math (breakeven, edge, value_score) is NOT changed.
  Only the signal classification + display layer is upgraded.

  ## Changes

  ### 1. New signal tiers in afl.player_rankings_cache
  - STRONG_BUY: edge >= 18
  - BUY: edge >= 10
  - STRONG_SELL: edge <= -18
  - SELL: edge <= -10
  - HOLD: everything else

  ### 2. New signal_display column
  - STRONG_BUY  → '🔥 Target'
  - BUY         → 'Target'
  - HOLD        → 'Watch'
  - SELL        → 'Avoid'
  - STRONG_SELL → '🚫 Hard Avoid'

  ### 3. Category mapping (unchanged logic, new tiers)
  - STRONG_BUY / BUY → 'Target'
  - STRONG_SELL / SELL → 'Avoid'
  - HOLD → 'Watch'

  ## Notes
  - Does not modify breakeven_canonical, edge_canonical, or value_score_canonical
  - populate_rankings_cache() is updated to write all signal fields including signal_display
*/

-- Step 1: Add signal_display column to cache table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'signal_display'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN signal_display text DEFAULT 'Watch';
  END IF;
END $$;

-- Step 2: Backfill signal_display from existing edge_canonical values
UPDATE afl.player_rankings_cache
SET
  signal_canonical = CASE
    WHEN edge_canonical >= 18  THEN 'STRONG_BUY'
    WHEN edge_canonical >= 10  THEN 'BUY'
    WHEN edge_canonical <= -18 THEN 'STRONG_SELL'
    WHEN edge_canonical <= -10 THEN 'SELL'
    ELSE 'HOLD'
  END,
  category_canonical = CASE
    WHEN edge_canonical >= 10  THEN 'Target'
    WHEN edge_canonical <= -10 THEN 'Avoid'
    ELSE 'Watch'
  END,
  action_canonical = CASE
    WHEN edge_canonical >= 10  THEN 'BUY'
    WHEN edge_canonical <= -10 THEN 'SELL'
    ELSE 'HOLD'
  END,
  market_watch_category = CASE
    WHEN edge_canonical >= 10  THEN 'Target'
    WHEN edge_canonical <= -10 THEN 'Avoid'
    ELSE 'Watch'
  END,
  signal = CASE
    WHEN edge_canonical >= 18  THEN 'STRONG_BUY'
    WHEN edge_canonical >= 10  THEN 'BUY'
    WHEN edge_canonical <= -18 THEN 'STRONG_SELL'
    WHEN edge_canonical <= -10 THEN 'SELL'
    ELSE 'HOLD'
  END,
  signal_tag = CASE
    WHEN edge_canonical >= 18  THEN 'STRONG_BUY'
    WHEN edge_canonical >= 10  THEN 'BUY'
    WHEN edge_canonical <= -18 THEN 'STRONG_SELL'
    WHEN edge_canonical <= -10 THEN 'SELL'
    ELSE 'HOLD'
  END,
  signal_display = CASE
    WHEN edge_canonical >= 18  THEN '🔥 Target'
    WHEN edge_canonical >= 10  THEN 'Target'
    WHEN edge_canonical <= -18 THEN '🚫 Hard Avoid'
    WHEN edge_canonical <= -10 THEN 'Avoid'
    ELSE 'Watch'
  END
WHERE projection_final IS NOT NULL;

-- Step 3: Update populate_rankings_cache() to write 5-tier signals + signal_display going forward
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
    team                  = pp.team,
    team_name             = pp.team_name,
    position              = pp.position,
    position_group        = pp.position_group,

    price                 = pp.price,
    prev_price            = pp.prev_price,
    price_change          = pp.price_change,
    price_change_pct      = pp.price_change_pct,

    projection_final      = pp.projection,
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

    -- BREAKEVEN: last_5_avg when >= 3 games played, else season_avg
    breakeven_canonical = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- EDGE: projection minus breakeven (simple subtraction)
    edge_canonical = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- VALUE SCORE: same as edge (simplified)
    value_score_canonical = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- SIGNAL: 5-tier classification based on edge
    signal_canonical = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- CATEGORY: Target / Avoid / Watch
    category_canonical = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- ACTION mirrors category intent
    action_canonical = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    market_watch_category = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    signal = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    signal_tag = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- SIGNAL DISPLAY: human-readable label
    signal_display = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 18 THEN '🔥 Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -18 THEN '🚫 Hard Avoid'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- SHORT-FORM ALIASES
    breakeven = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),
    edge = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- AI content
    ai_summary        = pa.summary,
    summary_short     = pa.summary_short,
    summary_long      = pa.summary_long,
    ai_recommendation = pa.recommendation,
    ai_updated_at     = pa.generated_at,
    ai_validation_passed = pa.validation_passed,
    recommendation_color = pa.recommendation_color,

    cached_at         = now(),
    snapshot_id       = v_snapshot_id

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
