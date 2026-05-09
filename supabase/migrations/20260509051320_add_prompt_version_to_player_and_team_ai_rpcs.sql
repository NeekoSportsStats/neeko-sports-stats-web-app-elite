/*
  # Add prompt_version to player and team AI summary RPCs

  ## Changes

  ### 1. get_stat_board_player_ai_insight
  Drop and recreate to include `ai_prompt_version` from `afl.player_rankings_cache`,
  returned as `prompt_version` so the frontend can gate stale AI content.

  ### 2. get_team_ai_summary
  Drop and recreate to include `prompt_version` from `afl.ai_team_summaries`.

  ## Why
  The frontend version-checks AI content against known prompt version strings.
  Without this column the frontend cannot distinguish v15/v16 (stale) from v17
  (current), so stale summaries would display as premium analysis.

  ## Security
  Both functions are SECURITY DEFINER. anon and authenticated retain EXECUTE access.
*/

-- ── Player AI insight RPC ──────────────────────────────────────────────────────

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
SET search_path = public, afl
AS $$
  SELECT
    c.player_id::integer,
    c.summary_short,
    c.summary_long,
    c.ai_generated_at,
    c.ai_prompt_version AS prompt_version
  FROM afl.player_rankings_cache c
  WHERE c.player_id = p_player_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_ai_insight(integer) TO anon, authenticated;

-- ── Team AI summary RPC ────────────────────────────────────────────────────────

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
