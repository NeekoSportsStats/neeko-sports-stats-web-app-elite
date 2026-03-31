/*
  # Step 7 — Lock remaining tables and add service_role policies

  ## Tables addressed

  ### Tables with RLS enabled but missing service_role write policies
  These tables are written by pipeline/edge functions via service_role and need
  explicit policies for when force-row-security is applied or as documentation.

  - afl.ai_generation_queue — already has service_role policy; no change needed
  - afl.ai_player_analysis  — already has service_role + auth read; add anon read
  - afl.player_features     — service_role only (already correct)
  - public.afl_ai_start_sit — already anon+auth read; add explicit service_role write
  - public.ai_generation_logs — service_role only (already correct)
  - public.ai_generation_queue — service_role only (already correct)
  - public.ai_neeko_intel_features — anon+auth read; add service_role write
  - public.ai_neeko_match_intelligence — anon+auth read; add service_role write
  - public.ai_neeko_score_predictions — auth read; add service_role write
  - public.ai_rankings_player_recos — anon+auth read; add service_role write
  - public.ai_player_analysis — auth read; add service_role write
  - public.projection_accuracy — auth read + service_role write (already correct)
  - public.start_sit_cache — already correct
  - public.start_sit_calibration — already correct
  - public.start_sit_results — already correct
  - public.player_round_scores — already correct

  ### Tables that should be internal-only (no public access, confirmed intentional)
  These are already locked by default-deny because RLS is enabled with no matching
  policies for anon/authenticated:
  - public.afl_player_prices_import — service_role only (import staging)
  - public.ai_player_analysis_input_cache — already has read; write added in step 5
  - public.sync_logs — already FORCE RLS with no policies = service_role only
  - public.system_locks — already FORCE RLS = service_role only

  ## Notes
  - market schema tables already have correct auth-read + no write policies
  - afl.player_prices_import already has service_role only policy
*/

-- ============================================================
-- afl.ai_player_analysis — add anon read for product display
-- ============================================================
CREATE POLICY "Anon can read afl ai_player_analysis"
  ON afl.ai_player_analysis FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- public.afl_ai_start_sit — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to afl_ai_start_sit"
  ON public.afl_ai_start_sit FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.ai_neeko_intel_features — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to ai_neeko_intel_features"
  ON public.ai_neeko_intel_features FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.ai_neeko_match_intelligence — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to ai_neeko_match_intelligence"
  ON public.ai_neeko_match_intelligence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.ai_neeko_score_predictions — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to ai_neeko_score_predictions"
  ON public.ai_neeko_score_predictions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.ai_rankings_player_recos — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to ai_rankings_player_recos"
  ON public.ai_rankings_player_recos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.ai_player_analysis — add service_role write
-- ============================================================
CREATE POLICY "Service role full access to public ai_player_analysis"
  ON public.ai_player_analysis FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.stripe_products_config — add service_role write (already anon+auth read)
-- ============================================================
CREATE POLICY "Service role full access to stripe_products_config"
  ON public.stripe_products_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- public.stripe_subscriptions — add service_role write (currently auth-read only)
-- ============================================================
CREATE POLICY "Service role full access to stripe_subscriptions"
  ON public.stripe_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
