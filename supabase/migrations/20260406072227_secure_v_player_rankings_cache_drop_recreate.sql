/*
  # Secure v_player_rankings_cache — Drop and Recreate as Public-Safe View

  ## Summary
  The public view `v_player_rankings_cache` exposed all 90+ columns from the internal
  `afl.player_rankings_cache` table to unauthenticated (anon) users — including all
  premium analytics. This migration closes that bypass.

  ## Changes

  ### 1. Drop existing view and its dependencies
  Drops only the public proxy view. The underlying `afl.player_rankings_cache` table
  and all safe RPC functions are unaffected (they query the table directly, not the view).

  ### 2. Recreate view — public-safe columns only
  Columns included (safe for free/public):
    - Identity: player_id, player_name, team, team_name, position, position_group
    - Pricing: price, prev_price, price_change, price_change_pct
    - Basic stats: projection_final, season_avg, last_3_avg, last_5_avg, games_played
    - Status/availability: status, manual_status, is_bye, bye_round, bye_next_round, is_available, team_id
    - Signal label tags (string only): signal_canonical, category_canonical, signal_tag
    - Timestamps: cached_at, created_at

  ### 3. Grants
  - SELECT only for anon and authenticated
  - No write access

  ### Notes
  - All safe RPCs (get_rankings_safe, get_market_watch_safe, get_edge_board_data,
    get_player_detail_safe) query afl.player_rankings_cache directly — UNAFFECTED
  - Frontend pages using this view directly must only select the columns listed above
*/

-- Step 1: Revoke all excess write grants before dropping
REVOKE DELETE, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES
  ON public.v_player_rankings_cache
  FROM anon, authenticated;

-- Step 2: Drop the existing view (CASCADE to drop any dependent public views that also expose full data)
DROP VIEW IF EXISTS public.v_player_rankings_cache CASCADE;

-- Step 3: Recreate as a public-safe, narrow view
CREATE VIEW public.v_player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  price,
  prev_price,
  price_change,
  price_change_pct,
  projection_final,
  season_avg,
  last_3_avg,
  last_5_avg,
  games_played,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  team_id,
  signal_canonical,
  category_canonical,
  signal_tag,
  cached_at,
  created_at
FROM afl.player_rankings_cache;

-- Step 4: Grant SELECT only
GRANT SELECT ON public.v_player_rankings_cache TO anon, authenticated;
GRANT SELECT ON public.v_player_rankings_cache TO service_role;
