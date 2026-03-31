/*
  # Pipeline Health Check View (v2 — fresh create after drop)

  A single diagnostic view exposing the health of every pipeline stage.

  ## Columns
  - Ingestion: last_ingest_at, hours_since_ingest, total_raw_stat_rows, games_missing_stats
  - Normalization: normalized_games, total_player_game_rows, last_game_date
  - Projection: players_with_projection, last_projection_at, hours_since_projection
  - Cache: total_cached, last_cache_at, hours_since_cache
  - Recommendations: rec_buy, rec_hold, rec_sell, rec_total, recommendation_flat
  - Matchup: matchup_elite, matchup_favourable, matchup_neutral, matchup_tough, matchup_flat
  - AI: players_with_ai_text, players_missing_ai_text, players_needing_regen, hours_since_ai_update
  - Pipeline: last_pipeline_status, last_pipeline_tasks_completed/total, duration
  - Overall: health_status (HEALTHY / WARN / DEGRADED with reason)

  ## Security
  No RLS needed — view only exposes aggregate counts, no PII.
*/

CREATE VIEW public.v_pipeline_health_check AS
WITH
ingest_freshness AS (
  SELECT
    MAX(rps.updated_at)                                           AS last_ingest_at,
    EXTRACT(EPOCH FROM (now() - MAX(rps.updated_at))) / 3600     AS hours_since_ingest,
    COUNT(*)                                                      AS total_raw_stat_rows
  FROM afl.raw_player_stats rps
  WHERE rps.season = 2026
),
ingest_gaps AS (
  SELECT COUNT(*) AS games_missing_stats
  FROM afl.games_raw g
  WHERE g.status_short = 'FT'
    AND g.season = 2026
    AND NOT EXISTS (SELECT 1 FROM afl.raw_player_stats r WHERE r.game_id = g.game_id)
),
player_games_freshness AS (
  SELECT
    COUNT(DISTINCT pg.game_id) AS normalized_games,
    COUNT(*)                   AS total_player_game_rows,
    MAX(g.game_date)           AS last_game_date
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  WHERE g.season = 2026
),
projection_freshness AS (
  SELECT
    COUNT(*)                                                   AS players_with_projection,
    MAX(pp.generated_at)                                       AS last_projection_at,
    EXTRACT(EPOCH FROM (now() - MAX(pp.generated_at))) / 3600  AS hours_since_projection
  FROM afl.player_projection pp
),
cache_freshness AS (
  SELECT
    COUNT(*)                                                    AS total_cached,
    MAX(prc.cached_at)                                          AS last_cache_at,
    EXTRACT(EPOCH FROM (now() - MAX(prc.cached_at))) / 3600     AS hours_since_cache
  FROM afl.player_rankings_cache prc
),
rec_dist AS (
  SELECT
    COUNT(*) FILTER (WHERE prc.ai_recommendation = 'BUY')  AS rec_buy,
    COUNT(*) FILTER (WHERE prc.ai_recommendation = 'HOLD') AS rec_hold,
    COUNT(*) FILTER (WHERE prc.ai_recommendation = 'SELL') AS rec_sell,
    COUNT(*)                                               AS rec_total,
    CASE
      WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE prc.ai_recommendation = 'SELL') THEN true
      WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE prc.ai_recommendation = 'HOLD') THEN true
      WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE prc.ai_recommendation = 'BUY')  THEN true
      ELSE false
    END AS recommendation_flat
  FROM afl.player_rankings_cache prc
),
matchup_dist AS (
  SELECT
    COUNT(*) FILTER (WHERE prc.matchup_rating = 'ELITE')      AS matchup_elite,
    COUNT(*) FILTER (WHERE prc.matchup_rating = 'FAVOURABLE') AS matchup_favourable,
    COUNT(*) FILTER (WHERE prc.matchup_rating = 'NEUTRAL')    AS matchup_neutral,
    COUNT(*) FILTER (WHERE prc.matchup_rating = 'TOUGH')      AS matchup_tough,
    CASE
      WHEN COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE prc.matchup_rating = 'TOUGH') THEN true
      ELSE false
    END AS matchup_flat
  FROM afl.player_rankings_cache prc
),
ai_coverage AS (
  SELECT
    COUNT(*)                                                      AS total_players_in_cache,
    COUNT(prc.ai_summary)                                         AS players_with_ai_text,
    COUNT(*) - COUNT(prc.ai_summary)                              AS players_missing_ai_text,
    COUNT(*) FILTER (WHERE vai.needs_regen = true)                AS players_needing_regen,
    MAX(prc.ai_updated_at)                                        AS last_ai_generated_at,
    EXTRACT(EPOCH FROM (now() - MAX(prc.ai_updated_at))) / 3600   AS hours_since_ai_update
  FROM afl.player_rankings_cache prc
  LEFT JOIN public.v_ai_player_analysis_input vai ON vai.player_id = prc.player_id
),
last_run AS (
  SELECT
    pr.status,
    pr.started_at,
    pr.finished_at,
    pr.completed_tasks,
    pr.total_tasks,
    EXTRACT(EPOCH FROM (pr.finished_at - pr.started_at)) AS duration_seconds
  FROM public.pipeline_runs pr
  WHERE pr.pipeline_key = 'neeko_full'
  ORDER BY pr.started_at DESC
  LIMIT 1
)
SELECT
  i.last_ingest_at,
  round(i.hours_since_ingest::numeric, 1)              AS hours_since_ingest,
  i.total_raw_stat_rows,
  g.games_missing_stats,
  pgf.normalized_games,
  pgf.total_player_game_rows,
  pgf.last_game_date,
  pf.players_with_projection,
  pf.last_projection_at,
  round(pf.hours_since_projection::numeric, 1)         AS hours_since_projection,
  cf.total_cached,
  cf.last_cache_at,
  round(cf.hours_since_cache::numeric, 1)              AS hours_since_cache,
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
  round(ac.hours_since_ai_update::numeric, 1)          AS hours_since_ai_update,
  lr.status                                            AS last_pipeline_status,
  lr.started_at                                        AS last_pipeline_started_at,
  lr.completed_tasks                                   AS last_pipeline_tasks_completed,
  lr.total_tasks                                       AS last_pipeline_tasks_total,
  round(lr.duration_seconds::numeric, 0)               AS last_pipeline_duration_seconds,
  CASE
    WHEN g.games_missing_stats > 0
      THEN 'DEGRADED: ' || g.games_missing_stats || ' FT games missing stats'
    WHEN rd.recommendation_flat
      THEN 'DEGRADED: recommendation distribution is flat'
    WHEN md.matchup_flat
      THEN 'DEGRADED: matchup distribution is flat (all TOUGH)'
    WHEN ac.players_needing_regen > 50
      THEN 'WARN: ' || ac.players_needing_regen || ' players need AI regen'
    WHEN round(cf.hours_since_cache::numeric, 1) > 25
      THEN 'WARN: cache is >25h stale'
    ELSE 'HEALTHY'
  END AS health_status
FROM ingest_freshness       i
CROSS JOIN ingest_gaps       g
CROSS JOIN player_games_freshness pgf
CROSS JOIN projection_freshness   pf
CROSS JOIN cache_freshness        cf
CROSS JOIN rec_dist               rd
CROSS JOIN matchup_dist           md
CROSS JOIN ai_coverage            ac
LEFT  JOIN last_run               lr ON true;

GRANT SELECT ON public.v_pipeline_health_check TO authenticated;
GRANT SELECT ON public.v_pipeline_health_check TO anon;
