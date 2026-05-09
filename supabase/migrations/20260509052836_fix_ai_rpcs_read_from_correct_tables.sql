/*
  # Fix AI RPCs to read from correct tables

  ## Problem
  Both AI insight RPCs were rebuilt yesterday pointing at wrong sources:
  - get_stat_board_player_ai_insight → was reading afl.player_rankings_cache (empty AI cols)
    → must read ai.player_ai_analysis (has summary_short, summary_long, prompt_version)
  - get_team_ai_summary → column list correct but needs to confirm it reads afl.ai_team_summaries

  ## Changes
  1. Drop and recreate get_stat_board_player_ai_insight to read from ai.player_ai_analysis
  2. Drop and recreate get_team_ai_summary to read from afl.ai_team_summaries
  3. Both return prompt_version so frontend can gate stale v<17 content

  ## Security
  SECURITY DEFINER; anon + authenticated get EXECUTE.
*/

-- ── Player AI insight: read from ai.player_ai_analysis ────────────────────────

DROP FUNCTION IF EXISTS public.get_stat_board_player_ai_insight(integer);

CREATE FUNCTION public.get_stat_board_player_ai_insight(p_player_id integer)
RETURNS TABLE (
  player_id       integer,
  summary_short   text,
  summary_long    text,
  ai_generated_at timestamptz,
  prompt_version  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, ai, afl
AS $$
  SELECT
    a.player_id,
    a.summary_short,
    a.summary_long,
    a.generated_at AS ai_generated_at,
    a.prompt_version
  FROM ai.player_ai_analysis a
  WHERE a.player_id = p_player_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_ai_insight(integer) TO anon, authenticated;

-- ── Team AI summary: read from afl.ai_team_summaries ─────────────────────────

DROP FUNCTION IF EXISTS public.get_team_ai_summary(text, integer);

CREATE FUNCTION public.get_team_ai_summary(p_team text, p_season integer DEFAULT 2026)
RETURNS TABLE (
  team            text,
  season          integer,
  round_number    integer,
  summary         text,
  fantasy_verdict text,
  updated_at      timestamptz,
  prompt_version  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT
    s.team,
    s.season,
    s.round_number,
    s.summary,
    s.fantasy_verdict,
    s.updated_at,
    s.prompt_version
  FROM afl.ai_team_summaries s
  WHERE s.team = p_team
    AND s.season = p_season
  ORDER BY s.round_number DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_ai_summary(text, integer) TO anon, authenticated;
