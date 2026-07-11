-- Backfill historical price rounds from AFL Fantasy paste JSON.
-- Resolves players via fantasy_id_map (exact) then name+squadId (fallback).
-- Writes rounds [p_from_round, p_to_round] from the prices{} map per player.
-- Uses ON CONFLICT (player_id, season, round) DO NOTHING — never overwrites.
-- Does NOT write status (price history only).
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

  -- Resolve all players using the existing tested resolution path:
  --   (a) fantasy_id_map exact match
  --   (b) name + squadId → club → resolve_price_names
  v_resolve_result    := public.resolve_fantasy_paste(p_json);
  v_resolved          := v_resolve_result -> 'resolved';
  v_unresolved_count  := (v_resolve_result -> 'summary' ->> 'unresolved_count')::integer;
  v_players_processed := (v_resolve_result -> 'summary' ->> 'total')::integer;

  -- One INSERT per round for clean per-round ROW_COUNT tracking.
  -- LATERAL join ties each resolved player back to their raw element
  -- (keyed by fantasy_id) to read the prices{} map.
  FOR v_round IN p_from_round .. p_to_round LOOP

    INSERT INTO afl.player_prices (player_id, price, season, round, updated_at, created_at)
    SELECT
      (res->>'player_id')::integer                           AS player_id,
      (raw.elem->'prices' ->> v_round::text)::integer        AS price,
      2026                                                   AS season,
      v_round                                                AS round,
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

    -- Ensure price_rounds registry entry exists for any round with data written
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

-- Admin-only: no anon/authenticated execute grant
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.backfill_prices_from_paste(jsonb, int, int) FROM authenticated;
