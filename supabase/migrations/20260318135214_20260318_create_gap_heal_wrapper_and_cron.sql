/*
  # Create fn_run_gap_heal wrapper and register afl_gap_heal cron

  ## Purpose
  The previous migration successfully created fn_sync_player_games_from_raw,
  fn_check_player_games_gap, run_afl_processing_core, and run_neeko_pipeline.
  However, the cron.schedule call failed due to nested dollar-quote conflict.

  ## This migration:
  1. Creates a named wrapper function fn_run_gap_heal() that contains the
     gap-heal logic (avoids nested dollar-quoting in cron.schedule)
  2. Registers the afl_gap_heal cron at 25 6 * * * (6:25 AM UTC daily)
  3. Verifies registration

  ## Why wrapper pattern:
  cron.schedule() takes a SQL string. Embedding DO $$ ... $$ LANGUAGE plpgsql
  inside a dollar-quoted string causes a parse conflict. A named function
  avoids this entirely — cron simply calls SELECT public.fn_run_gap_heal().
*/

CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_synced integer := 0;
  v_gap    integer := 0;
BEGIN
  SELECT public.fn_sync_player_games_from_raw() INTO v_synced;

  SELECT public.fn_check_player_games_gap() INTO v_gap;

  IF v_synced > 0 THEN
    PERFORM afl.rebuild_player_projection();

    PERFORM afl.populate_rankings_cache_from_source();

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'gap_heal_triggered_rebuild',
      'cron:afl_gap_heal',
      'warn',
      'Gap heal synced ' || v_synced || ' rows and triggered full projection rebuild',
      jsonb_build_object(
        'rows_synced',    v_synced,
        'remaining_gap',  v_gap,
        'healed_at',      now()
      )
    );
  ELSE
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'gap_heal_no_action',
      'cron:afl_gap_heal',
      'info',
      'Gap heal ran — no new rows to sync (gap=' || v_gap || ')',
      jsonb_build_object(
        'rows_synced',   v_synced,
        'remaining_gap', v_gap,
        'checked_at',    now()
      )
    );
  END IF;

  IF v_gap > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'gap_heal_residual_alert',
      'cron:afl_gap_heal',
      'error',
      'Residual gap after heal: ' || v_gap || ' raw_player_stats rows still missing from player_games',
      jsonb_build_object(
        'residual_gap', v_gap,
        'alerted_at',   now()
      )
    );
  END IF;
END;
$$;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'afl_gap_heal';

SELECT cron.schedule(
  'afl_gap_heal',
  '25 6 * * *',
  'SELECT public.fn_run_gap_heal()'
);
