/*
  # Final Audit — Revoke anon/authenticated EXECUTE on pipeline and admin functions

  ## Summary
  Security audit confirmed 16+ pipeline/admin SECURITY DEFINER functions are still
  callable by the anon role using only the public anon key. An unauthenticated user
  could trigger full pipeline runs, AI regeneration, and price overwrites via PostgREST.

  ## Action
  - Revoke EXECUTE from anon on all pipeline/admin write functions
  - Revoke EXECUTE from authenticated (non-admin users must go through admin-command edge function)
  - Tighten subscriptions RLS to authenticated role only (was public)
*/

-- Pipeline execution functions
REVOKE EXECUTE ON FUNCTION public.apply_ai_recos_to_rankings_cache() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_fantasy_prices() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_raw_fantasy_points_rpc() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rebuild_confidence_scores() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_reset_stuck_ai_queue_jobs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_retry_failed_pipeline() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_run_pipeline_safe() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_run_post_pipeline_stabilisation(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_afl_pipeline_controller_internal() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_afl_pipeline_controller_internal(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_projection_accuracy_pipeline() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_player_games_from_raw() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_run_gap_heal() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_edge_board() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.populate_mv_edge_board() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_player_rankings_cache() FROM anon, authenticated;

-- Tighten subscriptions RLS from public role to authenticated only
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
  DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.subscriptions;
  DROP POLICY IF EXISTS "Authenticated users can view own subscriptions" ON public.subscriptions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Authenticated users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id OR auth.uid() = user_id);
