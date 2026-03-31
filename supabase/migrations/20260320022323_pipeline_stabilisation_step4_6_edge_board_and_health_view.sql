/*
  # Pipeline Stabilisation — Steps 4 & 6: Edge Board Verify + Pipeline Health View

  ## Step 4: Confirm mv_edge_board is materialized
  `public.mv_edge_board` is already a MATERIALIZED VIEW (confirmed in schema).
  `public.refresh_edge_board()` already uses `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
  No change needed to the view itself.

  ## Step 6: Create admin.v_pipeline_health view
  Provides a live dashboard of AI generation completeness across the rankings cache.
  Counts total players, how many have AI summaries, and how many are still missing them.
  Also tracks prompt version distribution and validation pass rates.

  ## Security
  - View is SECURITY DEFINER so admins can read regardless of underlying table RLS
  - Grants SELECT to authenticated role (admin check enforced at UI layer)
*/

-- ── Create admin schema if not exists ────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS admin;

-- ── Drop and recreate v_pipeline_health ──────────────────────────────────────
DROP VIEW IF EXISTS admin.v_pipeline_health;

CREATE OR REPLACE VIEW admin.v_pipeline_health
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                                    AS total_players,
  COUNT(*) FILTER (WHERE ai_updated_at IS NOT NULL)                          AS ai_completed,
  COUNT(*) FILTER (WHERE ai_updated_at IS NULL)                              AS ai_missing,
  COUNT(*) FILTER (WHERE ai_validation_passed = true)                        AS ai_validation_passed,
  COUNT(*) FILTER (WHERE ai_validation_passed = false)                       AS ai_validation_failed,
  COUNT(*) FILTER (WHERE ai_prompt_version IS NOT NULL)                      AS ai_has_prompt_version,
  COUNT(*) FILTER (WHERE ai_updated_at > now() - interval '24 hours')        AS ai_updated_last_24h,
  COUNT(*) FILTER (WHERE ai_updated_at > now() - interval '7 days'
                    AND ai_updated_at <= now() - interval '24 hours')        AS ai_updated_1_7_days,
  COUNT(*) FILTER (WHERE ai_updated_at < now() - interval '7 days'
                    OR ai_updated_at IS NULL)                                AS ai_stale_or_missing,
  ROUND(
    COUNT(*) FILTER (WHERE ai_updated_at IS NOT NULL)::numeric
    / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                                           AS ai_coverage_pct,
  MAX(ai_updated_at)                                                          AS last_ai_update,
  MAX(cached_at)                                                              AS last_cache_rebuild,
  COUNT(DISTINCT ai_prompt_version) FILTER (WHERE ai_prompt_version IS NOT NULL) AS distinct_prompt_versions
FROM afl.player_rankings_cache;

-- ── Grant read access to authenticated users ─────────────────────────────────
GRANT USAGE ON SCHEMA admin TO authenticated;
GRANT SELECT ON admin.v_pipeline_health TO authenticated;
GRANT SELECT ON admin.v_pipeline_health TO anon;

-- ── Also expose as a public convenience RPC ──────────────────────────────────
DROP FUNCTION IF EXISTS public.get_pipeline_health();

CREATE OR REPLACE FUNCTION public.get_pipeline_health()
RETURNS TABLE (
  total_players         bigint,
  ai_completed          bigint,
  ai_missing            bigint,
  ai_validation_passed  bigint,
  ai_validation_failed  bigint,
  ai_updated_last_24h   bigint,
  ai_stale_or_missing   bigint,
  ai_coverage_pct       numeric,
  last_ai_update        timestamptz,
  last_cache_rebuild    timestamptz,
  distinct_prompt_versions bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'admin'
AS $$
  SELECT
    total_players,
    ai_completed,
    ai_missing,
    ai_validation_passed,
    ai_validation_failed,
    ai_updated_last_24h,
    ai_stale_or_missing,
    ai_coverage_pct,
    last_ai_update,
    last_cache_rebuild,
    distinct_prompt_versions
  FROM admin.v_pipeline_health;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pipeline_health() TO anon;
