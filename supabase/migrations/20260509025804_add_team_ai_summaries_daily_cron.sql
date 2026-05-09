/*
  # Add Team AI Summaries Daily Cron Job

  ## Summary
  Adds a scheduled cron job to generate AI team summaries for all 18 AFL teams
  after the nightly data pipeline completes.

  ## Pipeline Schedule (UTC)
  - 14:00 — stage1_ingest_1am_melb       (raw data ingestion)
  - 14:30 — stage3_neeko_full_pipeline    (23-step full pipeline)
  - 15:00 — stage4_populate_rankings_cache
  - 15:05 — stage5_neeko_ai_pipeline      (player AI enqueue + fire)
  - 15:45 — stage7_gap_heal               (fill missing game data)
  - 16:00 — team_ai_summaries_daily       (NEW — generate team AI after full pipeline)
  - 17:00 — projection_accuracy_pipeline

  ## New Objects
  - `public.fn_fire_team_ai_summaries()` — HTTP trigger function that calls the
    `generate-team-ai-summaries` edge function with service role credentials
  - `team_ai_summaries_daily` cron job — runs at 16:00 UTC daily (3am Melbourne AEST)

  ## Architecture Context
  The simplified AI architecture has two AI sources:
    1. Player AI only → `ai.player_ai_analysis` via `generate-player-ai`
    2. Team AI only   → `afl.ai_team_summaries` via `generate-team-ai-summaries`
    3. Everything else is stat-generated (Market Watch signals, Start/Sit, etc.)

  ## Deprecated Jobs (already removed from cron.job — documented for audit trail)
  - `market_watch_weekly`          — removed; market watch is now stat-generated
  - `ranking_recos_nightly_fill`   — removed; player AI consolidated into stage5
  - `neeko_intel_refresh`          — removed; neeko intel views deprecated
  - `ai_worker_cron`               — removed; replaced by ai_regen_wave_5min
  - `generate_all_ai_cron`         — removed; replaced by pipeline stages

  ## No table drops in this migration.
*/

-- ── Helper function: fire team AI summaries edge function ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_fire_team_ai_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  -- Resolve service role key from internal secrets store
  SELECT value INTO v_token
  FROM internal.cron_secrets
  WHERE key = 'supabase_secret_key';

  -- Fallback to legacy key name if primary not found
  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token
    FROM internal.cron_secrets
    WHERE key = 'cron_auth_token';
  END IF;

  v_base_url := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';

  IF v_token IS NOT NULL AND v_token != '' THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-team-ai-summaries',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  END IF;
END;
$$;

-- Restrict execution to service_role and postgres only
REVOKE ALL ON FUNCTION public.fn_fire_team_ai_summaries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fire_team_ai_summaries() FROM anon;
REVOKE ALL ON FUNCTION public.fn_fire_team_ai_summaries() FROM authenticated;


-- ── Schedule the daily team AI job ───────────────────────────────────────────
-- Runs at 16:00 UTC daily (3:00am Melbourne AEST / 2:00am AEDT)
-- Scheduled 15 minutes after stage7_gap_heal (15:45 UTC) to ensure all
-- pipeline data is settled before team summaries are generated.

SELECT cron.unschedule('team_ai_summaries_daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'team_ai_summaries_daily'
);

SELECT cron.schedule(
  'team_ai_summaries_daily',
  '0 16 * * *',
  'SELECT public.fn_fire_team_ai_summaries();'
);
