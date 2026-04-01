/*
  # Remove RPC Overloads - Phase 2.6 Cleanup

  CRITICAL FIX: Remove duplicate RPC function overloads that cause ambiguity

  ## Duplicates Removed:
  1. get_team_players_safe (2 versions → keep bot-aware version)
  2. get_similar_players_safe (2 versions → keep bot-aware version)

  ## Strategy:
  - KEEP bot-aware versions (with p_is_bot parameter)
  - DROP old versions (without p_is_bot parameter)
  - Frontend calls will work correctly (defaults to p_is_bot=false)

  ## Bot Handling:
  - Bots treated as FREE users (no premium access)
  - via get_access_context(p_user_id, p_is_bot)
  - Ensures SEO safety (no premium data to bots)
*/

-- Drop old version of get_team_players_safe (without p_is_bot)
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid);

-- Drop old version of get_similar_players_safe (without p_is_bot)
DROP FUNCTION IF EXISTS public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer);

-- Verify remaining functions
COMMENT ON FUNCTION public.get_team_players_safe(text, uuid, boolean) IS 
'Phase 2.6: Bot-aware version ONLY. Bots receive free tier data only via get_access_context.';

COMMENT ON FUNCTION public.get_similar_players_safe(integer, text, numeric, numeric, uuid, integer, boolean) IS 
'Phase 2.6: Bot-aware version ONLY. Bots receive free tier data only via get_access_context.';
