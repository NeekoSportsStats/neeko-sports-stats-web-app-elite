/*
  # Add signal_tag as single source of truth

  ## Summary
  Adds a `signal_tag` column to `afl.player_rankings_cache` that is the ONE
  canonical UI signal for every page (Landing, Market Watch, Edge Board, Rankings).

  ## Changes

  ### New Column
  - `afl.player_rankings_cache.signal_tag` TEXT
    - 'TARGET'  → ai_recommendation IN ('BUY', 'STRONG_BUY')
    - 'AVOID'   → ai_recommendation IN ('SELL', 'STRONG_SELL')
    - 'WATCH'   → ai_recommendation = 'HOLD' (default)

  ### Updated Function
  - `afl.populate_rankings_cache_from_source()` now writes `signal_tag`

  ### Backfill
  - Immediately backfills `signal_tag` for all existing rows

  ## Notes
  - All frontend pages MUST use `signal_tag` for badges, filters, cards
  - `market_watch_category`, `edge_tier`, `value_tag` are informational only
  - No frontend logic should derive signal from edge_score or value_score
*/

-- ============================================================
-- STEP 1: Add column (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name   = 'player_rankings_cache'
      AND column_name  = 'signal_tag'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN signal_tag TEXT;
  END IF;
END $$;

-- ============================================================
-- STEP 2: Rebuild populate function to include signal_tag
-- ============================================================
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'ai'
AS $function$
DECLARE
  v_median_gap numeric;
BEGIN

SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pp.projection - (pp.price::numeric / 7200.0))
INTO v_median_gap
FROM afl.mv_player_projection pp
WHERE pp.player_id IS NOT NULL
  AND pp.price IS NOT NULL
  AND pp.price > 0;

DELETE FROM afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, position, price, breakeven,
  games_played,
  projection_final, form_score, neeko_rating, value_score,
  edge_score, edge_tier, upside_rating, risk_rating,
  ai_recommendation, recommendation_color, recommendation_strength,
  signal_tag,
  market_watch_category, consistency, matchup_rating,
  is_available, status, manual_status, is_bye, bye_round, bye_next_round,
  edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent,
  edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk,
  summary_short, summary_long,
  cached_at
)
WITH base AS (
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name,
    pp.position,
    pp.price,
    pp.projection,
    pp.season_avg,
    pp.last3_avg,
    pp.games_played,
    pp.form_score,
    pp.neeko_rating,
    pp.consistency,
    pp.volatility_score,
    pp.stability_score,
    pp.stddev_last10,
    pp.matchup_rating,
    pp.breakout_probability,
    pp.form_momentum,
    pp.position_concession_multiplier,
    pp.rest_days,
    pp.ceiling,
    pp.floor,
    CASE
      WHEN pp.price IS NULL OR pp.price = 0 THEN NULL
      ELSE ROUND(pp.price::numeric / 7200.0, 1)
    END AS be,
    CASE
      WHEN pp.price IS NULL OR pp.price = 0 THEN 0.0
      ELSE
        LEAST(30.0, GREATEST(-30.0,
          ROUND(
            ((pp.projection - (pp.price::numeric / 7200.0)) - v_median_gap)
            * 1.2
            * CASE WHEN COALESCE(pp.stddev_last10, 19.0) < 10 THEN 1.1
                   WHEN COALESCE(pp.stddev_last10, 19.0) > 25 THEN 0.85
                   ELSE 1.0 END
            * CASE WHEN COALESCE(pp.stability_score, 66.0) > 70 THEN 1.1
                   WHEN COALESCE(pp.stability_score, 66.0) < 60 THEN 0.9
                   ELSE 1.0 END
          , 1)
        ))
    END AS value_score_computed
  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
),
edge_computed AS (
  SELECT
    b.*,
    CASE
      WHEN b.be IS NULL THEN 0.0
      ELSE ROUND((b.projection - b.be)::numeric, 1)
    END AS edge
  FROM base b
),
action_computed AS (
  SELECT
    e.*,
    CASE
      WHEN e.edge >= 20  THEN 'STRONG_BUY'
      WHEN e.edge >= 8   THEN 'BUY'
      WHEN e.edge <= -20 THEN 'STRONG_SELL'
      WHEN e.edge <= -8  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    CASE
      WHEN e.edge >= 20  THEN 'green'
      WHEN e.edge >= 8   THEN 'emerald'
      WHEN e.edge <= -20 THEN 'red'
      WHEN e.edge <= -8  THEN 'orange'
      ELSE 'amber'
    END AS rec_color,
    ROUND(LEAST(100.0, GREATEST(0.0, (e.edge + 30.0) / 60.0 * 100.0))::numeric, 1)::text AS rec_strength,
    CASE
      WHEN e.value_score_computed > 0 AND e.edge >= 8  THEN 'TARGET'
      WHEN e.value_score_computed < 0 OR  e.edge <= -8 THEN 'AVOID'
      ELSE 'WATCH'
    END AS mw_category
  FROM edge_computed e
)
SELECT
  a.player_id,
  a.player_name,
  a.team_name                                  AS team,
  a.team_name,
  a.position,
  a.price,
  a.be::numeric(6,1)                           AS breakeven,
  a.games_played,
  a.projection::numeric                        AS projection_final,
  a.form_score::double precision,
  a.neeko_rating::double precision,
  a.value_score_computed::double precision     AS value_score,
  a.edge::numeric                              AS edge_score,
  CASE
    WHEN a.edge >= 20  THEN 'ELITE'
    WHEN a.edge >= 8   THEN 'STRONG'
    WHEN a.edge >= -8  THEN 'NEUTRAL'
    WHEN a.edge >= -15 THEN 'WEAK'
    ELSE 'AVOID'
  END                                          AS edge_tier,
  CASE
    WHEN a.edge >= 20 THEN 1.40
    WHEN a.edge >= 8  THEN 1.25
    WHEN a.edge >= -8 THEN 1.10
    ELSE 1.0
  END::double precision                        AS upside_rating,
  COALESCE(a.volatility_score, 50.0)::double precision AS risk_rating,
  a.action                                     AS ai_recommendation,
  a.rec_color                                  AS recommendation_color,
  a.rec_strength                               AS recommendation_strength,
  -- SIGNAL_TAG: canonical single source of truth for all UI signals
  CASE
    WHEN a.action IN ('BUY', 'STRONG_BUY')   THEN 'TARGET'
    WHEN a.action IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
    ELSE 'WATCH'
  END                                          AS signal_tag,
  a.mw_category                                AS market_watch_category,
  COALESCE(a.consistency, 50.0)::double precision AS consistency,
  CASE
    WHEN COALESCE(a.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
    WHEN COALESCE(a.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
    ELSE 'Neutral'
  END                                          AS matchup_rating,
  true          AS is_available,
  NULL::text    AS status,
  NULL::text    AS manual_status,
  false         AS is_bye,
  NULL::integer AS bye_round,
  false         AS bye_next_round,
  NULL::numeric AS edge_c_base,
  NULL::numeric AS edge_c_form,
  NULL::numeric AS edge_c_ceiling,
  NULL::numeric AS edge_c_opponent,
  NULL::numeric AS edge_c_venue,
  NULL::numeric AS edge_c_role,
  NULL::numeric AS edge_c_momentum,
  NULL::numeric AS edge_c_breakout,
  NULL::numeric AS edge_c_risk,
  ai_data.summary_short,
  NULL::text    AS summary_long,
  NOW()         AS cached_at
FROM action_computed a
LEFT JOIN ai.player_ai_analysis ai_data ON ai_data.player_id = a.player_id;

END;
$function$;

-- ============================================================
-- STEP 3: Backfill existing rows immediately
-- ============================================================
UPDATE afl.player_rankings_cache
SET signal_tag = CASE
  WHEN ai_recommendation IN ('BUY', 'STRONG_BUY')   THEN 'TARGET'
  WHEN ai_recommendation IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
  ELSE 'WATCH'
END;

-- ============================================================
-- STEP 4: Run full repopulate so signal_tag is set from fresh
-- ============================================================
SELECT afl.populate_rankings_cache_from_source();
