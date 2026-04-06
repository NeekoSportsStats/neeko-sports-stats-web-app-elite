/*
  # Security Fix: Revoke PUBLIC EXECUTE on All Pipeline and Admin Functions

  ## Summary
  The previous revoke migration only revoked from the named `anon` role, but the
  functions had been granted EXECUTE to `PUBLIC` (the default PostgreSQL role that
  all roles including `anon` inherit). This migration revokes from PUBLIC explicitly,
  and also re-revokes from `anon` and `authenticated` for belt-and-suspenders coverage.

  ## Root Cause
  PostgreSQL functions granted to `PUBLIC` are callable by everyone including the
  `anon` role. `has_function_privilege('anon', oid, 'EXECUTE')` returns true for
  PUBLIC grants. Must revoke from PUBLIC to actually block anon access.

  ## Functions Covered
  All pipeline, admin, and AI generation functions across public, afl, ai, market schemas.
*/

-- ── afl schema ─────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache() FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache_from_source() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache_from_source() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.populate_rankings_cache_from_source() FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.rebuild_player_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.rebuild_player_projection() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.rebuild_player_projection() FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_projection() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_projection() FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_rankings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_rankings() FROM anon;
REVOKE EXECUTE ON FUNCTION afl.refresh_mv_player_rankings() FROM authenticated;

REVOKE EXECUTE ON FUNCTION afl.save_player_name_mapping(p_source_name text, p_player_id integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION afl.save_player_name_mapping(p_source_name text, p_player_id integer) FROM anon;
REVOKE EXECUTE ON FUNCTION afl.save_player_name_mapping(p_source_name text, p_player_id integer) FROM authenticated;

-- ── ai schema ──────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() FROM anon;
REVOKE EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() FROM authenticated;

-- ── market schema ──────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION market.build_market_watch_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION market.build_market_watch_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION market.build_market_watch_snapshot() FROM authenticated;

-- ── public schema — admin functions ────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.admin_toggle_team_bye(p_team_id integer, p_season integer, p_is_bye_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_team_bye(p_team_id integer, p_season integer, p_is_bye_active boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_team_bye(p_team_id integer, p_season integer, p_is_bye_active boolean) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(p_player_id integer, p_price integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(p_player_id integer, p_price integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(p_player_id integer, p_price integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(price_rows jsonb, p_round integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(price_rows jsonb, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(price_rows jsonb, p_round integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_player_status(p_player_id integer, p_status text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_player_status(p_player_id integer, p_status text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_player_status(p_player_id integer, p_status text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_team_bye(p_team_id integer, p_season integer, p_bye_round integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_team_bye(p_team_id integer, p_season integer, p_bye_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_team_bye(p_team_id integer, p_season integer, p_bye_round integer) FROM authenticated;

-- ── public schema — pipeline functions ─────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_price_round(p_rows jsonb, p_season integer, p_round integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave(p_limit_players integer, p_page_offset integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave(p_limit_players integer, p_page_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave(p_limit_players integer, p_page_offset integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_range(p_limit_players integer, p_player_id_gte integer, p_player_id_lt integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_range(p_limit_players integer, p_player_id_gte integer, p_player_id_lt integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_range(p_limit_players integer, p_player_id_gte integer, p_player_id_lt integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_shard(p_shard integer, p_total_shards integer, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_shard(p_shard integer, p_total_shards integer, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_shard(p_shard integer, p_total_shards integer, p_limit integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_refresh_edge_board() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_edge_board() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_edge_board() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_refresh_market_watch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_market_watch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_market_watch() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.populate_mv_edge_board() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.populate_mv_edge_board() FROM anon;
REVOKE EXECUTE ON FUNCTION public.populate_mv_edge_board() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.populate_rankings_cache_from_source() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.populate_rankings_cache_from_source() FROM anon;
REVOKE EXECUTE ON FUNCTION public.populate_rankings_cache_from_source() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.run_afl_processing_core() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_afl_processing_core() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_afl_processing_core() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.run_afl_worker_ingestion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_afl_worker_ingestion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_afl_worker_ingestion() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.run_neeko_pipeline() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_neeko_pipeline() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_neeko_pipeline() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.save_pending_price_rows(p_rows jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_pending_price_rows(p_rows jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_pending_price_rows(p_rows jsonb) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.save_player_name_mapping(p_source_name text, p_player_id integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_player_name_mapping(p_source_name text, p_player_id integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_player_name_mapping(p_source_name text, p_player_id integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.truncate_and_regenerate_ai() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.truncate_and_regenerate_ai() FROM anon;
REVOKE EXECUTE ON FUNCTION public.truncate_and_regenerate_ai() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_recommendation text, p_summary_short text, p_summary_long text, p_color text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric, p_prompt_version text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_recommendation text, p_summary_short text, p_summary_long text, p_color text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric, p_prompt_version text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_recommendation text, p_summary_short text, p_summary_long text, p_color text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric, p_prompt_version text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_summary_short text, p_summary_long text, p_recommendation text, p_color text, p_prompt_version text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_summary_short text, p_summary_long text, p_recommendation text, p_color text, p_prompt_version text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_summary_short text, p_summary_long text, p_recommendation text, p_color text, p_prompt_version text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.write_ai_summary(p_player text, p_ai_summary text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.write_ai_summary(p_player text, p_ai_summary text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.write_ai_summary(p_player text, p_ai_summary text) FROM authenticated;

-- Re-grant to service_role explicitly so the pipeline continues to work
GRANT EXECUTE ON FUNCTION public.fn_refresh_edge_board() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_refresh_market_watch() TO service_role;
GRANT EXECUTE ON FUNCTION public.populate_mv_edge_board() TO service_role;
GRANT EXECUTE ON FUNCTION public.populate_rankings_cache_from_source() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_afl_processing_core() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_afl_worker_ingestion() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_neeko_pipeline() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave(p_limit_players integer, p_page_offset integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_range(p_limit_players integer, p_player_id_gte integer, p_player_id_lt integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fire_ai_worker_wave_shard(p_shard integer, p_total_shards integer, p_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_recommendation text, p_summary_short text, p_summary_long text, p_color text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric, p_prompt_version text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(p_player_id integer, p_summary_short text, p_summary_long text, p_recommendation text, p_color text, p_prompt_version text, p_input_hash text, p_stored_projection numeric, p_stored_price numeric) TO service_role;
GRANT EXECUTE ON FUNCTION afl.populate_rankings_cache_from_source() TO service_role;
GRANT EXECUTE ON FUNCTION afl.rebuild_player_projection() TO service_role;
GRANT EXECUTE ON FUNCTION afl.refresh_mv_player_projection() TO service_role;
GRANT EXECUTE ON FUNCTION afl.refresh_mv_player_rankings() TO service_role;
GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() TO service_role;
