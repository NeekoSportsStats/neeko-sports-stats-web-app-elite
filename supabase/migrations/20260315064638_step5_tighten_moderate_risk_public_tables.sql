/*
  # Step 5 — Tighten moderate-risk public tables and enable RLS on unprotected ones

  ## Problem
  Several public tables had no RLS enabled or had overly broad access.
  These tables contain internal AI pipeline data, prompt configs, and
  staging/import tables that should not be publicly accessible.

  ## Tables addressed

  ### Enable RLS (currently unprotected)
  - public.ai_pipeline_runs       — pipeline execution history (internal)
  - public.ai_player_content      — AI content staging (internal)
  - public.ai_player_runs         — AI generation run log (internal)
  - public.ai_prompts_v2          — AI prompt templates (internal)
  - public.ai_team_summaries      — AI team summaries (kept auth-readable for product)
  - public.ingest_debug           — debug log (internal)
  - public.ingest_items           — ingest staging (internal)
  - public.ingest_runs            — ingest run records (internal)
  - public.players_changed        — player change tracking (internal)

  ### Access patterns
  - ai_pipeline_runs: admin read + service_role write
  - ai_player_content: admin read + service_role write
  - ai_player_runs: admin read + service_role write
  - ai_prompts_v2: service_role only (prompt templates = backend config)
  - ai_team_summaries: authenticated read (used in teams product page) + service_role write
  - ingest_debug: service_role only
  - ingest_items: service_role only
  - ingest_runs: service_role only (admin read is fine too)
  - players_changed: service_role only (pipeline internal)

  ### app_config — already has deny-all policy, just add service_role
  ### ai_player_analysis_input_cache — already has anon+auth read, add service_role write
*/

-- ============================================================
-- ai_pipeline_runs — admin read + service_role
-- ============================================================
ALTER TABLE public.ai_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_pipeline_runs"
  ON public.ai_pipeline_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ai_pipeline_runs"
  ON public.ai_pipeline_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai_player_content — admin read + service_role write
-- ============================================================
ALTER TABLE public.ai_player_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_player_content"
  ON public.ai_player_content FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ai_player_content"
  ON public.ai_player_content FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai_player_runs — admin read + service_role
-- ============================================================
ALTER TABLE public.ai_player_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_player_runs"
  ON public.ai_player_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ai_player_runs"
  ON public.ai_player_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai_prompts_v2 — service_role only (prompt templates = backend config)
-- ============================================================
ALTER TABLE public.ai_prompts_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to ai_prompts_v2"
  ON public.ai_prompts_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai_team_summaries — authenticated read (product pages) + service_role write
-- ============================================================
ALTER TABLE public.ai_team_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read ai_team_summaries"
  ON public.ai_team_summaries FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read ai_team_summaries"
  ON public.ai_team_summaries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to ai_team_summaries"
  ON public.ai_team_summaries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ingest_debug — service_role only + admin read
-- ============================================================
ALTER TABLE public.ingest_debug ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ingest_debug"
  ON public.ingest_debug FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ingest_debug"
  ON public.ingest_debug FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ingest_items — service_role only + admin read
-- ============================================================
ALTER TABLE public.ingest_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ingest_items"
  ON public.ingest_items FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ingest_items"
  ON public.ingest_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ingest_runs — service_role only + admin read
-- ============================================================
ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ingest_runs"
  ON public.ingest_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to ingest_runs"
  ON public.ingest_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- players_changed — service_role only (pipeline change tracking)
-- ============================================================
ALTER TABLE public.players_changed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to players_changed"
  ON public.players_changed FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- app_config — already has deny-all; add explicit service_role access
-- ============================================================
CREATE POLICY "Service role full access to app_config"
  ON public.app_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai_player_analysis_input_cache — already has read policies; add service_role write
-- ============================================================
CREATE POLICY "Service role can insert ai_player_analysis_input_cache"
  ON public.ai_player_analysis_input_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update ai_player_analysis_input_cache"
  ON public.ai_player_analysis_input_cache FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete ai_player_analysis_input_cache"
  ON public.ai_player_analysis_input_cache FOR DELETE
  TO service_role
  USING (true);
