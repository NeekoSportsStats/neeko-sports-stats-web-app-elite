
/*
  # Add missing performance indexes

  ## Problem
  Several heavily-queried joins and filters lack indexes:
  - afl.player_games: no index on (season, week) composite for round queries
  - afl.players: no index on position_group for position-based filters
  - public.ai_player_content: no index on generated_at for staleness queries
  - public.ai_rankings_player_recos: no composite index on (player_id, updated_at)
  - afl.player_prices: no index on player_id for join performance
  - public.afl_player_prices: no composite index on (season, player_id)
  - public.system_logs: already indexed (created above)

  ## Changes
  Add 8 targeted indexes to improve view query performance.
*/

-- afl.player_games: composite for season+week round filtering
CREATE INDEX IF NOT EXISTS idx_pg_season_week
  ON afl.player_games (season, week);

-- afl.player_games: player + season for career stats
CREATE INDEX IF NOT EXISTS idx_pg_player_season
  ON afl.player_games (player_id, season);

-- afl.players: position group filter (used in every ranking view)
CREATE INDEX IF NOT EXISTS idx_players_position_group
  ON afl.players (position_group);

-- afl.player_prices: player_id join
CREATE INDEX IF NOT EXISTS idx_player_prices_player_id
  ON afl.player_prices (player_id);

-- public.ai_player_content: staleness + freshness queries
CREATE INDEX IF NOT EXISTS idx_ai_player_content_stale
  ON public.ai_player_content (player_id, generated_at DESC);

-- public.ai_rankings_player_recos: composite for freshness
CREATE INDEX IF NOT EXISTS idx_ai_recos_player_updated
  ON public.ai_rankings_player_recos (player_id, updated_at DESC);

-- public.afl_player_prices: season + player composite
CREATE INDEX IF NOT EXISTS idx_afl_player_prices_season_player
  ON public.afl_player_prices (season, player_id);

-- afl.raw_player_stats: season+week composite for round-based queries
CREATE INDEX IF NOT EXISTS idx_raw_stats_season_week
  ON afl.raw_player_stats (season, week);
