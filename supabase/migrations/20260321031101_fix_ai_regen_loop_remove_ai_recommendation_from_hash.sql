/*
  # Fix AI Perpetual Regen Loop

  ## Problem
  v_ai_player_analysis_input included c.ai_recommendation in the md5 input_hash.
  That field is itself derived by populate_rankings_cache_from_source() from
  projection and value_score on every pipeline run. Including it created a
  circular dependency:

    1. Pipeline runs -> projection or value_score shifts slightly
    2. ai_recommendation label may flip (e.g. HOLD -> BUY)
    3. input_hash in the view changes
    4. a.input_hash != v.input_hash -> needs_regen = true for that player
    5. generate-player-ai regenerates and writes new input_hash
    6. Next pipeline run -> back to step 1

  This sustained a perpetual regen loop: ~20 players processed per 5-min cron
  run, reset every daily pipeline cycle, net daily progress near zero.

  ## Fix
  Remove c.ai_recommendation from the md5 hash. The hash now covers only
  stable input features: projection_final, projection_confidence, value_score,
  games_played, risk_rating, neeko_rating_scaled. These change only when real
  underlying data changes, not from the derived recommendation label.

  Both dependent views (v_pipeline_health and v_pipeline_health_check) are
  recreated identically after the CASCADE drop.

  ## Tables / Views Modified
  - public.v_ai_player_analysis_input (DROP CASCADE, recreate with fixed hash)
  - public.v_pipeline_health (recreated identically)
  - public.v_pipeline_health_check (recreated identically)

  ## Notes
  - No data is modified. This is a view-only change.
  - All 724 rows in ai.player_ai_analysis with generated_at = NULL remain
    queued via the WHEN a.generated_at IS NULL THEN true branch.
  - After this fix, daily run_neeko_ai_enqueue will only re-flag rows whose
    real input data has changed -- not rows whose derived label changed.
*/

DROP VIEW IF EXISTS public.v_pipeline_health CASCADE;
DROP VIEW IF EXISTS public.v_pipeline_health_check CASCADE;
DROP VIEW IF EXISTS public.v_ai_player_analysis_input CASCADE;

-- Recreate v_ai_player_analysis_input with ai_recommendation removed from hash
CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  c.ceiling,
  c.floor,
  c.risk_rating         AS risk,
  c.projection_confidence AS confidence,
  c.consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier  AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.upside_pct,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_strength,

  -- Fixed hash: ai_recommendation removed to break the circular dependency.
  -- ai_recommendation is derived from projection + value_score + risk which
  -- are already represented here. Including the derived output label caused
  -- perpetual regen whenever the pipeline recomputed the label.
  md5(
    COALESCE(c.projection_final::text,       '') ||
    COALESCE(c.projection_confidence::text,  '') ||
    COALESCE(c.value_score::text,            '') ||
    COALESCE(c.games_played::text,           '') ||
    COALESCE(c.risk_rating::text,            '') ||
    COALESCE(c.neeko_rating_scaled::text,    '')
  ) AS input_hash,

  CASE
    WHEN a.player_id IS NULL     THEN true
    WHEN a.generated_at IS NULL  THEN true
    WHEN a.input_hash IS NULL    THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text,       '') ||
      COALESCE(c.projection_confidence::text,  '') ||
      COALESCE(c.value_score::text,            '') ||
      COALESCE(c.games_played::text,           '') ||
      COALESCE(c.risk_rating::text,            '') ||
      COALESCE(c.neeko_rating_scaled::text,    '')
    )                            THEN true
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2::numeric
                                 THEN true
    ELSE false
  END AS needs_regen

FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated;
GRANT SELECT ON public.v_ai_player_analysis_input TO service_role;

-- Recreate v_pipeline_health (identical to prior definition)
CREATE OR REPLACE VIEW public.v_pipeline_health AS
WITH cache_stats AS (
  SELECT
    count(*)                                                                    AS total_players,
    count(*) FILTER (WHERE ai_summary IS NOT NULL)                             AS players_with_ai,
    count(*) FILTER (WHERE ai_updated_at > (now() - interval '24 hours'))      AS ai_fresh_24h,
    count(*) FILTER (WHERE ai_summary IS NULL)                                 AS missing_ai,
    max(ai_updated_at)                                                          AS last_ai_write,
    max(created_at)                                                             AS last_cache_refresh
  FROM afl.player_rankings_cache
),
pipeline_stats AS (
  SELECT
    max(started_at)                                                             AS last_pipeline_run,
    (SELECT status FROM pipeline_runs ORDER BY started_at DESC LIMIT 1)        AS last_pipeline_status,
    (SELECT duration_ms FROM pipeline_runs ORDER BY started_at DESC LIMIT 1)   AS last_pipeline_duration_ms,
    count(*) FILTER (WHERE started_at > (now() - interval '24 hours'))         AS pipeline_runs_today
  FROM pipeline_runs
),
regen_stats AS (
  SELECT count(*) FILTER (WHERE needs_regen = true) AS needs_regen_count
  FROM v_ai_player_analysis_input
),
error_stats AS (
  SELECT message AS last_error
  FROM system_logs
  WHERE log_level = 'error'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  cs.total_players,
  cs.players_with_ai,
  cs.ai_fresh_24h,
  cs.missing_ai,
  cs.last_ai_write,
  cs.last_cache_refresh,
  ps.last_pipeline_run,
  ps.last_pipeline_status,
  ps.last_pipeline_duration_ms,
  ps.pipeline_runs_today,
  CASE
    WHEN cs.total_players > 0
      THEN round(cs.players_with_ai::numeric / cs.total_players::numeric * 100, 1)
    ELSE 0
  END AS ai_coverage_pct,
  rs.needs_regen_count,
  CASE
    WHEN ps.last_pipeline_run > (now() - interval '26 hours') THEN true
    ELSE false
  END AS cron_healthy,
  es.last_error
FROM cache_stats cs
CROSS JOIN pipeline_stats ps
CROSS JOIN regen_stats rs
LEFT JOIN error_stats es ON true;

GRANT SELECT ON public.v_pipeline_health TO authenticated;
GRANT SELECT ON public.v_pipeline_health TO service_role;

-- Recreate v_pipeline_health_check (identical to prior definition)
CREATE OR REPLACE VIEW public.v_pipeline_health_check AS
WITH ingest_freshness AS (
  SELECT
    max(rps.updated_at)                                       AS last_ingest_at,
    EXTRACT(epoch FROM now() - max(rps.updated_at)) / 3600   AS hours_since_ingest,
    count(*)                                                  AS total_raw_stat_rows
  FROM afl.raw_player_stats rps
  WHERE rps.season = 2026
),
ingest_gaps AS (
  SELECT count(*) AS games_missing_stats
  FROM afl.games_raw g
  WHERE g.status_short = 'FT'
    AND g.season = 2026
    AND NOT EXISTS (
      SELECT 1 FROM afl.raw_player_stats r WHERE r.game_id = g.game_id
    )
),
player_games_freshness AS (
  SELECT
    count(DISTINCT pg.game_id) AS normalized_games,
    count(*)                   AS total_player_game_rows,
    max(g.game_date)           AS last_game_date
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  WHERE g.season = 2026
),
projection_freshness AS (
  SELECT
    count(*)          AS players_with_projection,
    max(pp.generated_at)                                         AS last_projection_at,
    EXTRACT(epoch FROM now() - max(pp.generated_at)) / 3600     AS hours_since_projection
  FROM afl.player_projection pp
),
cache_freshness AS (
  SELECT
    count(*)          AS total_cached,
    max(prc.cached_at)                                           AS last_cache_at,
    EXTRACT(epoch FROM now() - max(prc.cached_at)) / 3600       AS hours_since_cache
  FROM afl.player_rankings_cache prc
),
rec_dist AS (
  SELECT
    count(*) FILTER (WHERE ai_recommendation = 'BUY')   AS rec_buy,
    count(*) FILTER (WHERE ai_recommendation = 'HOLD')  AS rec_hold,
    count(*) FILTER (WHERE ai_recommendation = 'SELL')  AS rec_sell,
    count(*)                                             AS rec_total,
    CASE
      WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE ai_recommendation = 'SELL')  THEN true
      WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE ai_recommendation = 'HOLD')  THEN true
      WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE ai_recommendation = 'BUY')   THEN true
      ELSE false
    END AS recommendation_flat
  FROM afl.player_rankings_cache
),
matchup_dist AS (
  SELECT
    count(*) FILTER (WHERE matchup_rating = 'ELITE')       AS matchup_elite,
    count(*) FILTER (WHERE matchup_rating = 'FAVOURABLE')  AS matchup_favourable,
    count(*) FILTER (WHERE matchup_rating = 'NEUTRAL')     AS matchup_neutral,
    count(*) FILTER (WHERE matchup_rating = 'TOUGH')       AS matchup_tough,
    CASE
      WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE matchup_rating = 'TOUGH') THEN true
      ELSE false
    END AS matchup_flat
  FROM afl.player_rankings_cache
),
ai_coverage AS (
  SELECT
    count(*)                                                          AS total_players_in_cache,
    count(prc.ai_summary)                                            AS players_with_ai_text,
    count(*) - count(prc.ai_summary)                                 AS players_missing_ai_text,
    count(*) FILTER (WHERE vai.needs_regen = true)                   AS players_needing_regen,
    max(prc.ai_updated_at)                                           AS last_ai_generated_at,
    EXTRACT(epoch FROM now() - max(prc.ai_updated_at)) / 3600       AS hours_since_ai_update
  FROM afl.player_rankings_cache prc
  LEFT JOIN v_ai_player_analysis_input vai ON vai.player_id = prc.player_id
),
last_run AS (
  SELECT
    status,
    started_at,
    finished_at,
    completed_tasks,
    total_tasks,
    EXTRACT(epoch FROM finished_at - started_at) AS duration_seconds
  FROM pipeline_runs
  WHERE pipeline_key = 'neeko_full'
  ORDER BY started_at DESC
  LIMIT 1
)
SELECT
  i.last_ingest_at,
  round(i.hours_since_ingest, 1)            AS hours_since_ingest,
  i.total_raw_stat_rows,
  g.games_missing_stats,
  pgf.normalized_games,
  pgf.total_player_game_rows,
  pgf.last_game_date,
  pf.players_with_projection,
  pf.last_projection_at,
  round(pf.hours_since_projection, 1)       AS hours_since_projection,
  cf.total_cached,
  cf.last_cache_at,
  round(cf.hours_since_cache, 1)            AS hours_since_cache,
  rd.rec_buy,
  rd.rec_hold,
  rd.rec_sell,
  rd.rec_total,
  rd.recommendation_flat,
  md.matchup_elite,
  md.matchup_favourable,
  md.matchup_neutral,
  md.matchup_tough,
  md.matchup_flat,
  ac.total_players_in_cache,
  ac.players_with_ai_text,
  ac.players_missing_ai_text,
  ac.players_needing_regen,
  ac.last_ai_generated_at,
  round(ac.hours_since_ai_update, 1)        AS hours_since_ai_update,
  lr.status                                 AS last_pipeline_status,
  lr.started_at                             AS last_pipeline_started_at,
  lr.completed_tasks                        AS last_pipeline_tasks_completed,
  lr.total_tasks                            AS last_pipeline_tasks_total,
  round(lr.duration_seconds, 0)             AS last_pipeline_duration_seconds,
  CASE
    WHEN g.games_missing_stats > 0
      THEN 'DEGRADED: ' || g.games_missing_stats || ' FT games missing stats'
    WHEN rd.recommendation_flat
      THEN 'DEGRADED: recommendation distribution is flat'
    WHEN md.matchup_flat
      THEN 'DEGRADED: matchup distribution is flat (all TOUGH)'
    WHEN ac.players_needing_regen > 50
      THEN 'WARN: ' || ac.players_needing_regen || ' players need AI regen'
    WHEN round(cf.hours_since_cache, 1) > 25
      THEN 'WARN: cache is >25h stale'
    ELSE 'HEALTHY'
  END AS health_status
FROM ingest_freshness i
CROSS JOIN ingest_gaps g
CROSS JOIN player_games_freshness pgf
CROSS JOIN projection_freshness pf
CROSS JOIN cache_freshness cf
CROSS JOIN rec_dist rd
CROSS JOIN matchup_dist md
CROSS JOIN ai_coverage ac
LEFT JOIN last_run lr ON true;

GRANT SELECT ON public.v_pipeline_health_check TO authenticated;
GRANT SELECT ON public.v_pipeline_health_check TO service_role;
