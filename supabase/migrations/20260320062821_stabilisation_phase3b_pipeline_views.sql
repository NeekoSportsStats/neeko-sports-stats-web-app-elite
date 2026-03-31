
/*
  # Phase 3b: Pipeline views after drop of old v_pipeline_run_detail

  Recreates v_pipeline_run_detail with snapshot linkage.
  Creates admin.v_pipeline_logs_recent for the Health page Logs tab.
*/

-- Functions created in previous migration (phase3) — just create views here

-- Recent pipeline logs for Health → Logs tab
CREATE OR REPLACE VIEW admin.v_pipeline_logs_recent AS
SELECT
  l.id,
  l.run_id,
  l.step,
  l.status,
  l.started_at,
  l.finished_at,
  l.duration_ms,
  l.error,
  l.metadata,
  pr.pipeline_key,
  pr.label AS run_label,
  pr.status AS run_status
FROM admin.pipeline_logs l
LEFT JOIN public.pipeline_runs pr ON pr.id = l.run_id
ORDER BY l.started_at DESC;

-- Improved pipeline run detail with snapshot linkage
CREATE OR REPLACE VIEW public.v_pipeline_run_detail AS
SELECT
  pr.id          AS run_id,
  pr.pipeline_key,
  pr.label,
  pr.status,
  pr.started_at,
  pr.finished_at,
  pr.duration_ms,
  (SELECT COUNT(*) FROM public.pipeline_steps ps WHERE ps.run_id = pr.id)                            AS total_steps,
  (SELECT COUNT(*) FROM public.pipeline_steps ps WHERE ps.run_id = pr.id AND ps.status = 'success')  AS success_steps,
  (SELECT COUNT(*) FROM public.pipeline_steps ps WHERE ps.run_id = pr.id AND ps.status = 'failed')   AS failed_steps,
  s.snapshot_id,
  s.validation_status AS snapshot_status,
  s.rankings_count    AS snapshot_rankings_count
FROM public.pipeline_runs pr
LEFT JOIN admin.snapshots s ON s.source_run_id = pr.id
ORDER BY pr.started_at DESC;
