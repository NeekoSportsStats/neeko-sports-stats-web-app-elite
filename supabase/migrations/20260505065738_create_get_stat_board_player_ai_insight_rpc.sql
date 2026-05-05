/*
  # Create get_stat_board_player_ai_insight RPC

  ## Summary
  Lightweight RPC that returns the AI-generated insight text for a player
  from afl.player_rankings_cache. Used by the stat board expanded panel's
  AI Insight section.

  ## Returns
  - player_id
  - summary_short — 1–2 sentence briefing
  - summary_long  — 3–4 sentence full analysis
  - recommendation_short — e.g. "Strong hold candidate"
  - recommendation_color — "green" | "amber" | "red" | null

  ## Security
  - SECURITY DEFINER reads through RLS on player_rankings_cache
  - GRANT to anon, authenticated (same as other stat board RPCs)
  - Only reads non-sensitive AI text fields — no financial or PII data
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_player_ai_insight(
  p_player_id integer
)
RETURNS TABLE(
  player_id            integer,
  summary_short        text,
  summary_long         text,
  recommendation_short text,
  recommendation_color text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    c.player_id,
    c.summary_short,
    c.summary_long,
    c.recommendation_short,
    c.recommendation_color
  FROM afl.player_rankings_cache c
  WHERE c.player_id = p_player_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_ai_insight TO anon, authenticated;
