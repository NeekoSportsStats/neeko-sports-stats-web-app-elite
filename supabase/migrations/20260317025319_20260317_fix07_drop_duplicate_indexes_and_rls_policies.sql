/*
  # Fix 07: Drop duplicate indexes and RLS policies

  ## Problem
  Audit found:

  1. Duplicate indexes on afl.raw_player_stats:
     - idx_raw_player_stats_game + idx_stats_game (both on game_id)
     - idx_raw_player_stats_player + idx_stats_player (both on player_id)
     Duplicate indexes waste storage and slow down writes for zero benefit.

  2. Duplicate RLS policies on public.profiles:
     - "Allow user to read own profile" + "profiles_select_own" (both SELECT)
     - "Allow user to update own profile" + "profiles_update_own" (both UPDATE)
     Duplicate policies with identical logic add overhead to every query.

  ## Solution
  Drop the newer (shorter-named) duplicates — keep the original verbose names
  as they are more descriptive and were presumably the intended canonical versions.

  ## Indexes dropped
  - idx_stats_game   (duplicate of idx_raw_player_stats_game on game_id)
  - idx_stats_player (duplicate of idx_raw_player_stats_player on player_id)

  ## Policies dropped
  - profiles_select_own (duplicate of "Allow user to read own profile")
  - profiles_update_own (duplicate of "Allow user to update own profile")
*/

-- ── Duplicate indexes ─────────────────────────────────────────────────────────

DROP INDEX IF EXISTS afl.idx_stats_game;
DROP INDEX IF EXISTS afl.idx_stats_player;

-- ── Duplicate RLS policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
