/*
# Fix recovered players: default NULL status to 'active'

## Problem
The AFL Fantasy price paste enumerates the full roster (~685 players).
Players with no status flag in the paste are healthy, but their status
lands as NULL in afl.player_prices. The downstream sync function
(afl.sync_cache_status_from_prices) uses COALESCE(pf.status, 'AVAILABLE')
when reading the view, but the view (v_player_price_full) joins on the
latest player_prices row — and when status is NULL there, the COALESCE
in the view may or may not fire depending on the view definition.

More critically, for backfill the status column is never written at all
(the INSERT omits it), so historical rounds always have NULL status.

This means a player whose feed flag disappears (recovered from injury)
keeps a stale OUT in player_rankings_cache.status forever.

## Fix
In BOTH afl.commit_price_round AND public.backfill_prices_from_paste:
when a row is present in the paste but its normalised status is NULL,
write 'AVAILABLE' instead of NULL. Presence in the paste = enumerated =
healthy unless flagged.

Rows absent from the paste remain untouched — no new rows are invented,
no old rounds are backfilled beyond what the paste contains.

manual_status handling is unchanged: the feed never writes or clears it.

## Changes
1. afl.commit_price_round: wrap normalise_player_status() with COALESCE(..., 'AVAILABLE')
2. public.backfill_prices_from_paste: add status column to INSERT, same COALESCE pattern
*/

-- ── 1. Fix afl.commit_price_round ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $function$
DECLARE
  v_locked        BOOLEAN;
  v_upserted      INTEGER;
  v_input_total   INTEGER;
  v_valid_rows    INTEGER;
  v_status_synced INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_input_total
  FROM jsonb_array_elements(p_rows) AS r;

  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
    );
  END IF;

  -- Accept 'cleaned_price' (legacy OpsConsole) OR 'price' (resolver native output)
  SELECT count(*) INTO v_valid_rows
  FROM jsonb_array_elements(p_rows) AS r
  WHERE (r->>'player_id') IS NOT NULL
  AND COALESCE(r->>'cleaned_price', r->>'price') IS NOT NULL
  AND COALESCE(r->>'cleaned_price', r->>'price')::INTEGER > 0;

  IF v_valid_rows = 0 THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'No valid rows to commit. Ensure all rows have a player_id and a price above 0.'
    );
  END IF;

  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  -- Accept 'cleaned_price' OR 'price'; 'player_status' OR 'status'
  -- Presence in the paste = enumerated = healthy unless flagged → COALESCE NULL to 'AVAILABLE'
  INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
  SELECT
    deduped.player_id,
    deduped.cleaned_price,
    p_season,
    p_round,
    COALESCE(afl.normalise_player_status(deduped.player_status), 'AVAILABLE'),
    now(),
    now()
  FROM (
    SELECT DISTINCT ON ((r->>'player_id')::INTEGER)
      (r->>'player_id')::INTEGER                                        AS player_id,
      COALESCE(r->>'cleaned_price', r->>'price')::INTEGER               AS cleaned_price,
      COALESCE(r->>'player_status', r->>'status')                       AS player_status
    FROM jsonb_array_elements(p_rows) AS r
    WHERE (r->>'player_id') IS NOT NULL
    AND COALESCE(r->>'cleaned_price', r->>'price') IS NOT NULL
    AND COALESCE(r->>'cleaned_price', r->>'price')::INTEGER > 0
    ORDER BY (r->>'player_id')::INTEGER
  ) deduped
  ON CONFLICT (player_id, season, round)
  DO UPDATE SET
    price      = EXCLUDED.price,
    status     = EXCLUDED.status,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  IF v_upserted > 0 THEN
    BEGIN
      SELECT afl.sync_cache_status_from_prices() INTO v_status_synced;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'commit_price_round: sync_cache_status_from_prices failed: %', SQLERRM;
      v_status_synced := 0;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'season',        p_season,
    'round',         p_round,
    'inserted',      v_upserted,
    'status_synced', v_status_synced,
    'skipped',       v_valid_rows - v_upserted,
    'total',         v_input_total,
    'matched',       v_valid_rows,
    'pipeline',      'queued'
  );
END;
$function$;

COMMENT ON FUNCTION afl.commit_price_round(jsonb, integer, integer) IS
'Fantasy price ingest. Status (OUT/TEST/AVAILABLE) is ALWAYS overwritten from upload.
NULL normalised status defaults to AVAILABLE (player is in the paste = healthy unless flagged).
After upsert: fast status sync runs to guarantee pills are correct immediately.';

-- ── 2. Fix public.backfill_prices_from_paste ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.backfill_prices_from_paste(
  p_json       jsonb,
  p_from_round int DEFAULT 14,
  p_to_round   int DEFAULT 17
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_resolve_result    jsonb;
  v_resolved          jsonb;
  v_unresolved_count  integer;
  v_players_processed integer;
  v_round             integer;
  v_per_round_count   integer;
  v_rounds_written    jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  v_resolve_result    := public.resolve_fantasy_paste(p_json);
  v_resolved          := v_resolve_result -> 'resolved';
  v_unresolved_count  := (v_resolve_result -> 'summary' ->> 'unresolved_count')::integer;
  v_players_processed := (v_resolve_result -> 'summary' ->> 'total')::integer;

  FOR v_round IN p_from_round .. p_to_round LOOP

    INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
    SELECT
      (res->>'player_id')::integer                           AS player_id,
      (raw.elem->'prices' ->> v_round::text)::integer        AS price,
      2026                                                   AS season,
      v_round                                                AS round,
      COALESCE(afl.normalise_player_status(raw.elem->>'status'), 'AVAILABLE') AS status,
      now(),
      now()
    FROM jsonb_array_elements(v_resolved) AS res
    JOIN LATERAL (
      SELECT elem
      FROM jsonb_array_elements(p_json) AS elem
      WHERE (elem->>'id')::bigint = (res->>'fantasy_id')::bigint
      LIMIT 1
    ) raw ON true
    WHERE (raw.elem->'prices' ->> v_round::text) IS NOT NULL
      AND (raw.elem->'prices' ->> v_round::text)::integer > 0
    ON CONFLICT (player_id, season, round) DO NOTHING;

    GET DIAGNOSTICS v_per_round_count = ROW_COUNT;

    v_rounds_written := jsonb_set(
      v_rounds_written,
      ARRAY[v_round::text],
      to_jsonb(v_per_round_count)
    );

    IF v_per_round_count > 0 THEN
      INSERT INTO afl.price_rounds (season, round, label, is_locked)
      VALUES (2026, v_round, format('Round %s', v_round), false)
      ON CONFLICT (season, round) DO NOTHING;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'ok',                      true,
    'players_processed',       v_players_processed,
    'unresolved_count',        v_unresolved_count,
    'rounds_written_per_round', v_rounds_written
  );
END;
$$;

-- Re-apply grants (function signature unchanged)
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM authenticated;
