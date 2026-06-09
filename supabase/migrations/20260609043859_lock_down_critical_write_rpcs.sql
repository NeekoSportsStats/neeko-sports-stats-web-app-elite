-- Revoke PUBLIC and anon EXECUTE from dangerous SECURITY DEFINER write RPCs.
-- Uses pg_proc to resolve exact overloaded signatures before issuing REVOKE.
-- Also applies ALTER DEFAULT PRIVILEGES to prevent future functions from
-- being implicitly executable by PUBLIC/anon.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'run_afl_pipeline_controller_internal',
        'fn_run_pipeline_safe',
        'fn_run_ai_regen_all_waves',
        'run_ai_worker_batch',
        'set_price_round_lock',
        'commit_price_round_with_session',
        'apply_fantasy_prices',
        'trigger_post_price_pipeline',
        'sync_stripe_subscriptions_to_access',
        'fn_sync_subscription_to_profile',
        'sync_customer_to_profile',
        'fn_reset_stuck_ai_queue_jobs',
        'fn_retry_failed_pipeline',
        'apply_ai_recos_to_rankings_cache',
        'refresh_player_rankings_cache',
        'refresh_rankings_and_market_watch',
        'fn_rebuild_confidence_scores',
        'fn_backfill_raw_fantasy_points_rpc',
        'snapshot_player_projections_for_next_round',
        'upsert_marketing_post_workflow',
        'update_marketing_post_status',
        'neeko_try_advisory_lock',
        'neeko_advisory_unlock',
        'handle_stripe_event',
        'save_player_name_mapping'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      r.nspname, r.proname, r.args
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Prevent future functions in the public schema from being silently
-- executable by PUBLIC or anon due to Postgres default EXECUTE grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
