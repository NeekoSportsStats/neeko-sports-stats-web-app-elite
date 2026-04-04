/*
  # Add baseline, edge, signal to player_rankings_cache (Canonical Model Lock)

  ## Summary
  This migration locks the global AFL data model. All frontend pages derive from
  afl.player_rankings_cache with a unified set of canonical computed fields.

  ## New Columns Added
  - `baseline`  NUMERIC(6,1) — performance floor: 0.7*last3_avg + 0.3*season_avg (or season_avg if <5 games)
  - `edge`      NUMERIC(6,1) — projection_final - baseline (replaces edge_score as primary UI metric)
  - `signal`    TEXT         — 5-level: STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL
  - `season_avg` NUMERIC(6,1) — season average fantasy points
  - `last_3_avg` NUMERIC(6,1) — last 3 games average (available from mv_player_projection as last3_avg)
  - `value`     NUMERIC(8,2) — (edge / price) * 100000 (fantasy value ratio)

  ## Signal Rules (LOCKED)
  edge >= 15   → STRONG_BUY
  edge >= 6    → BUY
  edge >= -5   → HOLD
  edge >= -15  → SELL
  else         → STRONG_SELL

  ## Elite Guard
  If projection_final >= 95 AND edge > -10 → signal is at minimum HOLD

  ## Updated Function
  - afl.populate_rankings_cache_from_source() fully rewritten to use new model
  - signal_tag kept in sync with signal for backwards compat

  ## Security
  - SECURITY DEFINER, owned by postgres
  - RLS on table unchanged
*/

-- ============================================================
-- STEP 1: Add new columns (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'baseline'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN baseline NUMERIC(6,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'edge'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN edge NUMERIC(6,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'signal'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN signal TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'season_avg'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN season_avg NUMERIC(6,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'last_3_avg'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN last_3_avg NUMERIC(6,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'value'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN value NUMERIC(8,2);
  END IF;
END $$;

-- ============================================================
-- STEP 2: Rebuild populate function with canonical model
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
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY pp.projection - (pp.price::numeric / 7200.0)
  )
INTO v_median_gap
FROM afl.mv_player_projection pp
WHERE pp.player_id IS NOT NULL
  AND pp.price IS NOT NULL
  AND pp.price > 0;

DELETE FROM afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, position,
  price, breakeven, games_played,
  season_avg, last_3_avg, baseline,
  projection_final, edge, signal,
  form_score, neeko_rating, value_score, value,
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
    COALESCE(pp.season_avg, pp.projection, 0.0) AS s_avg,
    COALESCE(pp.last3_avg,  pp.projection, 0.0) AS l3_avg,
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
    pp.ceiling,
    pp.floor,
    -- Baseline: weighted recent form if enough data
    ROUND(
      CASE
        WHEN COALESCE(pp.games_played, 0) >= 5
          THEN COALESCE(pp.last3_avg, pp.season_avg, pp.projection, 60.0) * 0.7
             + COALESCE(pp.season_avg, pp.projection, 60.0)               * 0.3
        ELSE COALESCE(pp.season_avg, pp.projection, 60.0)
      END
    ::numeric, 1) AS baseline_val,
    -- Legacy breakeven (price / 7200)
    CASE
      WHEN pp.price IS NULL OR pp.price = 0 THEN NULL
      ELSE ROUND(pp.price::numeric / 7200.0, 1)
    END AS be,
    -- Legacy value score (normalized)
    CASE
      WHEN pp.price IS NULL OR pp.price = 0 THEN 0.0
      ELSE LEAST(30.0, GREATEST(-30.0,
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
    -- NEW canonical edge: projection - baseline
    ROUND((b.projection - b.baseline_val)::numeric, 1) AS edge_val,
    -- Legacy edge (vs breakeven)
    CASE
      WHEN b.be IS NULL THEN 0.0
      ELSE ROUND((b.projection - b.be)::numeric, 1)
    END AS edge_legacy
  FROM base b
),
signal_computed AS (
  SELECT
    e.*,
    -- NEW canonical signal from edge
    CASE
      -- Elite guard: high projection + edge not terrible = minimum HOLD
      WHEN e.projection >= 95 AND e.edge_val > -10 THEN
        CASE
          WHEN e.edge_val >= 15 THEN 'STRONG_BUY'
          WHEN e.edge_val >= 6  THEN 'BUY'
          ELSE 'HOLD'
        END
      WHEN e.edge_val >= 15  THEN 'STRONG_BUY'
      WHEN e.edge_val >= 6   THEN 'BUY'
      WHEN e.edge_val >= -5  THEN 'HOLD'
      WHEN e.edge_val >= -15 THEN 'SELL'
      ELSE 'STRONG_SELL'
    END AS signal_val,
    -- Legacy action for backwards compat
    CASE
      WHEN e.edge_legacy >= 20  THEN 'STRONG_BUY'
      WHEN e.edge_legacy >= 8   THEN 'BUY'
      WHEN e.edge_legacy <= -20 THEN 'STRONG_SELL'
      WHEN e.edge_legacy <= -8  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    ROUND(LEAST(100.0, GREATEST(0.0, (e.edge_legacy + 30.0) / 60.0 * 100.0))::numeric, 1)::text AS rec_strength,
    -- Value: (edge / price) * 100000
    CASE
      WHEN e.price IS NULL OR e.price = 0 THEN 0.0
      ELSE ROUND((e.edge_val / e.price::numeric) * 100000.0, 2)
    END AS value_ratio
  FROM edge_computed e
)
SELECT
  s.player_id,
  s.player_name,
  s.team_name                                   AS team,
  s.team_name,
  s.position,
  s.price,
  s.be::numeric(6,1)                            AS breakeven,
  s.games_played,
  -- New canonical fields
  s.s_avg::numeric(6,1)                         AS season_avg,
  s.l3_avg::numeric(6,1)                        AS last_3_avg,
  s.baseline_val::numeric(6,1)                  AS baseline,
  s.projection::numeric                         AS projection_final,
  s.edge_val::numeric(6,1)                      AS edge,
  s.signal_val                                  AS signal,
  -- Scores
  s.form_score::double precision,
  s.neeko_rating::double precision,
  s.value_score_computed::double precision      AS value_score,
  s.value_ratio::numeric(8,2)                   AS value,
  s.edge_legacy::numeric                        AS edge_score,
  CASE
    WHEN s.edge_legacy >= 20  THEN 'ELITE'
    WHEN s.edge_legacy >= 8   THEN 'STRONG'
    WHEN s.edge_legacy >= -8  THEN 'NEUTRAL'
    WHEN s.edge_legacy >= -15 THEN 'WEAK'
    ELSE 'AVOID'
  END                                           AS edge_tier,
  CASE
    WHEN s.edge_legacy >= 20 THEN 1.40
    WHEN s.edge_legacy >= 8  THEN 1.25
    WHEN s.edge_legacy >= -8 THEN 1.10
    ELSE 1.0
  END::double precision                         AS upside_rating,
  COALESCE(s.volatility_score, 50.0)::double precision AS risk_rating,
  -- Legacy recommendation (backwards compat)
  s.action                                      AS ai_recommendation,
  CASE
    WHEN s.edge_legacy >= 20  THEN 'green'
    WHEN s.edge_legacy >= 8   THEN 'emerald'
    WHEN s.edge_legacy <= -20 THEN 'red'
    WHEN s.edge_legacy <= -8  THEN 'orange'
    ELSE 'amber'
  END                                           AS recommendation_color,
  s.rec_strength                                AS recommendation_strength,
  -- Signal tag (3-level for backwards compat, now derived from signal)
  CASE
    WHEN s.signal_val IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
    WHEN s.signal_val IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
    ELSE 'WATCH'
  END                                           AS signal_tag,
  -- Market watch category
  CASE
    WHEN s.signal_val IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
    WHEN s.signal_val IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
    ELSE 'WATCH'
  END                                           AS market_watch_category,
  COALESCE(s.consistency, 50.0)::double precision AS consistency,
  CASE
    WHEN COALESCE(s.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
    WHEN COALESCE(s.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
    ELSE 'Neutral'
  END                                           AS matchup_rating,
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
FROM signal_computed s
LEFT JOIN ai.player_ai_analysis ai_data ON ai_data.player_id = s.player_id;

END;
$function$;

-- ============================================================
-- STEP 3: Backfill existing rows with new columns
-- ============================================================
WITH src AS (
  SELECT
    pp.player_id,
    COALESCE(pp.season_avg, pp.projection, 0.0) AS s_avg,
    COALESCE(pp.last3_avg,  pp.projection, 0.0) AS l3_avg,
    ROUND(
      CASE
        WHEN COALESCE(pp.games_played, 0) >= 5
          THEN COALESCE(pp.last3_avg, pp.season_avg, pp.projection, 60.0) * 0.7
             + COALESCE(pp.season_avg, pp.projection, 60.0)               * 0.3
        ELSE COALESCE(pp.season_avg, pp.projection, 60.0)
      END
    ::numeric, 1) AS bl,
    pp.projection
  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
)
UPDATE afl.player_rankings_cache c
SET
  season_avg = src.s_avg,
  last_3_avg = src.l3_avg,
  baseline   = src.bl,
  edge       = ROUND((c.projection_final - src.bl)::numeric, 1),
  signal     = CASE
    WHEN c.projection_final >= 95 AND (c.projection_final - src.bl) > -10 THEN
      CASE
        WHEN (c.projection_final - src.bl) >= 15 THEN 'STRONG_BUY'
        WHEN (c.projection_final - src.bl) >= 6  THEN 'BUY'
        ELSE 'HOLD'
      END
    WHEN (c.projection_final - src.bl) >= 15  THEN 'STRONG_BUY'
    WHEN (c.projection_final - src.bl) >= 6   THEN 'BUY'
    WHEN (c.projection_final - src.bl) >= -5  THEN 'HOLD'
    WHEN (c.projection_final - src.bl) >= -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  value      = CASE
    WHEN c.price IS NULL OR c.price = 0 THEN 0.0
    ELSE ROUND(((c.projection_final - src.bl) / c.price::numeric) * 100000.0, 2)
  END,
  signal_tag = CASE
    WHEN c.projection_final >= 95 AND (c.projection_final - src.bl) > -10 THEN
      CASE
        WHEN (c.projection_final - src.bl) >= 6 THEN 'TARGET'
        ELSE 'WATCH'
      END
    WHEN (c.projection_final - src.bl) >= 6   THEN 'TARGET'
    WHEN (c.projection_final - src.bl) >= -5  THEN 'WATCH'
    ELSE 'AVOID'
  END
FROM src
WHERE src.player_id = c.player_id;

-- ============================================================
-- STEP 4: Create public canonical view (clean contract for frontend)
-- ============================================================
CREATE OR REPLACE VIEW public.v_players_canonical AS
SELECT
  c.player_id         AS id,
  c.player_name       AS name,
  c.team,
  c.position,
  c.price,
  c.games_played,
  c.projection_final  AS projection,
  c.season_avg,
  c.last_3_avg,
  c.baseline,
  c.edge,
  c.signal,
  c.value,
  c.signal_tag,
  c.summary_short,
  c.summary_long,
  c.status,
  c.manual_status,
  c.is_available,
  c.is_bye,
  c.bye_round,
  c.bye_next_round,
  c.neeko_rating,
  c.value_score,
  c.form_score,
  c.projection_confidence,
  c.captain_score,
  c.captain_rating,
  c.breakeven,
  c.matchup_rating,
  c.consistency,
  c.cached_at
FROM afl.player_rankings_cache c;

-- Grant anon + authenticated read on canonical view
GRANT SELECT ON public.v_players_canonical TO anon, authenticated;
