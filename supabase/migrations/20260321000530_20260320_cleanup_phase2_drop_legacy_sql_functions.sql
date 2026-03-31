/*
  # Phase 2: Drop Legacy SQL Functions

  These functions are confirmed unused by:
  - No active cron jobs reference them
  - admin-command edge function updated in Phase 6 to no longer call them
  - They were wrapper/controller patterns superseded by run_neeko_pipeline()

  ## Functions dropped (public schema)
  1. run_afl_pipeline_controller() — old 4-step controller (prices→cache→market_watch→edge_board)
  2. run_afl_processing_core() — old 4-step processor (sync→ranks→cache→market_watch)
  3. run_afl_ai_pipeline() — old AI pipeline that called fire_ai_generation_all_players()
  4. run_afl_worker() — generic HTTP dispatcher wrapper
  5. run_ai_generation_if_window() — time-window guard for generate-ranking-ai edge fn
  6. run_neeko_pipeline_orchestrator() — 1-line wrapper calling run_neeko_pipeline()
  7. fn_pipeline_refresh_neeko_intel() — wrapper for refresh_neeko_intel_features_2026()
  8. refresh_neeko_intel_features_2026() — wrote to ai_neeko_intel_features (legacy table)
  9. fire_ai_generation_all_players() — called legacy generate-player-ranking-recos edge fn
  10. run_afl_ingestion_pipeline() — old ingestion wrapper, replaced by run_afl_worker_ingestion()
  11. run_ai_generation_pipeline() — old AI generation wrapper

  ## Safety
  - run_neeko_pipeline() (18-step live orchestrator) is NOT dropped
  - run_neeko_ai_pipeline() and run_neeko_ai_enqueue() are NOT dropped
  - All active cron job functions are NOT dropped
*/

DROP FUNCTION IF EXISTS public.run_afl_pipeline_controller();
DROP FUNCTION IF EXISTS public.run_afl_processing_core();
DROP FUNCTION IF EXISTS public.run_afl_ai_pipeline();
DROP FUNCTION IF EXISTS public.run_afl_worker();
DROP FUNCTION IF EXISTS public.run_ai_generation_if_window();
DROP FUNCTION IF EXISTS public.run_neeko_pipeline_orchestrator();
DROP FUNCTION IF EXISTS public.fn_pipeline_refresh_neeko_intel();
DROP FUNCTION IF EXISTS public.refresh_neeko_intel_features_2026();
DROP FUNCTION IF EXISTS public.fire_ai_generation_all_players();
DROP FUNCTION IF EXISTS public.run_afl_ingestion_pipeline();
DROP FUNCTION IF EXISTS public.run_ai_generation_pipeline();
