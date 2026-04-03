/*
  # Edge Engine v3 — Predictive Layer

  ## Summary
  Upgrades edge_score from the basic multi-factor formula (v2) to a full predictive
  weekly decision engine. Edge v3 answers: "How strong is this player THIS WEEK,
  in THIS matchup, under THIS role/environment?"

  ## New Signal Components
  The formula now uses existing mv_player_projection columns to build 9 components:
  - (A) Base performance: projection vs pool average (63)
  - (B) Form trend: last3_avg vs projection (most recent form)
  - (C) Ceiling upside net of volatility
  - (D) Opponent position concession: position_concession_multiplier centered at 1.0
  - (E) Venue/environment: home_advantage and venue_multiplier
  - (F) Role stability: stability_score Z-scored (0-100 scale, avg=66, sd=11.7)
  - (G) Form momentum: form_momentum signal (already centered near 0)
  - (H) Breakout signal: breakout_probability centered at pool avg (0.31)
  - (I) Consistency bonus minus volatility penalty

  ## Debug Columns Added to player_rankings_cache
  - edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent
  - edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk

  ## Recommendation Thresholds
  STRONG_BUY >= 11, BUY >= 5.5, SELL <= -5.5, STRONG_SELL <= -11, else HOLD

  ## Calibration
  Pool stats used:
  - avg_proj=62.85, avg_last5=60.14, avg_ceiling=80.70
  - avg_matchup=1.017 (sd=0.075)
  - avg_stability=66.0 (sd=11.74), avg_breakout=0.31 (sd=0.22)
  - avg_momentum=0.25 (sd=10.18), avg_volatility=34.0 (sd=11.74)

  Simulated distribution: STRONG_BUY 15%, BUY 15%, HOLD 36%, SELL 17%, STRONG_SELL 18%
*/

-- Step 1: Add debug component columns to cache if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'edge_c_base') THEN
    ALTER TABLE afl.player_rankings_cache
      ADD COLUMN edge_c_base numeric,
      ADD COLUMN edge_c_form numeric,
      ADD COLUMN edge_c_ceiling numeric,
      ADD COLUMN edge_c_opponent numeric,
      ADD COLUMN edge_c_venue numeric,
      ADD COLUMN edge_c_role numeric,
      ADD COLUMN edge_c_momentum numeric,
      ADD COLUMN edge_c_breakout numeric,
      ADD COLUMN edge_c_risk numeric;
  END IF;
END $$;

-- Step 2: Drop and recreate populate_rankings_cache_from_source with Edge v3 formula
DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, price, breakeven,
    projection_final, form_score, neeko_rating, value_score,
    edge_score, edge_tier, upside_rating, risk_rating,
    ai_recommendation, recommendation_color, recommendation_strength,
    market_watch_category, consistency, matchup_rating,
    is_available, status, manual_status, is_bye, bye_round, bye_next_round,
    edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent,
    edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk,
    cached_at
  )
  WITH components AS (
    SELECT
      pp.player_id,

      -- (A) Base: how far above/below pool average (63) is this player
      (pp.projection - 63.0) * 0.32 AS c_base,

      -- (B) Form trend: last3 vs projection (most recent = most predictive)
      (COALESCE(pp.last3_avg, pp.last5_avg, pp.projection) - pp.projection) * 0.14 AS c_form,

      -- (C) Ceiling upside net of volatility (reward big ceilings, penalise erratic ones)
      (COALESCE(pp.ceiling, pp.projection + 10)::numeric - pp.projection - COALESCE(pp.stddev_last10, 19.0)) * 0.10 AS c_ceiling,

      -- (D) Opponent position concession: multiplier centered at 1.0 (avg=0.992, sd=0.054)
      -- Range [0.92, 1.08] -> contribution [-2.4, +2.4]
      (COALESCE(pp.position_concession_multiplier, 1.0) - 1.0) * 30.0 AS c_opponent,

      -- (E) Venue + home advantage signal
      -- home_advantage avg=1.47 (pts diff), venue_multiplier avg=0.997 (very tight)
      COALESCE(pp.home_advantage, 0) * 0.08
        + (COALESCE(pp.venue_multiplier, 1.0) - 1.0) * 15.0 AS c_venue,

      -- (F) Role stability Z-scored (0-100 scale, avg=66, sd=11.74)
      (COALESCE(pp.stability_score, 66.0) - 66.0) / 11.74 * 2.0 AS c_role,

      -- (G) Form momentum (already centered near 0, sd=10.18)
      -- Captures recent role/form changes week-to-week
      COALESCE(pp.form_momentum, 0) * 0.06 AS c_momentum,

      -- (H) Breakout signal (0-1 scale, pool avg=0.31)
      -- Positive for players with rising opportunity above market expectation
      (COALESCE(pp.breakout_probability, 0.31) - 0.31) * 8.0 AS c_breakout,

      -- (I) Consistency bonus minus volatility penalty (both 0-100, avg=66/34, sd=11.74)
      -- Net signal: consistent players rewarded, volatile ones penalised
      (COALESCE(pp.consistency, 66.0) - 66.0) / 11.74 * 1.5
        - (COALESCE(pp.volatility_score, 34.0) - 34.0) / 11.74 * 1.5 AS c_risk

    FROM afl.mv_player_projection pp
    WHERE pp.player_id IS NOT NULL
  ),
  edge_scored AS (
    SELECT
      c.player_id,
      c.c_base, c.c_form, c.c_ceiling, c.c_opponent,
      c.c_venue, c.c_role, c.c_momentum, c.c_breakout, c.c_risk,
      GREATEST(-20.0, LEAST(20.0,
        c.c_base + c.c_form + c.c_ceiling + c.c_opponent + c.c_venue
        + c.c_role + c.c_momentum + c.c_breakout + c.c_risk
      ))::numeric AS edge_val
    FROM components c
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name AS team,
    pp.team_name,
    pp.position,
    pp.price,
    -- Breakeven: approximate weekly points needed to maintain price
    CASE WHEN pp.season_avg > 0 THEN ROUND((pp.price::numeric / 6000.0)) ELSE NULL END AS breakeven,
    pp.projection AS projection_final,
    pp.form_score,
    pp.neeko_rating,
    pp.value_score,

    -- Edge v3 score (clamped -20 to +20)
    e.edge_val AS edge_score,

    -- Edge tier label
    CASE
      WHEN e.edge_val >= 12 THEN 'ELITE'
      WHEN e.edge_val >= 6  THEN 'STRONG'
      WHEN e.edge_val >= -6 THEN 'NEUTRAL'
      WHEN e.edge_val >= -12 THEN 'WEAK'
      ELSE 'AVOID'
    END AS edge_tier,

    -- Upside rating
    CASE
      WHEN e.edge_val >= 11 THEN 1.40
      WHEN e.edge_val >= 5.5 THEN 1.25
      WHEN e.edge_val >= -5.5 THEN 1.10
      ELSE 1.0
    END AS upside_rating,

    -- Risk rating from volatility
    COALESCE(pp.volatility_score, 50.0) AS risk_rating,

    -- AI recommendation from edge thresholds
    CASE
      WHEN e.edge_val >= 11   THEN 'STRONG_BUY'
      WHEN e.edge_val >= 5.5  THEN 'BUY'
      WHEN e.edge_val <= -11  THEN 'STRONG_SELL'
      WHEN e.edge_val <= -5.5 THEN 'SELL'
      ELSE 'HOLD'
    END AS ai_recommendation,

    -- Recommendation color
    CASE
      WHEN e.edge_val >= 11   THEN 'green'
      WHEN e.edge_val >= 5.5  THEN 'emerald'
      WHEN e.edge_val <= -11  THEN 'red'
      WHEN e.edge_val <= -5.5 THEN 'orange'
      ELSE 'amber'
    END AS recommendation_color,

    -- Recommendation strength as 0-100 text
    ROUND(LEAST(100.0, GREATEST(0.0, (e.edge_val + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS recommendation_strength,

    -- Market Watch category driven by edge
    CASE
      WHEN e.edge_val >= 5.5  THEN 'Target'
      WHEN e.edge_val <= -5.5 THEN 'Avoid'
      ELSE 'Watch'
    END AS market_watch_category,

    -- Consistency (0-100 scale)
    COALESCE(pp.consistency, 50.0) AS consistency,

    -- Matchup rating as text label (cache column is TEXT)
    CASE
      WHEN COALESCE(pp.matchup_rating, 1.0) >= 1.05 THEN 'Favourable'
      WHEN COALESCE(pp.matchup_rating, 1.0) <= 0.95 THEN 'Tough'
      ELSE 'Neutral'
    END AS matchup_rating,

    -- Availability
    true AS is_available,
    NULL::text AS status,
    NULL::text AS manual_status,
    false AS is_bye,
    NULL::integer AS bye_round,
    false AS bye_next_round,

    -- Debug components
    ROUND(e.c_base::numeric, 3),
    ROUND(e.c_form::numeric, 3),
    ROUND(e.c_ceiling::numeric, 3),
    ROUND(e.c_opponent::numeric, 3),
    ROUND(e.c_venue::numeric, 3),
    ROUND(e.c_role::numeric, 3),
    ROUND(e.c_momentum::numeric, 3),
    ROUND(e.c_breakout::numeric, 3),
    ROUND(e.c_risk::numeric, 3),

    NOW() AS cached_at

  FROM afl.mv_player_projection pp
  JOIN edge_scored e ON e.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL;
END;
$$;
