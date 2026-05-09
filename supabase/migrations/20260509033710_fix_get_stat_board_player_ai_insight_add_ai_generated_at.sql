/*
  # Fix get_stat_board_player_ai_insight — add ai_generated_at to return set

  ## Problem
  The RPC `get_stat_board_player_ai_insight` was missing `ai_generated_at` in its return
  columns. The frontend `StatBoardPlayerAiInsight` interface declared this field, but the
  RPC never populated it — the timestamp was always silently null.

  ## Fix
  Drop and recreate the RPC to include `ai_generated_at` from `afl.player_rankings_cache`.
  All other behaviour is unchanged.

  ## Fields returned
  - player_id
  - summary_short
  - summary_long
  - ai_generated_at  ← ADDED
*/

DROP FUNCTION IF EXISTS public.get_stat_board_player_ai_insight(integer);

CREATE OR REPLACE FUNCTION public.get_stat_board_player_ai_insight(
  p_player_id integer
)
RETURNS TABLE (
  player_id       integer,
  summary_short   text,
  summary_long    text,
  ai_generated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl, ai
AS $$
  SELECT
    c.player_id::integer,
    c.summary_short,
    c.summary_long,
    c.ai_generated_at
  FROM afl.player_rankings_cache c
  WHERE c.player_id = p_player_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_ai_insight(integer) TO anon, authenticated;
