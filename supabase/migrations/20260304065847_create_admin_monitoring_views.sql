/*
  # Admin Monitoring Views

  ## Purpose
  Provides a set of read-only views that power the internal Admin Monitoring
  Dashboard. The site owner can verify pipeline health, data ingest status,
  AI generation state, start/sit cache, canonical stats integrity, and data
  quality checks — all from a single page.

  ## New Objects

  1. public.v_pipeline_health          — latest pipeline run stats from ai_generation_logs
  2. public.v_ingest_health            — raw 2026 ingest table row counts + timestamps
  3. public.v_canonical_health         — canonical player stats summary
  4. public.v_ai_generation_health     — AI summary coverage
  5. public.v_start_sit_cache_health   — start/sit cache row count + freshness
  6. public.v_data_integrity_checks    — missing-field counts across rankings view

  ## Schema Notes
  - ai_generation_logs lives in the afl schema
  - ai_player_summaries lives in the afl schema
  - ai_team_summaries exists in both afl and public schemas; we use afl
  - start_sit_cache lives in public schema
  - v_rankings_master is a view in public schema
  - raw_2026_* tables live in afl schema
  - player_round_stats_2025 lives in afl schema

  ## Safety
  - No existing tables or views are modified
  - All views use CREATE OR REPLACE
  - GRANT SELECT to authenticated and anon (admin page checks user ID client-side)
*/

-- ─── 1. Pipeline Health ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_pipeline_health AS
SELECT
  MAX(execution_completed)                                          AS last_pipeline_run,
  COUNT(*) FILTER (WHERE status = 'success')                       AS successful_runs,
  COUNT(*) FILTER (WHERE status = 'partial')                       AS partial_runs,
  COUNT(*) FILTER (WHERE status = 'failed')                        AS failed_runs,
  COUNT(*)                                                          AS total_runs,
  MAX(duration_ms)                                                  AS max_duration_ms,
  ROUND(AVG(duration_ms)::numeric)                                  AS avg_duration_ms,
  (
    SELECT error_message
    FROM afl.ai_generation_logs
    WHERE status IN ('failed','partial')
    ORDER BY execution_completed DESC
    LIMIT 1
  )                                                                 AS last_error,
  (
    SELECT status
    FROM afl.ai_generation_logs
    ORDER BY execution_completed DESC
    LIMIT 1
  )                                                                 AS latest_status
FROM afl.ai_generation_logs;

GRANT SELECT ON public.v_pipeline_health TO anon, authenticated;

-- ─── 2. Ingest Health ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ingest_health AS
SELECT
  (SELECT MAX(created_at)  FROM afl.raw_2026_matches)              AS last_match_ingest,
  (SELECT COUNT(*)         FROM afl.raw_2026_matches)              AS total_matches,
  (SELECT MAX(season)      FROM afl.raw_2026_matches)              AS latest_match_season,
  (SELECT MAX(round_number)FROM afl.raw_2026_matches)              AS latest_match_round,

  (SELECT MAX(created_at)  FROM afl.raw_2026_player_stats)         AS last_player_stats_ingest,
  (SELECT COUNT(*)         FROM afl.raw_2026_player_stats)         AS total_player_stat_rows,

  (SELECT MAX(created_at)  FROM afl.raw_2026_team_stats)           AS last_team_stats_ingest,
  (SELECT COUNT(*)         FROM afl.raw_2026_team_stats)           AS total_team_stat_rows;

GRANT SELECT ON public.v_ingest_health TO anon, authenticated;

-- ─── 3. Canonical Data Health ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_canonical_health AS
SELECT
  MAX(s.round_number)                                              AS latest_round_loaded,
  COUNT(*)                                                         AS total_player_round_rows,
  COUNT(DISTINCT s.player)                                         AS unique_players,
  COUNT(DISTINCT s.season)                                         AS seasons_covered,
  MIN(s.season)                                                    AS earliest_season,
  MAX(s.season)                                                    AS latest_season,
  COUNT(*) FILTER (WHERE s.fantasy_points IS NULL)                 AS rows_missing_fantasy_points,
  ROUND(AVG(s.fantasy_points)::numeric, 1)                        AS overall_avg_fantasy_points
FROM afl.player_round_stats_2025 s;

GRANT SELECT ON public.v_canonical_health TO anon, authenticated;

-- ─── 4. AI Generation Health ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ai_generation_health AS
SELECT
  (SELECT COUNT(*) FROM afl.ai_player_summaries)                  AS player_ai_rows,
  (SELECT COUNT(*) FROM afl.ai_team_summaries)                    AS team_ai_rows,
  (SELECT COUNT(*) FROM afl.ai_player_summaries
   WHERE ai_summary IS NOT NULL AND ai_summary <> '')              AS player_ai_with_summary,
  (SELECT COUNT(*) FROM afl.ai_team_summaries
   WHERE summary IS NOT NULL AND summary <> '')                    AS team_ai_with_summary,
  (SELECT MAX(updated_at) FROM afl.ai_player_summaries)           AS last_player_ai_update,
  (SELECT MAX(updated_at) FROM afl.ai_team_summaries)             AS last_team_ai_update,
  (SELECT COUNT(DISTINCT player_id) FROM afl.ai_player_summaries) AS unique_players_with_ai,
  (SELECT COUNT(DISTINCT team) FROM afl.ai_team_summaries)        AS unique_teams_with_ai;

GRANT SELECT ON public.v_ai_generation_health TO anon, authenticated;

-- ─── 5. Start/Sit Cache Health ────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_start_sit_cache_health AS
SELECT
  COUNT(*)                                                         AS cache_rows,
  MAX(updated_at)                                                  AS last_cache_update,
  MIN(updated_at)                                                  AS oldest_cache_entry,
  COUNT(*) FILTER (WHERE updated_at < now() - interval '24 hours') AS stale_rows,
  COUNT(DISTINCT season)                                           AS seasons_cached,
  COUNT(DISTINCT round_number)                                     AS rounds_cached
FROM public.start_sit_cache;

GRANT SELECT ON public.v_start_sit_cache_health TO anon, authenticated;

-- ─── 6. Data Integrity Checks ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_data_integrity_checks AS
SELECT
  (SELECT COUNT(*) FROM public.v_rankings_master
   WHERE projection_final IS NULL)                                 AS players_missing_projection,

  (SELECT COUNT(*) FROM public.v_rankings_master
   WHERE neeko_rating IS NULL)                                     AS players_missing_neeko_rating,

  (SELECT COUNT(*) FROM public.v_rankings_master
   WHERE ceiling_estimate IS NULL)                                 AS players_missing_ceiling,

  (SELECT COUNT(*) FROM public.v_rankings_master
   WHERE floor_estimate IS NULL)                                   AS players_missing_floor,

  (SELECT COUNT(*) FROM public.v_rankings_master
   WHERE ai_recommendation IS NULL OR ai_recommendation = '')     AS players_missing_ai_reco,

  (SELECT COUNT(*) FROM afl.player_volatility_model
   WHERE boom_probability IS NULL)                                 AS players_missing_volatility,

  (SELECT COUNT(*) FROM afl.player_volatility_model)              AS total_volatility_rows,

  (SELECT MAX(updated_at) FROM afl.player_volatility_model)       AS last_volatility_refresh;

GRANT SELECT ON public.v_data_integrity_checks TO anon, authenticated;
