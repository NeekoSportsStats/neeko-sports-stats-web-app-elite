/*
  # Add Unique Indexes Required for 2026 Upsert Operations

  ## Purpose
  The transformation functions use ON CONFLICT upserts which require unique
  indexes on the target columns. This migration adds those indexes safely.

  ## Changes

  ### afl.player_round_stats_2025
  - Adds a unique index on (player, season, round_number, match_index)
  - Required for fn_transform_raw_stats_to_canonical ON CONFLICT clause
  - Uses CREATE UNIQUE INDEX IF NOT EXISTS — safe to run multiple times
  - Will not conflict with existing data (verified: no duplicates expected)

  ### afl.team_defense_profile_2026
  - Adds a unique index on (team, season)
  - Required for fn_update_team_defense_profile ON CONFLICT clause

  ## Notes
  - Uses CONCURRENTLY where safe to avoid locking production queries
  - IF NOT EXISTS prevents errors on re-run
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_prs_uq_player_season_round_match
  ON afl.player_round_stats_2025 (player, season, round_number, match_index);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_defense_2026_uq_team_season
  ON afl.team_defense_profile_2026 (team, season);
