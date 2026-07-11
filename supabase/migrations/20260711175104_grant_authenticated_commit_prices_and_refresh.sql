-- Grant authenticated callers execute on the wrapper.
-- Security unchanged: wrapper delegates to commit_price_round and
-- backfill_prices_from_paste, both of which carry is_admin_user() guards.
GRANT EXECUTE ON FUNCTION public.commit_prices_and_refresh(text, jsonb, integer, integer, integer, integer) TO authenticated;
