/*
# Create sync_player_statuses_from_paste RPC

## Problem
afl.player_rankings_cache.status is only written when a price round is
committed (weekly via commit_prices_and_refresh), but the AFL Fantasy
JSON carries a live per-player status that updates daily. Stale status
is why returning players show as OUT for a full week.

## Solution
A new SECURITY DEFINER RPC that:
1. Reuses resolve_fantasy_paste for name resolution (no new matcher).
2. Updates ONLY the status column in afl.player_rankings_cache for
   matched players.
3. Does NOT write prices, does NOT create/commit a price round.
4. Does NOT write to afl.players at all.

## New Function
- public.sync_player_statuses_from_paste(p_rows jsonb)
  - Input: the raw AFL Fantasy JSON array (same shape as resolve_fantasy_paste)
  - Output: jsonb with summary { updated, unchanged, unmatched }

## Security
- SECURITY DEFINER, STABLE search_path
- Granted to authenticated (same pattern as commit_prices_and_refresh)

## Important Notes
1. Reuses resolve_fantasy_paste internally — no duplicate name-matching logic.
2. Status normalisation is handled inside resolve_fantasy_paste already
   (raw status → AVAILABLE/OUT/TEST). This function reads the resolved
   status field and writes it directly to player_rankings_cache.status.
3. Only updates rows where the status actually changes (avoids unnecessary writes).
4. Does NOT touch afl.players, afl.player_prices, or any price round table.
*/

CREATE OR REPLACE FUNCTION public.sync_player_statuses_from_paste(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_resolve_result jsonb;
  v_resolved       jsonb;
  v_unresolved     jsonb;
  v_elem           jsonb;
  v_player_id      integer;
  v_status        text;
  v_old_status    text;
  v_updated       integer := 0;
  v_unchanged     integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  -- Reuse existing name-resolution logic — no new matcher
  v_resolve_result := public.resolve_fantasy_paste(p_rows);
  v_resolved   := v_resolve_result->'resolved';
  v_unresolved := v_resolve_result->'unresolved';
  v_unmatched_count := jsonb_array_length(v_unresolved);

  -- Update status only in player_rankings_cache for matched players
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_resolved)
  LOOP
    v_player_id := (v_elem->>'player_id')::integer;
    v_status    := v_elem->>'status';

    -- Get current status to avoid unnecessary writes
    SELECT prc.status INTO v_old_status
    FROM afl.player_rankings_cache prc
    WHERE prc.player_id = v_player_id;

    IF NOT FOUND THEN
      -- Player not in cache — skip silently, not an error
      v_unchanged := v_unchanged + 1;
    ELSIF COALESCE(v_old_status, '') = COALESCE(v_status, '') THEN
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE afl.player_rankings_cache
      SET status       = v_status,
          is_available = (v_status NOT IN ('OUT', 'INJURED', 'bye')),
          cached_at    = now()
      WHERE player_id = v_player_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'updated',   v_updated,
      'unchanged', v_unchanged,
      'unmatched', v_unmatched_count
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_player_statuses_from_paste(jsonb) TO authenticated;
