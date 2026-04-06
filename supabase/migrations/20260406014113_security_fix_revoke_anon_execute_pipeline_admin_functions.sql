/*
  # Security Fix: Revoke anon EXECUTE on All Pipeline and Admin Functions

  ## Summary
  Revokes EXECUTE privilege from the `anon` role on all internal pipeline,
  admin-only, and AI generation functions. These functions should only be
  callable by authenticated admins or the service_role (pg_cron/edge functions).

  ## Functions Affected (34 total across public, afl, ai, market schemas)

  ### afl schema (pipeline internals)
  - commit_price_round: writes price data
  - populate_rankings_cache: rebuilds rankings
  - populate_rankings_cache_from_source: rebuilds rankings from source
  - rebuild_player_projection: rebuilds player projections
  - refresh_mv_player_projection: refreshes materialized view
  - refresh_mv_player_rankings: refreshes materialized view
  - save_player_name_mapping: writes player name mappings

  ### ai schema
  - fn_mark_players_needing_regen: marks players for AI regen

  ### market schema
  - build_market_watch_snapshot: rebuilds market watch data

  ### public schema (admin + pipeline functions)
  - admin_toggle_team_bye: admin bye management
  - admin_update_fantasy_prices (both overloads): admin price updates
  - admin_update_player_status: admin player status
  - admin_update_team_bye: admin bye management
  - commit_price_round: writes price data
  - enqueue_ranking_reco_jobs: enqueues AI jobs
  - fn_fire_ai_worker_wave/range/shard: fires HTTP AI generation waves
  - fn_refresh_edge_board: rebuilds edge board
  - fn_refresh_market_watch: rebuilds market watch
  - populate_mv_edge_board: rebuilds edge board MV
  - populate_rankings_cache_from_source: rebuilds rankings
  - run_afl_processing_core: full processing pipeline
  - run_afl_worker_ingestion: data ingestion pipeline
  - run_neeko_ai_pipeline: AI generation pipeline
  - run_neeko_pipeline: full daily pipeline
  - save_pending_price_rows: writes pending prices
  - save_player_name_mapping: writes player name mappings
  - truncate_and_regenerate_ai: nukes and regenerates all AI
  - upsert_player_ai_analysis (both overloads): writes AI analysis
  - write_ai_summary: writes AI summaries

  ## Security Impact
  After this migration, anon users (unauthenticated HTTP requests) cannot trigger
  any of these functions via the PostgREST REST API. Only service_role (pg_cron,
  edge functions) and authenticated admin users retain access.
*/

-- afl schema
REVOKE EXECUTE ON FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache_from_source() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.rebuild_player_projection() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_projection() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_rankings() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.save_player_name_mapping(p_source_name text, p_player_id integer) FROM anon;

-- ai schema
REVOKE EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() FROM anon;

-- market schema
REVOKE EXECUTE ON FUNCTION market.build_market_watch_snapshot() FROM anon;

-- public schema — admin functions
REVOKE EXECUTE ON FUNCTION public.admin_toggle_team_bye(p_team_id integer, p_season integer, p_is_bye_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(p_player_id integer, p_price integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(price_rows jsonb, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_player_status(p_player_id integer, p_status text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_team_bye(p_team_id integer, p_season integer, p_bye_round integer) FROM anon;

-- public schema — pipeline functions
REVOKE EXECUTE ON FUNCTION public.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave(p_limit_players integer, p_page_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_range(p_limit_players integer, p_player_id_gte integer, p_player_id_lt integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_shard(p_shard integer, p_total_shards integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_edge_board() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_market_watch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.populate_mv_edge_board() FROM anon;
REVOKE EXECUTE ON FUNCTION public.populate_rankings_cache_from_source() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_afl_processing_core() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_afl_worker_ingestion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_neeko_pipeline() FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_pending_price_rows(p_rows jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_player_name_mapping(p_source_name text, p_player_id integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.truncate_and_regenerate_ai() FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_recommendation text, p_summary_short text, p_summary_long text, p_color text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric, p_prompt_version text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_summary_short text, p_summary_long text, p_recommendation text, p_color text, p_prompt_version text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.write_ai_summary(p_player text, p_ai_summary text) FROM anon;
