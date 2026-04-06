/*
  # Fix: Preserve all AI columns in populate_rankings_cache_from_source

  ## Problem
  `afl.populate_rankings_cache_from_source()` runs daily (Step 8 of run_neeko_pipeline).
  The ON CONFLICT clause only COALESCE-preserves 4 AI columns:
    - summary_short
    - ai_summary
    - recommendation_color
    - recommendation_short

  These AI columns are WIPED to NULL on every daily pipeline run:
    - summary_long        ← the long-form AI analysis shown on player pages
    - recommendation_why  ← alias for summary_long in older views
    - ai_generated_at     ← timestamp of last AI generation
    - ai_prompt_version   ← which prompt version generated the content
    - ai_validation_passed ← whether AI output passed validation checks
    - ai_cache_snapshot_id ← snapshot linkage
    - ai_updated_at       ← last AI update time

  ## Fix
  Rebuild the function with all AI columns preserved via COALESCE on conflict.
  This is a DROP + CREATE because PostgreSQL requires it for function body changes.

  ## Impact
  After this fix, summary_long written by generate-player-ai will survive
  the daily pipeline rebuild and be visible on the frontend.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  p85  double precision;
  p65  double precision;
  p35  double precision;
  p15  double precision;
BEGIN

-- Step 1: Edge percentile thresholds from live data only
SELECT
  PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY edge_raw),
  PERCENTILE_CONT(0.65) WITHIN GROUP (ORDER BY edge_raw),
  PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY edge_raw),
  PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY edge_raw)
INTO p85, p65, p35, p15
FROM (
  SELECT
    pp.projection::double precision
    - COALESCE(pf.last5_avg, pf.last3_avg, pp.season_avg, pp.projection)::double precision
    AS edge_raw
  FROM afl.mv_player_projection pp
  LEFT JOIN afl.feature_player_form pf ON pf.player_id = pp.player_id
  WHERE pp.games_played >= 3
    AND pp.projection::double precision > 40
) t
WHERE edge_raw IS NOT NULL;

-- Step 2: Upsert cache — preserve ALL AI columns on conflict
INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, team_id, position,
  price,
  projection_final, projection, ceiling, floor,
  games_played, season_avg, last_3_avg, last_5_avg, form_score, consistency,
  breakeven, edge,
  value_score,
  signal, signal_tag,
  status, manual_status, is_available, is_bye,
  -- AI columns inserted as NULL, preserved via COALESCE on conflict
  summary_short, summary_long, ai_summary,
  recommendation_color, recommendation_short, recommendation_why,
  ai_generated_at, ai_prompt_version, ai_validation_passed,
  ai_updated_at, ai_cache_snapshot_id,
  cached_at
)
SELECT
  pp.player_id,
  pp.player_name,
  pp.team_name                                              AS team,
  pp.team_name,
  pp.team_id,
  pp.position,

  -- Price: feature_price canonical, fallback to mv
  COALESCE(fp.price, pp.price)                             AS price,

  -- Projection
  COALESCE(prj.projection_final, pp.projection::numeric)   AS projection_final,
  pp.projection::double precision                          AS projection,
  pp.ceiling::double precision                             AS ceiling,
  pp.floor::double precision                               AS floor,

  pp.games_played,
  pp.season_avg::numeric,
  pp.last3_avg::numeric                                    AS last_3_avg,
  pp.last5_avg::numeric                                    AS last_5_avg,
  pp.form_score::double precision,
  pp.consistency::double precision,

  -- breakeven = last5_avg → last3_avg → season_avg → projection
  COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric AS breakeven,

  -- edge = projection_final - breakeven
  (
    COALESCE(prj.projection_final, pp.projection::numeric)
    - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
  )::numeric                                               AS edge,

  -- value_score: edge per $100k, damped by games_played confidence
  CASE
    WHEN COALESCE(fp.price, pp.price) > 0 THEN
      ROUND((
        (
          COALESCE(prj.projection_final, pp.projection::numeric)
          - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
        ) * 100000.0
        / COALESCE(fp.price, pp.price)
        * CASE
            WHEN pp.games_played >= 5 THEN 1.0
            WHEN pp.games_played = 4  THEN 0.85
            WHEN pp.games_played = 3  THEN 0.70
            WHEN pp.games_played = 2  THEN 0.50
            WHEN pp.games_played = 1  THEN 0.30
            ELSE 0.20
          END
      )::numeric, 2)
    ELSE NULL
  END::double precision                                    AS value_score,

  -- signal: pure percentile rank on edge
  CASE
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision >= p85 THEN 'STRONG_UP'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision >= p65 THEN 'UP'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision > p35  THEN 'STABLE'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision > p15  THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END                                                      AS signal,

  -- signal_tag mirrors signal
  CASE
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision >= p85 THEN 'STRONG_UP'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision >= p65 THEN 'UP'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision > p35  THEN 'STABLE'
    WHEN (
      COALESCE(prj.projection_final, pp.projection::numeric)
      - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)::numeric
    )::double precision > p15  THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END                                                      AS signal_tag,

  -- Status
  COALESCE(pp_status.status, 'AVAILABLE')                  AS status,
  COALESCE(pl.manual_status, 'AVAILABLE')                  AS manual_status,

  -- is_available
  CASE
    WHEN COALESCE(pl.active, true) = false                                          THEN false
    WHEN UPPER(COALESCE(pl.manual_status, '')) IN ('OUT','INJURED','OMITTED','INACTIVE') THEN false
    WHEN UPPER(COALESCE(pp_status.status,  '')) IN ('OUT','INJURED')                THEN false
    ELSE true
  END                                                      AS is_available,

  -- is_bye
  COALESCE(tb.is_bye_active, false)                        AS is_bye,

  -- AI columns — NULL here, ALL preserved via COALESCE on conflict
  NULL::text,   -- summary_short
  NULL::text,   -- summary_long
  NULL::text,   -- ai_summary
  NULL::text,   -- recommendation_color
  NULL::text,   -- recommendation_short
  NULL::text,   -- recommendation_why
  NULL::timestamptz, -- ai_generated_at
  NULL::text,   -- ai_prompt_version
  NULL::boolean, -- ai_validation_passed
  NULL::timestamptz, -- ai_updated_at
  NULL::uuid,   -- ai_cache_snapshot_id

  now()

FROM afl.mv_player_projection pp

LEFT JOIN afl.feature_price fp
  ON fp.player_id = pp.player_id

LEFT JOIN afl.player_projection prj
  ON prj.player_id = pp.player_id

LEFT JOIN afl.players pl
  ON pl.player_id = pp.player_id

LEFT JOIN (
  SELECT DISTINCT ON (player_id)
    player_id, status
  FROM afl.player_prices
  ORDER BY player_id, created_at DESC
) pp_status ON pp_status.player_id = pp.player_id

LEFT JOIN afl.team_byes tb
  ON tb.team_id = pp.team_id
  AND tb.is_bye_active = true

WHERE pp.player_id IS NOT NULL
  AND pp.player_name IS NOT NULL

ON CONFLICT (player_id) DO UPDATE SET
  player_name          = EXCLUDED.player_name,
  team                 = EXCLUDED.team,
  team_name            = EXCLUDED.team_name,
  team_id              = EXCLUDED.team_id,
  position             = EXCLUDED.position,
  price                = EXCLUDED.price,
  projection_final     = EXCLUDED.projection_final,
  projection           = EXCLUDED.projection,
  ceiling              = EXCLUDED.ceiling,
  floor                = EXCLUDED.floor,
  games_played         = EXCLUDED.games_played,
  season_avg           = EXCLUDED.season_avg,
  last_3_avg           = EXCLUDED.last_3_avg,
  last_5_avg           = EXCLUDED.last_5_avg,
  form_score           = EXCLUDED.form_score,
  consistency          = EXCLUDED.consistency,
  breakeven            = EXCLUDED.breakeven,
  edge                 = EXCLUDED.edge,
  value_score          = EXCLUDED.value_score,
  signal               = EXCLUDED.signal,
  signal_tag           = EXCLUDED.signal_tag,
  status               = EXCLUDED.status,
  manual_status        = EXCLUDED.manual_status,
  is_available         = EXCLUDED.is_available,
  is_bye               = EXCLUDED.is_bye,
  -- Preserve ALL AI columns: keep existing if not null, otherwise take EXCLUDED (which is also null)
  summary_short        = COALESCE(afl.player_rankings_cache.summary_short,        EXCLUDED.summary_short),
  summary_long         = COALESCE(afl.player_rankings_cache.summary_long,         EXCLUDED.summary_long),
  ai_summary           = COALESCE(afl.player_rankings_cache.ai_summary,           EXCLUDED.ai_summary),
  recommendation_color = COALESCE(afl.player_rankings_cache.recommendation_color, EXCLUDED.recommendation_color),
  recommendation_short = COALESCE(afl.player_rankings_cache.recommendation_short, EXCLUDED.recommendation_short),
  recommendation_why   = COALESCE(afl.player_rankings_cache.recommendation_why,   EXCLUDED.recommendation_why),
  ai_generated_at      = COALESCE(afl.player_rankings_cache.ai_generated_at,      EXCLUDED.ai_generated_at),
  ai_prompt_version    = COALESCE(afl.player_rankings_cache.ai_prompt_version,    EXCLUDED.ai_prompt_version),
  ai_validation_passed = COALESCE(afl.player_rankings_cache.ai_validation_passed, EXCLUDED.ai_validation_passed),
  ai_updated_at        = COALESCE(afl.player_rankings_cache.ai_updated_at,        EXCLUDED.ai_updated_at),
  ai_cache_snapshot_id = COALESCE(afl.player_rankings_cache.ai_cache_snapshot_id, EXCLUDED.ai_cache_snapshot_id),
  cached_at            = now();

END;
$$;
