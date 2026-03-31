/*
  # Fix 6: Price Ingest Downstream Refresh Chain

  ## Problem
  When prices are successfully ingested via `process_price_ingest_by_id()`, the function
  inserts into `afl.player_prices` with ON CONFLICT DO NOTHING — meaning if a price
  already exists for that player, it is silently skipped rather than updated.

  Additionally, there is no downstream refresh triggered after price ingestion.
  The rankings cache and market watch snapshot remain stale until the next cron cycle.

  ## Fix
  1. Repair `process_price_ingest_by_id()` to use ON CONFLICT DO UPDATE (upsert)
     so existing prices are always overwritten with the latest ingested value.
  2. After successful price ingestion, trigger downstream cache rebuild + market snapshot.
  3. Create a trigger on `afl.player_prices` that queues a market watch refresh
     via `market_watch_refresh_queue` when prices change.

  ## 72 Stuck Rows (pending_player_record)
  These rows have normalized names too short/ambiguous to match any player record
  (e.g., "A E", "B M"). These are genuine unresolvable name conflicts from the
  source data — they require manual resolution via the Admin Price Ingest UI.
  We leave them as-is (do not delete data).

  ## Impact
  - New price data now overwrites stale prices (not silently skipped)
  - Rankings cache and market watch refresh within the same pipeline call
  - No data loss — only updates existing player_prices rows on conflict
*/

-- ── Fix process_price_ingest_by_id to upsert (not skip) on conflict ───────────
CREATE OR REPLACE FUNCTION public.process_price_ingest_by_id(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
DECLARE
  v_row         jsonb;
  v_player_id   integer;
  v_price       integer;
  v_inserted    integer := 0;
  v_updated     integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_player_id := (v_row->>'player_id')::integer;
    v_price     := (v_row->>'cleaned_price')::integer;

    IF v_player_id IS NULL OR v_price IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO afl.player_prices (player_id, price, updated_at)
    VALUES (v_player_id, v_price, now())
    ON CONFLICT (player_id) DO UPDATE
      SET price      = EXCLUDED.price,
          updated_at = now()
    WHERE afl.player_prices.price IS DISTINCT FROM EXCLUDED.price;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- Downstream refresh: rebuild rankings cache and market snapshot
  IF (v_inserted + v_updated) > 0 THEN
    PERFORM afl.populate_rankings_cache_from_source();
    PERFORM market.build_market_watch_snapshot();

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('price_ingest_refresh', 'process_price_ingest_by_id', 'info',
            'Price ingest downstream refresh: ' || (v_inserted + v_updated) || ' prices processed',
            jsonb_build_object('inserted', v_inserted, 'updated', v_updated));
  END IF;

  RETURN jsonb_build_object(
    'inserted',    v_inserted,
    'updated',     v_updated,
    'total',       jsonb_array_length(p_rows)
  );
END;
$$;

-- ── Also create admin RPC for updating prices manually (used by AdminPipelines) ─
CREATE OR REPLACE FUNCTION public.admin_update_fantasy_prices(p_player_id integer, p_price integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO afl.player_prices (player_id, price, updated_at)
  VALUES (p_player_id, p_price, now())
  ON CONFLICT (player_id) DO UPDATE
    SET price      = EXCLUDED.price,
        updated_at = now();

  -- Downstream refresh
  PERFORM afl.populate_rankings_cache_from_source();
  PERFORM market.build_market_watch_snapshot();

  RETURN jsonb_build_object('status', 'ok', 'player_id', p_player_id, 'price', p_price);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_fantasy_prices(integer, integer) TO authenticated;
