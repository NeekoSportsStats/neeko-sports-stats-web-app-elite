/*
  # Create v_pipeline_status View

  ## Purpose
  A single-row aggregate view that gives the admin a full snapshot of the AFL
  data pipeline health at a glance. Used by the Data Pipeline Status dashboard.

  ## Columns
  - last_raw_ingest          — Most recent ingested_at timestamp in raw_2026_player_stats
  - raw_player_rows          — Total rows in raw_2026_player_stats
  - latest_round             — Highest round_number present in raw stats
  - projection_rows          — Player count in v_neeko_player_projection_final
  - last_ai_player_gen       — Most recent last_updated in afl.ai_player_summaries
  - ai_player_rows           — Total rows in afl.ai_player_summaries
  - ai_player_with_summary   — Rows that have a non-null ai_summary
  - last_ranking_ai          — Most recent updated_at in ai_rankings_player_recos
  - ranking_ai_rows          — Total rows in ai_rankings_player_recos
  - last_pipeline_run        — Most recent started_at for any weekly_pipeline run
  - last_pipeline_status     — Status of that most recent run
  - last_pipeline_finished   — finished_at of that most recent run
  - ai_analysis_rows         — Rows in public.ai_player_analysis
  - last_ai_analysis_gen     — Most recent generated_at in public.ai_player_analysis

  ## Security
  - SECURITY DEFINER so the anon role can read aggregates without touching raw tables
  - Owner postgres for full access to afl schema
*/

CREATE OR REPLACE VIEW public.v_pipeline_status
WITH (security_invoker = false)
AS
SELECT
  (
    SELECT MAX(ingested_at)
    FROM afl.raw_2026_player_stats
  ) AS last_raw_ingest,

  (
    SELECT COUNT(*)::int
    FROM afl.raw_2026_player_stats
  ) AS raw_player_rows,

  (
    SELECT MAX(round_number)
    FROM afl.raw_2026_player_stats
  ) AS latest_round,

  (
    SELECT COUNT(*)::int
    FROM afl.v_neeko_player_projection_final
  ) AS projection_rows,

  (
    SELECT MAX(last_updated)
    FROM afl.ai_player_summaries
  ) AS last_ai_player_gen,

  (
    SELECT COUNT(*)::int
    FROM afl.ai_player_summaries
  ) AS ai_player_rows,

  (
    SELECT COUNT(*)::int
    FROM afl.ai_player_summaries
    WHERE ai_summary IS NOT NULL AND ai_summary <> ''
  ) AS ai_player_with_summary,

  (
    SELECT MAX(updated_at)
    FROM public.ai_rankings_player_recos
  ) AS last_ranking_ai,

  (
    SELECT COUNT(*)::int
    FROM public.ai_rankings_player_recos
  ) AS ranking_ai_rows,

  (
    SELECT started_at
    FROM public.pipeline_runs
    WHERE pipeline_key = 'weekly_pipeline'
    ORDER BY started_at DESC
    LIMIT 1
  ) AS last_pipeline_run,

  (
    SELECT status
    FROM public.pipeline_runs
    WHERE pipeline_key = 'weekly_pipeline'
    ORDER BY started_at DESC
    LIMIT 1
  ) AS last_pipeline_status,

  (
    SELECT finished_at
    FROM public.pipeline_runs
    WHERE pipeline_key = 'weekly_pipeline'
    ORDER BY started_at DESC
    LIMIT 1
  ) AS last_pipeline_finished,

  (
    SELECT COUNT(*)::int
    FROM public.ai_player_analysis
  ) AS ai_analysis_rows,

  (
    SELECT MAX(generated_at)
    FROM public.ai_player_analysis
  ) AS last_ai_analysis_gen;

GRANT SELECT ON public.v_pipeline_status TO authenticated;
