
/*
  # Create public.v_pipeline_status view

  ## Problem
  DataPipelineStatusPage.tsx queries public.v_pipeline_status but this view does
  not exist. The page silently shows no data.

  ## Fix
  Create v_pipeline_status returning all fields expected by DataPipelineStatusPage:
  - last_raw_ingest: most recent ingest timestamp from raw_player_stats
  - raw_player_rows: total row count in raw_player_stats
  - latest_round: most recent round/week number
  - projection_rows: count of players with projections (v_neeko_rating)
  - last_ranking_ai: most recent ai_rankings_player_recos updated_at
  - ranking_ai_rows: count of ai_rankings_player_recos
  - last_pipeline_run: most recent pipeline_runs started_at
  - last_pipeline_status: status of most recent pipeline run
  - last_pipeline_finished: most recent pipeline_runs finished_at
  - ai_analysis_rows: count of ai_player_content
  - last_ai_analysis_gen: most recent ai_player_content generated_at

  ## Security
  - SELECT granted to anon and authenticated (admin page does its own auth check)
*/

CREATE OR REPLACE VIEW public.v_pipeline_status AS
WITH raw_stats AS (
  SELECT
    MAX(updated_at)       AS last_raw_ingest,
    COUNT(*)              AS raw_player_rows,
    MAX(week)             AS latest_round
  FROM afl.raw_player_stats
  WHERE season = 2026
),
projections AS (
  SELECT COUNT(*) AS projection_rows
  FROM afl.v_neeko_rating
),
ranking_ai AS (
  SELECT
    MAX(updated_at)  AS last_ranking_ai,
    COUNT(*)         AS ranking_ai_rows
  FROM public.ai_rankings_player_recos
  WHERE season = 2026
),
pipeline AS (
  SELECT
    started_at   AS last_pipeline_run,
    status       AS last_pipeline_status,
    finished_at  AS last_pipeline_finished
  FROM public.pipeline_runs
  ORDER BY started_at DESC
  LIMIT 1
),
ai_analysis AS (
  SELECT
    COUNT(*)         AS ai_analysis_rows,
    MAX(generated_at) AS last_ai_analysis_gen
  FROM public.ai_player_content
)
SELECT
  r.last_raw_ingest,
  r.raw_player_rows::integer,
  r.latest_round::integer,
  p.projection_rows::integer,
  ra.last_ranking_ai,
  ra.ranking_ai_rows::integer,
  pl.last_pipeline_run,
  pl.last_pipeline_status,
  pl.last_pipeline_finished,
  ai.ai_analysis_rows::integer,
  ai.last_ai_analysis_gen
FROM raw_stats r
CROSS JOIN projections p
CROSS JOIN ranking_ai ra
LEFT JOIN pipeline pl ON true
CROSS JOIN ai_analysis ai;

GRANT SELECT ON public.v_pipeline_status TO anon, authenticated;
