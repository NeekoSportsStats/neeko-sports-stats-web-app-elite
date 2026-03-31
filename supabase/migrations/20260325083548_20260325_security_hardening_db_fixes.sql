/*
  # Security Hardening — DB Fixes (C-002, C-003, H-001 through H-008)

  ## Summary
  Applies all database-level security fixes identified in the full security audit.

  ## Changes

  ### CRITICAL
  - C-002: Add service_role policies to internal.cron_secrets and internal.cron_config
           (RLS was enabled but zero policies existed — all access was blocked)
  - C-003: Replace open pipeline_logs policy (USING(true) for authenticated) with admin-only

  ### HIGH
  - H-001: Fix admin.snapshots — drop open authenticated policy, add service_role + admin-only
  - H-002: Drop anon INSERT policy on start_sit_decisions
  - H-003: Drop duplicate service_role policy on system_state
  - H-004: Drop duplicate service_role policy on afl.player_prices
  - H-005: Drop duplicate service_role policy on start_sit_decisions
  - H-006: Add service_role write policies to afl.player_signals + afl.player_signal_summary
  - H-007: Fix weekly_plans_cache service_role policy from SELECT-only to ALL
  - H-008: Fix ai_rankings_player_recos — drop misnamed authenticated policy, add proper service_role
*/

-- ============================================================
-- C-002: internal.cron_secrets + internal.cron_config policies
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'internal' AND tablename = 'cron_secrets' AND policyname = 'Service role only'
  ) THEN
    CREATE POLICY "Service role only"
      ON internal.cron_secrets
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'internal' AND tablename = 'cron_config' AND policyname = 'Service role only'
  ) THEN
    CREATE POLICY "Service role only"
      ON internal.cron_config
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- C-003: admin.pipeline_logs — restrict to admins only
-- ============================================================

DROP POLICY IF EXISTS "authenticated can read pipeline logs" ON admin.pipeline_logs;
DROP POLICY IF EXISTS "Admins can read pipeline logs" ON admin.pipeline_logs;

CREATE POLICY "Admins can read pipeline logs"
  ON admin.pipeline_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================
-- H-001: admin.snapshots — fix open authenticated read access
-- ============================================================

DROP POLICY IF EXISTS "service role full access on snapshots" ON admin.snapshots;
DROP POLICY IF EXISTS "Service role full access on snapshots" ON admin.snapshots;
DROP POLICY IF EXISTS "admin-only" ON admin.snapshots;
DROP POLICY IF EXISTS "Admins can read snapshots" ON admin.snapshots;

CREATE POLICY "Service role full access on snapshots"
  ON admin.snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read snapshots"
  ON admin.snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================
-- H-002: Drop anon INSERT on start_sit_decisions
-- ============================================================

DROP POLICY IF EXISTS "Anyone can insert start_sit decisions" ON public.start_sit_decisions;

-- ============================================================
-- H-003: Drop duplicate service_role policy on system_state
-- ============================================================

DROP POLICY IF EXISTS "Service role can manage system state" ON public.system_state;

-- ============================================================
-- H-004: Drop duplicate service_role policy on afl.player_prices
-- ============================================================

DROP POLICY IF EXISTS "Service role full player_prices" ON afl.player_prices;

-- ============================================================
-- H-005: Drop duplicate service_role policy on start_sit_decisions
-- ============================================================

DROP POLICY IF EXISTS "Service role manages start sit decisions" ON public.start_sit_decisions;

-- ============================================================
-- H-006: Add service_role write policies for signal tables
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'player_signals'
    AND policyname = 'Service role full access to player_signals'
  ) THEN
    CREATE POLICY "Service role full access to player_signals"
      ON afl.player_signals
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'player_signal_summary'
    AND policyname = 'Service role full access to player_signal_summary'
  ) THEN
    CREATE POLICY "Service role full access to player_signal_summary"
      ON afl.player_signal_summary
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- H-007: Fix weekly_plans_cache — upgrade SELECT-only to ALL
-- ============================================================

DROP POLICY IF EXISTS "Service role full access weekly plans cache" ON public.weekly_plans_cache;

CREATE POLICY "Service role full access weekly plans cache"
  ON public.weekly_plans_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- H-008: Fix ai_rankings_player_recos — misnamed policy fix
-- ============================================================

DROP POLICY IF EXISTS "Service role full access" ON public.ai_rankings_player_recos;

CREATE POLICY "Service role full access"
  ON public.ai_rankings_player_recos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
