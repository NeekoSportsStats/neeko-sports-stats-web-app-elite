/*
  # Archive Obsolete AFL AI Views

  ## Summary
  Safe archival of obsolete and superseded AI pipeline views.
  All renamed using ALTER VIEW ... RENAME TO — no views deleted.

  ## Active Views — UNTOUCHED (protected)
  - afl.v_ai_player_openai_inputs_2026_next_round
  - afl.v_ai_team_openai_inputs_2026_next_round
  - afl.v_ai_match_openai_inputs_2026_next_round
  - afl.v_neeko_player_projection
  - afl.v_ai_team_features_2026_next_round
  - afl.v_match_player_stats_2025
  - afl.v_match_scatter_2025
  - afl.v_match_team_momentum_2025
  - afl.v_match_events_2025
  - afl.v_match_event_scoring_2025
  - afl.v_match_event_margin_2025
  - afl.v_match_quarter_momentum_2025
  - afl.v_match_quarters_2025
  - afl.player_round_with_colors
  - afl.player_season_totals_2025
  - afl.v_player_round_canonical_2025
  - afl.v_team_round_canonical_2025

  ## Views Archived
  1. v_ai_player_projection_2025 → archive_v_ai_player_projection_2025 (superseded by 2026 pipeline)
  2. v_ai_player_projection_final_2025 → archive_v_ai_player_projection_final_2025
  3. v_ai_player_recent_form_2025 → archive_v_ai_player_recent_form_2025
  4. v_ai_player_rolling_2025 → archive_v_ai_player_rolling_2025
  5. v_ai_player_season_avg_2025 → archive_v_ai_player_season_avg_2025
  6. v_ai_player_vs_opponent_2025 → archive_v_ai_player_vs_opponent_2025
  7. v_ai_player_expected_2025 → archive_v_ai_player_expected_2025
  8. v_ai_probability_2025 → archive_v_ai_probability_2025
  9. v_ai_matchup_context_2025 → archive_v_ai_matchup_context_2025
  10. v_ai_risk_profile_2025 → archive_v_ai_risk_profile_2025
  11. v_ai_match_summary_source_2025 → archive_v_ai_match_summary_source_2025
  12. v_ai_team_profile_source_2025 → archive_v_ai_team_profile_source_2025
  13. v_ai_team_defense_2025 → archive_v_ai_team_defense_2025
  14. v_ai_projection_latest_2025 → archive_v_ai_projection_latest_2025
  15. v_ai_team_prediction_engine_old → archive_v_ai_team_prediction_engine_old
  16. v_ai_prompt_builder → archive_v_ai_prompt_builder
  17. v_neeko_elite_prediction_engine_v4 → archive_v_neeko_elite_prediction_engine_v4 (view-level)
  18. neeko_elite_prediction_engine_v4 → archive_neeko_elite_prediction_engine_v4 (bare table-level)
  19. v_neeko_elite_predictions_v2 → archive_v_neeko_elite_predictions_v2
  20. v_neeko_elite_predictions_v3 → archive_v_neeko_elite_predictions_v3
  21. z_archive_games_flat_v2 → archive_z_archive_games_flat_v2 (already flagged for archive)

  ## Notes
  - No DROP statements used — rename only
  - All active 2026 pipeline views protected
  - All frontend match centre views protected
*/

-- 2025 player AI views (superseded by 2026 pipeline)
ALTER VIEW IF EXISTS afl.v_ai_player_projection_2025 RENAME TO archive_v_ai_player_projection_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_projection_final_2025 RENAME TO archive_v_ai_player_projection_final_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_recent_form_2025 RENAME TO archive_v_ai_player_recent_form_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_rolling_2025 RENAME TO archive_v_ai_player_rolling_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_season_avg_2025 RENAME TO archive_v_ai_player_season_avg_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_vs_opponent_2025 RENAME TO archive_v_ai_player_vs_opponent_2025;
ALTER VIEW IF EXISTS afl.v_ai_player_expected_2025 RENAME TO archive_v_ai_player_expected_2025;

-- 2025 probability / matchup / risk views
ALTER VIEW IF EXISTS afl.v_ai_probability_2025 RENAME TO archive_v_ai_probability_2025;
ALTER VIEW IF EXISTS afl.v_ai_matchup_context_2025 RENAME TO archive_v_ai_matchup_context_2025;
ALTER VIEW IF EXISTS afl.v_ai_risk_profile_2025 RENAME TO archive_v_ai_risk_profile_2025;

-- 2025 match / team source views
ALTER VIEW IF EXISTS afl.v_ai_match_summary_source_2025 RENAME TO archive_v_ai_match_summary_source_2025;
ALTER VIEW IF EXISTS afl.v_ai_team_profile_source_2025 RENAME TO archive_v_ai_team_profile_source_2025;
ALTER VIEW IF EXISTS afl.v_ai_team_defense_2025 RENAME TO archive_v_ai_team_defense_2025;

-- Explicitly named obsolete views
ALTER VIEW IF EXISTS afl.v_ai_projection_latest_2025 RENAME TO archive_v_ai_projection_latest_2025;
ALTER VIEW IF EXISTS afl.v_ai_team_prediction_engine_old RENAME TO archive_v_ai_team_prediction_engine_old;
ALTER VIEW IF EXISTS afl.v_ai_prompt_builder RENAME TO archive_v_ai_prompt_builder;

-- Old Neeko Elite prediction engine versions
ALTER VIEW IF EXISTS afl.v_neeko_elite_prediction_engine_v4 RENAME TO archive_v_neeko_elite_prediction_engine_v4;
ALTER VIEW IF EXISTS afl.neeko_elite_prediction_engine_v4 RENAME TO archive_neeko_elite_prediction_engine_v4;
ALTER VIEW IF EXISTS afl.v_neeko_elite_predictions_v2 RENAME TO archive_v_neeko_elite_predictions_v2;
ALTER VIEW IF EXISTS afl.v_neeko_elite_predictions_v3 RENAME TO archive_v_neeko_elite_predictions_v3;

-- Already-flagged z_archive view
ALTER VIEW IF EXISTS afl.z_archive_games_flat_v2 RENAME TO archive_z_archive_games_flat_v2;
