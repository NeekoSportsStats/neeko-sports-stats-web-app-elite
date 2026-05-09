/*
  # Create get_ai_health_summary RPC

  ## Purpose
  Single RPC that returns all AI health data for the admin health panel:
  - Player AI stats (total, with_summary, missing, stale, last_generated, prompt_version)
  - Team AI stats (total_teams, with_summary, missing, last_generated, prompt_version)
  - Cron status for player and team AI jobs

  ## Security
  - SECURITY DEFINER — reads ai.player_ai_analysis and afl.ai_team_summaries
  - Executable by authenticated admin users only (caller must be admin; edge function uses service role)
*/

CREATE OR REPLACE FUNCTION public.get_ai_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ai, afl
AS $$
DECLARE
  v_result jsonb;
  v_player jsonb;
  v_team   jsonb;
  v_cron   jsonb;
BEGIN

  -- ── Player AI stats ──────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_rows',         COUNT(*),
    'with_summary',       COUNT(*) FILTER (WHERE summary_long IS NOT NULL AND summary_long <> ''),
    'missing',            COUNT(*) FILTER (WHERE summary_long IS NULL OR summary_long = ''),
    'stale',              COUNT(*) FILTER (WHERE needs_regen = true),
    'last_generated_at',  MAX(generated_at),
    'oldest_generated_at',MIN(generated_at) FILTER (WHERE generated_at IS NOT NULL),
    'prompt_version',     (
      SELECT model FROM ai.player_ai_analysis
      WHERE generated_at IS NOT NULL
      ORDER BY generated_at DESC
      LIMIT 1
    )
  )
  INTO v_player
  FROM ai.player_ai_analysis;

  -- ── Team AI stats ────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_rows',         COUNT(*),
    'unique_teams',       COUNT(DISTINCT team),
    'with_summary',       COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary <> ''),
    'missing',            18 - COUNT(DISTINCT team),   -- 18 AFL teams
    'last_generated_at',  MAX(updated_at),
    'prompt_version',     MAX(prompt_version)
  )
  INTO v_team
  FROM afl.ai_team_summaries
  WHERE season = 2026;

  -- ── Cron job status for AI-related jobs ──────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'jobname',        jobname,
      'schedule',       schedule,
      'active',         active,
      'last_run_at',    last_run_at,
      'last_status',    last_status,
      'health_status',  health_status,
      'runs_7d',        runs_7d,
      'success_7d',     success_7d,
      'fail_7d',        fail_7d
    )
    ORDER BY jobname
  )
  INTO v_cron
  FROM admin.v_cron_status
  WHERE jobname IN (
    'stage5_neeko_ai_pipeline',
    'team_ai_summaries_daily',
    'ai_regen_wave_5min',
    'stage3_neeko_full_pipeline',
    'stage1_ingest_1am_melb'
  );

  v_result := jsonb_build_object(
    'player_ai',  v_player,
    'team_ai',    v_team,
    'cron_jobs',  COALESCE(v_cron, '[]'::jsonb),
    'generated_at', NOW()
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'generated_at', NOW());
END;
$$;

-- Grant to authenticated (admin guard is in the edge function calling this)
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO service_role;
