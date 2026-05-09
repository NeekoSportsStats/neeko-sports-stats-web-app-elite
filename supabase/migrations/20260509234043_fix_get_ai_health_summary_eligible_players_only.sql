/*
  # Fix get_ai_health_summary to count eligible players only (games_played > 0)

  ## Problem
  get_ai_health_summary() counted ALL rows in ai.player_ai_analysis (625 total,
  111 without summary_long). Those 111 include zero-game players who should never
  have AI generated for them. This made "missing" appear high and "total_rows"
  include players that are intentionally not processed.

  ## Fix
  Join ai.player_ai_analysis to afl.player_rankings_cache to filter to eligible
  players (games_played > 0). Also adds excluded_from_ai count for transparency.

  ## No data mutations — function definition only
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

  -- ── Player AI stats (eligible players only — games_played > 0) ───────────────
  SELECT jsonb_build_object(
    'total_rows',         COUNT(*) FILTER (WHERE COALESCE(c.games_played, 0) > 0),
    'with_summary',       COUNT(*) FILTER (
                            WHERE COALESCE(c.games_played, 0) > 0
                              AND pa.summary_long IS NOT NULL
                              AND pa.summary_long <> ''
                          ),
    'missing',            COUNT(*) FILTER (
                            WHERE COALESCE(c.games_played, 0) > 0
                              AND (pa.summary_long IS NULL OR pa.summary_long = '')
                          ),
    'stale',              COUNT(*) FILTER (
                            WHERE COALESCE(c.games_played, 0) > 0
                              AND pa.needs_regen = true
                          ),
    'excluded_from_ai',   COUNT(*) FILTER (WHERE COALESCE(c.games_played, 0) = 0),
    'last_generated_at',  MAX(pa.generated_at) FILTER (WHERE COALESCE(c.games_played, 0) > 0),
    'oldest_generated_at',MIN(pa.generated_at) FILTER (
                            WHERE COALESCE(c.games_played, 0) > 0
                              AND pa.generated_at IS NOT NULL
                          ),
    'prompt_version',     (
      SELECT pa2.model FROM ai.player_ai_analysis pa2
      JOIN afl.player_rankings_cache c2 ON c2.player_id = pa2.player_id
      WHERE COALESCE(c2.games_played, 0) > 0
        AND pa2.generated_at IS NOT NULL
      ORDER BY pa2.generated_at DESC
      LIMIT 1
    )
  )
  INTO v_player
  FROM afl.player_rankings_cache c
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = c.player_id;

  -- ── Team AI stats ────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_rows',         COUNT(*),
    'unique_teams',       COUNT(DISTINCT team),
    'with_summary',       COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary <> ''),
    'missing',            18 - COUNT(DISTINCT team),
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

GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_health_summary() TO service_role;
