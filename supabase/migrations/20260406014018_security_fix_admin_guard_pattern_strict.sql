/*
  # Security Fix: Strict Admin Guard Pattern

  ## Summary
  Fixes the weak admin guard pattern `IF auth.uid() IS NOT NULL AND NOT is_admin_user()`
  on the `admin_update_fantasy_prices(price_rows jsonb, p_round integer)` overload.

  ## Problem
  The weak pattern allows callers with auth.uid() IS NULL (service_role, cron) through
  without verifying admin status. For pipeline-internal functions called by cron, this
  is acceptable and intentional. But for `admin_update_fantasy_prices`, which accepts
  external input (price rows), it should require an authenticated admin session.

  ## Changes
  - `admin_update_fantasy_prices(price_rows jsonb, p_round integer)`: Updated guard from
    weak (`IS NOT NULL AND NOT`) to strict (`IS NULL OR NOT`), matching its sibling
    overload `admin_update_fantasy_prices(p_player_id integer, p_price integer)`.

  ## Note on Pipeline Functions
  Functions `fn_refresh_edge_board`, `fn_refresh_market_watch`, `enqueue_ranking_reco_jobs`,
  and `run_neeko_ai_pipeline` are legitimately called by pg_cron (uid=NULL). Their guards
  allowing service_role through are intentional. The security fix for those is to revoke
  anon EXECUTE (done in the next migration) so only service_role can call them without auth.
*/

CREATE OR REPLACE FUNCTION public.admin_update_fantasy_prices(price_rows jsonb, p_round integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_row           jsonb;
v_player_name   text;
v_price         integer;
v_player_id     integer;
v_rows_updated  integer := 0;
v_rows_skipped  integer := 0;
v_unmatched     text[]  := '{}';
BEGIN
-- Strict admin guard: requires authenticated admin session (not service_role passthrough)
IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'insufficient_privilege';
END IF;

IF p_round IS NULL OR p_round < 0 OR p_round > 30 THEN
RETURN jsonb_build_object('success', false, 'error', 'Invalid round number');
END IF;

IF jsonb_array_length(price_rows) = 0 THEN
RETURN jsonb_build_object('success', false, 'error', 'No price rows supplied');
END IF;

FOR v_row IN SELECT * FROM jsonb_array_elements(price_rows) LOOP
v_player_name := trim(v_row->>'player_name');
v_price       := (v_row->>'price')::integer;

-- Skip invalid rows
IF v_price IS NULL OR v_price < 100000 THEN
v_rows_skipped := v_rows_skipped + 1;
CONTINUE;
END IF;

IF v_player_name = '' OR v_player_name IS NULL THEN
v_rows_skipped := v_rows_skipped + 1;
CONTINUE;
END IF;

-- Resolve player_id from afl.players (authoritative player registry)
SELECT p.player_id INTO v_player_id
FROM afl.players p
WHERE lower(p.player_name) = lower(v_player_name)
LIMIT 1;

-- Fallback: try rankings cache for name variations
IF v_player_id IS NULL THEN
SELECT c.player_id INTO v_player_id
FROM afl.player_rankings_cache c
WHERE lower(c.player_name) = lower(v_player_name)
LIMIT 1;
END IF;

IF v_player_id IS NOT NULL THEN
-- UPSERT into afl.player_prices_import (canonical source)
INSERT INTO afl.player_prices_import ("PLAYER", "PRICE", player_id)
VALUES (v_player_name, v_price, v_player_id)
ON CONFLICT (player_id) DO UPDATE
SET "PRICE"  = EXCLUDED."PRICE",
"PLAYER" = EXCLUDED."PLAYER";

-- Keep afl.player_prices in sync (feeds v_latest_player_prices → view chain)
INSERT INTO afl.player_prices (player_id, price, updated_at)
VALUES (v_player_id, v_price, now())
ON CONFLICT (player_id) DO UPDATE
SET price      = EXCLUDED.price,
updated_at = now();

v_rows_updated := v_rows_updated + 1;
ELSE
v_unmatched    := array_append(v_unmatched, v_player_name);
v_rows_skipped := v_rows_skipped + 1;
END IF;
END LOOP;

-- Refresh rankings cache and market watch so frontend reflects new prices immediately
IF v_rows_updated > 0 THEN
PERFORM afl.populate_rankings_cache_from_source();
PERFORM public.fn_refresh_market_watch();
PERFORM public.fn_refresh_edge_board();
END IF;

RETURN jsonb_build_object(
'success',        true,
'rows_updated',   v_rows_updated,
'rows_not_found', COALESCE(array_length(v_unmatched, 1), 0),
'rows_skipped',   v_rows_skipped,
'unmatched',      to_jsonb(v_unmatched)
);
END;
$function$;
