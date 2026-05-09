/*
  # Fix run_neeko_ai_enqueue() — Remove NULL Hash Guard + Add Timestamp Fallback

  ## Problem
  The stale-detection step (Step 2) in run_neeko_ai_enqueue() contained:
    AND aa.input_hash IS NOT NULL
  
  This silently skipped stale detection for all rows where input_hash is NULL
  (e.g., after a manual reset or first-generation). When all rows had NULL hashes
  (as happened post-R9 ingestion), stale_count reported as 0 — even though stats
  had changed — and no players were queued for AI regen.

  ## Changes
  1. Remove the `AND aa.input_hash IS NOT NULL` guard from Step 2
     - Now correctly detects stale when: current_hash DISTINCT FROM stored_hash, regardless of NULL
     - This includes: NULL→value, value→NULL, value→different-value transitions

  2. Add Step 2b: Timestamp fallback path
     - Marks rows stale where generated_at < rc.cached_at (stats updated AFTER AI generated)
     - Catches cases where input_hash was never stored but stats have since changed
     - Only applies to players with games_played > 0 who are not already flagged

  3. All three paths are idempotent — safe to re-run multiple times

  ## Security: no RLS changes, SECURITY DEFINER preserved
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_enqueue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
v_seeded_count         integer := 0;
v_stale_count          integer := 0;
v_stale_timestamp      integer := 0;
v_needs_regen_total    integer := 0;
v_never_generated      integer := 0;
BEGIN

-- 1. Seed players that exist in rankings_cache but NOT in ai.player_ai_analysis
INSERT INTO ai.player_ai_analysis (player_id, needs_regen, needs_regen_reason)
SELECT
  rc.player_id,
  true,
  'never_seeded'
FROM afl.player_rankings_cache rc
WHERE NOT EXISTS (
  SELECT 1 FROM ai.player_ai_analysis aa WHERE aa.player_id = rc.player_id
)
AND rc.games_played > 0
ON CONFLICT (player_id) DO NOTHING;

GET DIAGNOSTICS v_seeded_count = ROW_COUNT;

-- 2. Mark stale players whose input hash has changed vs current cache data.
--    FIX: Removed "AND aa.input_hash IS NOT NULL" guard — we now detect stale
--    regardless of whether the stored hash is NULL. This means NULL→value,
--    value→different-value, and value→NULL transitions are all caught correctly.
UPDATE ai.player_ai_analysis aa
SET
  needs_regen        = true,
  needs_regen_reason = 'input_hash_changed',
  input_hash         = NULL,
  generated_at       = NULL
FROM public.v_ai_player_analysis_input v
WHERE aa.player_id = v.player_id
  AND aa.generated_at IS NOT NULL          -- only flag players already generated
  AND aa.needs_regen = false               -- skip already-flagged rows
  AND v.current_input_hash IS DISTINCT FROM aa.input_hash;

GET DIAGNOSTICS v_stale_count = ROW_COUNT;

-- 2b. Timestamp fallback: mark stale where stats were updated AFTER AI was generated.
--     This catches players whose input_hash was never stored but whose stats changed.
UPDATE ai.player_ai_analysis aa
SET
  needs_regen        = true,
  needs_regen_reason = 'stats_newer_than_ai',
  input_hash         = NULL,
  generated_at       = NULL
FROM afl.player_rankings_cache rc
WHERE aa.player_id = rc.player_id
  AND aa.generated_at IS NOT NULL
  AND aa.needs_regen = false
  AND aa.input_hash IS NULL                -- only the NULL-hash case (already generated but no hash)
  AND rc.cached_at > aa.generated_at       -- stats updated after AI generated
  AND rc.games_played > 0;

GET DIAGNOSTICS v_stale_timestamp = ROW_COUNT;

-- 3. Ensure never-generated players have needs_regen=true
UPDATE ai.player_ai_analysis
SET needs_regen = true,
    needs_regen_reason = COALESCE(needs_regen_reason, 'never_generated')
WHERE generated_at IS NULL
  AND (needs_regen IS NULL OR needs_regen = false);

GET DIAGNOSTICS v_never_generated = ROW_COUNT;

-- 4. Count total needing regen
SELECT COUNT(*) INTO v_needs_regen_total
FROM ai.player_ai_analysis
WHERE needs_regen = true;

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'ai_enqueue_complete', 'run_neeko_ai_enqueue', 'info',
  'AI enqueue complete — seeded=' || v_seeded_count ||
  ' stale_hash=' || v_stale_count ||
  ' stale_timestamp=' || v_stale_timestamp ||
  ' never_generated=' || v_never_generated ||
  ' total_needs_regen=' || v_needs_regen_total,
  jsonb_build_object(
    'seeded', v_seeded_count,
    'stale_hash', v_stale_count,
    'stale_timestamp', v_stale_timestamp,
    'never_generated', v_never_generated,
    'total_needs_regen', v_needs_regen_total
  )
);

RETURN jsonb_build_object(
  'status',                'enqueue_complete',
  'seeded_players',        v_seeded_count,
  'stale_players',         v_stale_count,
  'stale_timestamp_path',  v_stale_timestamp,
  'never_generated_flagged', v_never_generated,
  'total_needs_regen',     v_needs_regen_total
);
END;
$$;
