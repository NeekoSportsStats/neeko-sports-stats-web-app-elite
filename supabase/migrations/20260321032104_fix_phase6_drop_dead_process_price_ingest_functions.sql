/*
  # Phase 6: Drop Dead process_price_ingest_by_id Functions

  ## Finding
  Three functions are confirmed dead -- no active cron, SQL function, edge function,
  or frontend code calls them:

  - public.process_price_ingest_by_id(jsonb)       -- diverged duplicate, called by nothing
  - public.process_price_ingest_by_id_public(jsonb) -- thin wrapper over afl version, called by nothing
  - afl.process_price_ingest_by_id(jsonb)           -- original, superseded by afl.commit_price_round()

  The active price ingest path is:
    admin-command -> commit_price_round RPC -> afl.commit_price_round() -> afl.player_prices directly

  ## Kept (active public wrappers -- all called by admin-command edge function)
  - public.apply_fantasy_prices
  - public.commit_price_round
  - public.fn_apply_market_watch_categories
  - public.fn_rebuild_confidence_scores
  - public.refresh_player_rankings_cache

  ## Action
  Drop the three dead process_price_ingest_by_id functions.
  No data is affected. No active flow is broken.
*/

DROP FUNCTION IF EXISTS public.process_price_ingest_by_id(jsonb);
DROP FUNCTION IF EXISTS public.process_price_ingest_by_id_public(jsonb);
DROP FUNCTION IF EXISTS afl.process_price_ingest_by_id(jsonb);
