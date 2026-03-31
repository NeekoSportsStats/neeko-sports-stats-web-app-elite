
/*
  # Phase 5b: AI snapshot alignment views (after drop of conflicting views)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_player_analysis'
      AND column_name = 'snapshot_id'
  ) THEN
    ALTER TABLE public.ai_player_analysis
      ADD COLUMN snapshot_id uuid REFERENCES admin.snapshots(snapshot_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_player_analysis_snapshot
  ON public.ai_player_analysis(snapshot_id);

CREATE OR REPLACE VIEW public.v_ai_snapshot_staleness AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.ai_updated_at,
  r.cached_at AS rankings_cached_at,
  r.pipeline_snapshot_id,
  CASE
    WHEN r.ai_updated_at IS NULL                              THEN true
    WHEN r.ai_updated_at < r.cached_at - INTERVAL '1 hour'   THEN true
    ELSE false
  END AS is_stale
FROM afl.player_rankings_cache r;

CREATE OR REPLACE VIEW public.v_ai_coverage_summary AS
SELECT
  COUNT(*)                                                                     AS total_players,
  COUNT(*) FILTER (WHERE recommendation_short IS NOT NULL AND recommendation_short <> '') AS with_reco_short,
  COUNT(*) FILTER (WHERE ai_summary IS NOT NULL AND ai_summary <> '')         AS with_summary,
  COUNT(*) FILTER (WHERE ai_updated_at IS NOT NULL)                           AS with_ai,
  COUNT(*) FILTER (WHERE ai_updated_at IS NULL)                               AS missing_ai,
  COUNT(*) FILTER (WHERE ai_updated_at < cached_at - INTERVAL '1 hour')      AS stale_ai,
  MAX(ai_updated_at)                                                          AS last_ai_update,
  MAX(cached_at)                                                              AS last_rankings_update,
  ROUND(
    COUNT(*) FILTER (WHERE recommendation_short IS NOT NULL AND recommendation_short <> '')::numeric
    / NULLIF(COUNT(*), 0) * 100,
  1) AS reco_coverage_pct
FROM afl.player_rankings_cache;

GRANT SELECT ON public.v_ai_snapshot_staleness TO authenticated;
GRANT SELECT ON public.v_ai_coverage_summary TO authenticated;
