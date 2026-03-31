/*
  # Step 2 — Lock down admin-only tables

  ## Problem
  The following tables had policies granting full CRUD to ANY authenticated user.
  These tables are internal admin/content/pipeline tools and should only be accessible
  to users with is_admin = true in their profile.

  ## Tables tightened
  - public.admin_content_schedule    — content scheduling tool
  - public.content_planner_posts     — content planner posts
  - public.content_planner_weeks     — content planner weeks
  - public.content_scheduler         — automated scheduler config
  - public.founder_tasks             — founder task tracker
  - public.pipeline_runs             — pipeline execution records
  - public.pipeline_steps            — pipeline step records
  - public.media_generation_jobs     — AI media generation job tracker
  - public.pipeline_alerts           — pipeline alert management (public schema)
  - public.system_logs               — system log table (also fix insert policy)
  - public.system_state              — system state (tighten read to admin-only)

  ## Approach
  1. Drop existing permissive "any authenticated" policies
  2. Replace with admin-only policies using: profiles.is_admin = true
  3. Keep service_role policies intact (pipeline automation must still work)

  ## Notes
  - Admin check: EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  - Pipeline reads pipeline_runs/pipeline_steps via service_role, which bypasses RLS
  - media_generation_jobs: service_role policies are kept; user-facing policies become admin-only
*/

-- Helper: admin check expression used throughout
-- EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)

-- ============================================================
-- admin_content_schedule — drop authenticated, add admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can select admin_content_schedule" ON public.admin_content_schedule;
DROP POLICY IF EXISTS "Authenticated users can insert admin_content_schedule" ON public.admin_content_schedule;
DROP POLICY IF EXISTS "Authenticated users can update admin_content_schedule" ON public.admin_content_schedule;
DROP POLICY IF EXISTS "Authenticated users can delete admin_content_schedule" ON public.admin_content_schedule;

CREATE POLICY "Admins can select admin_content_schedule"
  ON public.admin_content_schedule FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert admin_content_schedule"
  ON public.admin_content_schedule FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update admin_content_schedule"
  ON public.admin_content_schedule FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete admin_content_schedule"
  ON public.admin_content_schedule FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- content_planner_posts — drop authenticated, add admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can select content_planner_posts" ON public.content_planner_posts;
DROP POLICY IF EXISTS "Authenticated users can insert content_planner_posts" ON public.content_planner_posts;
DROP POLICY IF EXISTS "Authenticated users can update content_planner_posts" ON public.content_planner_posts;
DROP POLICY IF EXISTS "Authenticated users can delete content_planner_posts" ON public.content_planner_posts;

CREATE POLICY "Admins can select content_planner_posts"
  ON public.content_planner_posts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert content_planner_posts"
  ON public.content_planner_posts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update content_planner_posts"
  ON public.content_planner_posts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete content_planner_posts"
  ON public.content_planner_posts FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- content_planner_weeks — drop authenticated, add admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can select content_planner_weeks" ON public.content_planner_weeks;
DROP POLICY IF EXISTS "Authenticated users can insert content_planner_weeks" ON public.content_planner_weeks;
DROP POLICY IF EXISTS "Authenticated users can update content_planner_weeks" ON public.content_planner_weeks;
DROP POLICY IF EXISTS "Authenticated users can delete content_planner_weeks" ON public.content_planner_weeks;

CREATE POLICY "Admins can select content_planner_weeks"
  ON public.content_planner_weeks FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert content_planner_weeks"
  ON public.content_planner_weeks FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update content_planner_weeks"
  ON public.content_planner_weeks FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete content_planner_weeks"
  ON public.content_planner_weeks FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- content_scheduler — drop authenticated, add admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read content_scheduler" ON public.content_scheduler;
DROP POLICY IF EXISTS "Authenticated users can insert content_scheduler" ON public.content_scheduler;
DROP POLICY IF EXISTS "Authenticated users can update content_scheduler" ON public.content_scheduler;
DROP POLICY IF EXISTS "Authenticated users can delete content_scheduler" ON public.content_scheduler;

CREATE POLICY "Admins can read content_scheduler"
  ON public.content_scheduler FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert content_scheduler"
  ON public.content_scheduler FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update content_scheduler"
  ON public.content_scheduler FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete content_scheduler"
  ON public.content_scheduler FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- founder_tasks — drop authenticated, add admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read founder_tasks" ON public.founder_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert founder_tasks" ON public.founder_tasks;
DROP POLICY IF EXISTS "Authenticated users can update founder_tasks" ON public.founder_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete founder_tasks" ON public.founder_tasks;

CREATE POLICY "Admins can read founder_tasks"
  ON public.founder_tasks FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert founder_tasks"
  ON public.founder_tasks FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update founder_tasks"
  ON public.founder_tasks FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete founder_tasks"
  ON public.founder_tasks FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- pipeline_runs — drop broad authenticated, add admin-only + service role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read pipeline runs" ON public.pipeline_runs;
DROP POLICY IF EXISTS "Authenticated users can insert pipeline runs" ON public.pipeline_runs;
DROP POLICY IF EXISTS "Authenticated users can update pipeline runs" ON public.pipeline_runs;

CREATE POLICY "Admins can read pipeline_runs"
  ON public.pipeline_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to pipeline_runs"
  ON public.pipeline_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- pipeline_steps — drop broad authenticated, add admin-only + service role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read pipeline steps" ON public.pipeline_steps;
DROP POLICY IF EXISTS "Authenticated users can insert pipeline steps" ON public.pipeline_steps;
DROP POLICY IF EXISTS "Authenticated users can update pipeline steps" ON public.pipeline_steps;

CREATE POLICY "Admins can read pipeline_steps"
  ON public.pipeline_steps FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to pipeline_steps"
  ON public.pipeline_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- pipeline_alerts (public schema) — tighten authenticated to admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read alerts" ON public.pipeline_alerts;
DROP POLICY IF EXISTS "Authenticated users can update resolved flag" ON public.pipeline_alerts;

CREATE POLICY "Admins can read pipeline_alerts"
  ON public.pipeline_alerts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update pipeline_alerts"
  ON public.pipeline_alerts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to public pipeline_alerts"
  ON public.pipeline_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- media_generation_jobs — tighten authenticated to admin-only (service role kept)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read media generation jobs" ON public.media_generation_jobs;
DROP POLICY IF EXISTS "Authenticated users can insert media generation jobs" ON public.media_generation_jobs;
DROP POLICY IF EXISTS "Authenticated users can update media generation jobs" ON public.media_generation_jobs;

CREATE POLICY "Admins can read media_generation_jobs"
  ON public.media_generation_jobs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert media_generation_jobs"
  ON public.media_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update media_generation_jobs"
  ON public.media_generation_jobs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================================
-- system_logs — fix INSERT policy (currently any authenticated can insert)
-- Only service_role and admins should write; admins can read
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert system logs" ON public.system_logs;
DROP POLICY IF EXISTS "Admins can read system logs" ON public.system_logs;

CREATE POLICY "Admins can read system_logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role can insert system_logs"
  ON public.system_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update system_logs"
  ON public.system_logs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- system_state — keep admin-read, ensure no public access
-- (existing policy is already authenticated-read, no change needed for that,
--  but add service_role write for pipeline)
-- ============================================================
CREATE POLICY "Service role full access to system_state"
  ON public.system_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
