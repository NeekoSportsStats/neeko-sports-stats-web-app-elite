/*
  # Fix 8: Retire legacy duplicate pipeline functions

  ## Functions being retired
  These functions are superseded by the new unified pipeline and are no longer
  referenced by any active cron job or frontend code:

  1. `public.run_afl_pipeline()` — old monolithic pipeline, replaced by run_neeko_pipeline()
  2. `public.run_afl_pipeline_controller()` — old controller, replaced by staged crons
  3. `public.run_afl_pipeline_controller_internal()` — internal helper of old controller
  4. `public.run_afl_processing_pipeline()` — old processing wrapper

  ## Kept
  - `public.run_neeko_ai_enqueue()` — kept (now fixed and used by run_neeko_ai_pipeline)
  - `public.run_afl_processing_core()` — kept (now fixed, called by stage4 cron)
  - `public.run_afl_worker_ingestion()` — kept (called by stage1 cron)

  ## Safety
  These are all DROP IF EXISTS so the migration is safe to run even if a function
  was already removed.
*/

DROP FUNCTION IF EXISTS public.run_afl_pipeline();
DROP FUNCTION IF EXISTS public.run_afl_pipeline_controller();
DROP FUNCTION IF EXISTS public.run_afl_pipeline_controller_internal();
DROP FUNCTION IF EXISTS public.run_afl_processing_pipeline();
