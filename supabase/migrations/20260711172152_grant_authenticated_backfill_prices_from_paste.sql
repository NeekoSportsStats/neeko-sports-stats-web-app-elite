-- Grant authenticated callers the ability to reach the function's
-- is_admin_user() guard, matching the commit_price_round precedent.
-- Non-admins will still be rejected inside the function body.
GRANT EXECUTE ON FUNCTION public.backfill_prices_from_paste(jsonb, integer, integer) TO authenticated;
