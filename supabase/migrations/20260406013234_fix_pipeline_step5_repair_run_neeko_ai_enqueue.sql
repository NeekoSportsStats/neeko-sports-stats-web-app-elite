/*
  # Fix: Repair run_neeko_ai_enqueue to work with restored view

  ## Problem
  run_neeko_ai_enqueue() was failing silently because v_ai_player_analysis_input
  did not exist. Now the view is restored, but the function also needs to ensure:
  1. Players in rankings_cache but NOT in ai.player_ai_analysis get seeded
  2. Players with needs_regen=true are correctly identified
  3. The function returns accurate counts

  ## Fix
  Rebuild run_neeko_ai_enqueue to:
  - Seed missing players into ai.player_ai_analysis with needs_regen=true
  - Mark stale players (input_hash changed) as needs_regen=true
  - Use the now-existing v_ai_player_analysis_input view
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_enqueue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, ai
AS $$
DECLARE
  v_seeded_count       integer := 0;
  v_stale_count        integer := 0;
  v_needs_regen_total  integer := 0;
  v_never_generated    integer := 0;
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

  -- 2. Mark stale players (hash changed vs current cache data)
  UPDATE ai.player_ai_analysis aa
  SET
    needs_regen        = true,
    needs_regen_reason = 'input_hash_changed',
    input_hash         = NULL,
    generated_at       = NULL
  FROM public.v_ai_player_analysis_input v
  WHERE aa.player_id = v.player_id
    AND v.current_input_hash IS DISTINCT FROM aa.input_hash
    AND aa.input_hash IS NOT NULL
    AND aa.generated_at IS NOT NULL;

  GET DIAGNOSTICS v_stale_count = ROW_COUNT;

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

  RETURN jsonb_build_object(
    'status',             'enqueue_complete',
    'seeded_players',     v_seeded_count,
    'stale_players',      v_stale_count,
    'never_generated_flagged', v_never_generated,
    'total_needs_regen',  v_needs_regen_total
  );
END;
$$;
