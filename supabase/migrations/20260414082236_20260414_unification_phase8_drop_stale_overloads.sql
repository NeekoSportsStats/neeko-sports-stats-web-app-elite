/*
  # Phase 8 — Drop Stale RPC Overloads

  ## Problem
  Three RPCs have stale overloads that still point to afl.v_rankings_core:
  - get_position_players_safe (3-arg version without p_is_bot)
  - get_similar_players_safe (7-arg version with different param order)
  - get_team_players_safe (3-arg version without p_limit)

  These were superseded by new overloads during Phase 3 repointing.
  Dropping them ensures no caller can accidentally hit the stale version.
*/

-- Drop old get_position_players_safe (3-arg, no p_is_bot)
DROP FUNCTION IF EXISTS public.get_position_players_safe(
  p_position_code text,
  p_user_id uuid,
  p_limit integer
);

-- Drop old get_similar_players_safe (param order: p_limit before p_is_bot)
DROP FUNCTION IF EXISTS public.get_similar_players_safe(
  p_player_id integer,
  p_position text,
  p_projection_min numeric,
  p_projection_max numeric,
  p_user_id uuid,
  p_limit integer,
  p_is_bot boolean
);

-- Drop old get_team_players_safe (3-arg, no p_limit)
DROP FUNCTION IF EXISTS public.get_team_players_safe(
  p_team text,
  p_user_id uuid,
  p_is_bot boolean
);
