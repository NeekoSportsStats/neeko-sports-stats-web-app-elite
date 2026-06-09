-- Revoke EXECUTE from authenticated/anon/public on 14 RPCs with no legitimate
-- direct browser callers. All valid paths use admin-command edge function
-- (service_role) or are internal trigger/advisory functions.

-- Trigger functions (RETURNS trigger — uncallable via supabase.rpc() anyway)
REVOKE EXECUTE ON FUNCTION public.fn_sync_subscription_to_profile() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_stripe_event() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_customer_to_profile() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_stripe_subscriptions_to_access() FROM authenticated, anon, public;

-- Called via admin-command edge function (service_role) only
REVOKE EXECUTE ON FUNCTION public.commit_price_round_with_session(
  p_season integer, p_round integer, p_rows jsonb, p_session_id uuid
) FROM authenticated, anon, public;

REVOKE EXECUTE ON FUNCTION public.trigger_post_price_pipeline(
  p_season integer, p_round integer
) FROM authenticated, anon, public;

-- save_player_name_mapping lives in afl schema
REVOKE EXECUTE ON FUNCTION public.save_player_name_mapping(
  p_source_name text, p_player_id integer, p_match_method text
) FROM authenticated, anon, public;

REVOKE EXECUTE ON FUNCTION afl.save_player_name_mapping(
  p_source_name text, p_player_id integer, p_match_method text
) FROM authenticated, anon, public;

-- Internal pipeline / advisory functions
REVOKE EXECUTE ON FUNCTION public.fn_run_ai_regen_all_waves() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.neeko_advisory_unlock(p_key bigint) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.neeko_try_advisory_lock(p_key bigint) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.refresh_rankings_and_market_watch() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.run_ai_worker_batch() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.set_price_round_lock(p_season integer, p_round integer, p_locked boolean) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.snapshot_player_projections_for_next_round() FROM authenticated, anon, public;
