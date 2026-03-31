/*
  # Fix 2: Rewrite run_neeko_ai_enqueue to use correct existing tables

  ## Problem
  `run_neeko_ai_enqueue()` references 3 non-existent objects:
  - `public.ai_player_runs` — table does not exist
  - `public.v_ai_player_generation_input_v2` — view does not exist
  - `public.ai_player_content` — table does not exist

  This causes `run_neeko_ai_pipeline()` (and the `neeko_ai_pipeline` cron) to fail
  on 2 of 3 stages.

  ## Fix
  Rewrite to use the correct existing objects:
  - Input view: `public.v_ai_player_analysis_input` (hash-based staleness detection, 687 rows)
  - Output table: `ai.player_ai_analysis` (724 rows)
  - Stale condition: `input_hash` column mismatch (already present in both)

  ## What this function does now
  Finds all players where AI analysis is stale (hash changed or missing) and
  invalidates them in `ai.player_ai_analysis` so `generate-player-ai` edge function
  will regenerate them on next trigger.

  ## Impact
  - `run_neeko_ai_pipeline()` no longer errors on enqueue stage
  - Players with stale data get flagged for regeneration
  - No data loss — only marks existing rows as needing refresh
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_enqueue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ai, afl
AS $$
DECLARE
  v_stale_count  integer := 0;
  v_missing_count integer := 0;
  v_total        integer := 0;
BEGIN
  -- Count players missing AI analysis entirely
  SELECT COUNT(*) INTO v_missing_count
  FROM public.v_ai_player_analysis_input v
  WHERE NOT EXISTS (
    SELECT 1 FROM ai.player_ai_analysis a WHERE a.player_id = v.player_id
  );

  -- Count players with stale AI analysis (input_hash changed)
  SELECT COUNT(*) INTO v_stale_count
  FROM public.v_ai_player_analysis_input v
  JOIN ai.player_ai_analysis a ON a.player_id = v.player_id
  WHERE v.input_hash IS DISTINCT FROM a.input_hash
    AND v.input_hash IS NOT NULL;

  v_total := v_missing_count + v_stale_count;

  -- Mark stale rows so generate-player-ai will regenerate them
  -- (clear generated_at so the edge function treats them as needing refresh)
  UPDATE ai.player_ai_analysis a
  SET
    input_hash  = NULL,
    generated_at = NULL,
    updated_at  = now()
  FROM public.v_ai_player_analysis_input v
  WHERE a.player_id = v.player_id
    AND v.input_hash IS DISTINCT FROM a.input_hash
    AND v.input_hash IS NOT NULL;

  RETURN jsonb_build_object(
    'status',          'enqueue_complete',
    'missing_players', v_missing_count,
    'stale_players',   v_stale_count,
    'total_flagged',   v_total
  );
END;
$$;
