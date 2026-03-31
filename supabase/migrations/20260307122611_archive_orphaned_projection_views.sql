/*
  # Fix 3 — Archive orphaned projection views

  ## Views archived

  ### afl.v_neeko_player_projection_v2
  An alternate additive projection formula that was never connected to any
  downstream consumer. References the archived AI matchup pipeline via
  afl.v_ai_projection_2026_matchup_adjusted. Safe to archive.

  ### afl.v_neeko_player_projection_v3
  A broken multiplicative projection formula (multiplies all adjustment terms
  together instead of adding them). Produces near-zero or extreme results when
  trend_3_vs_10 or matchup_delta are small/negative. Never consumed downstream.
  Safe to archive.

  ### afl.v_neeko_elite_prediction_engine_v5
  A team-level (not player-level) prediction engine that reads from an already-
  archived table (archive_neeko_elite_prediction_engine_v4). Disconnected from
  the player projection pipeline entirely. Safe to archive.

  ## Method
  Views are renamed with the archive_ prefix. No views are dropped.
  Documentation comments are added to each archived view.
*/

-- Archive v2
ALTER VIEW afl.v_neeko_player_projection_v2
    RENAME TO archive_v_neeko_player_projection_v2;

COMMENT ON VIEW afl.archive_v_neeko_player_projection_v2 IS
'ARCHIVED — orphaned additive projection formula, replaced by v_neeko_player_projection_final. No downstream consumers. References archived AI matchup pipeline.';


-- Archive v3
ALTER VIEW afl.v_neeko_player_projection_v3
    RENAME TO archive_v_neeko_player_projection_v3;

COMMENT ON VIEW afl.archive_v_neeko_player_projection_v3 IS
'ARCHIVED — broken multiplicative projection formula (multiplies trend * matchup * ceiling instead of adding them). Produces near-zero or extreme results when adjustments are small or negative. Never consumed downstream. Replaced by v_neeko_player_projection_final.';


-- Archive elite prediction engine v5
ALTER VIEW afl.v_neeko_elite_prediction_engine_v5
    RENAME TO archive_v_neeko_elite_prediction_engine_v5;

COMMENT ON VIEW afl.archive_v_neeko_elite_prediction_engine_v5 IS
'ARCHIVED — team-level (not player-level) prediction engine, disconnected from the player projection pipeline. Reads from archive_neeko_elite_prediction_engine_v4 which is itself archived. No active downstream consumers.';
