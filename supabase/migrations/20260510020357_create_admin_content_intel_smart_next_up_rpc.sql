/*
  # Admin Content Intel — Smart Next-Up RPC

  Private admin-only function. NOT exposed to public app, public pages, or round rollover logic.

  ## Purpose
  Returns per-team target game resolution for the Content Intel "Smart Next-Up" mode.
  For each AFL team in the current season:
  - Determines the canonical current round (via public.get_current_afl_round_safe)
  - Finds the team's current-round game and its status
  - Determines has_played_current_round (status_short = 'FT')
  - Finds the next scheduled game for that team (next round fixture)
  - Returns target_game_id, target_round, target_opponent, target_game_date for each team

  ## Security
  - SECURITY DEFINER — runs as postgres/service role
  - Admin guard: only callable by users with is_admin = true in profiles table
  - NOT accessible by anon or authenticated public users

  ## Notes
  - Does not change public.get_current_afl_round_safe()
  - Does not change any public round logic
  - Does not affect Stat Board, Fantasy Hub, or any public page
  - Status 'FT' = finished game (only known status in afl.games_raw for 2026)
*/

CREATE OR REPLACE FUNCTION public.admin_get_smart_next_up_targets(
  p_season integer DEFAULT 2026
)
RETURNS TABLE (
  team_id             integer,
  team_name           text,
  -- Current round context
  current_round       integer,
  current_game_id     integer,
  current_game_date   timestamptz,
  current_opponent_id   integer,
  current_opponent_name text,
  current_game_status   text,  -- 'FT', 'NS', 'Q1', 'Q2', 'Q3', 'Q4', 'HT', etc.
  has_played_current_round boolean,
  -- Next-up context (next scheduled game after current round)
  next_game_id        integer,
  next_game_round     integer,
  next_game_date      timestamptz,
  next_opponent_id    integer,
  next_opponent_name  text,
  next_game_status    text,
  -- Target (derived by caller based on content mode)
  -- We return both so the frontend can apply any mode
  target_mode_suggestion text  -- 'next-up' | 'current-round' | 'bye' | 'no-fixture'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_current_round integer;
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Get canonical current round from existing public RPC
  SELECT (rpc.current_round) INTO v_current_round
  FROM public.get_current_afl_round_safe(p_season) rpc
  LIMIT 1;

  -- Fallback if canonical returns nothing
  IF v_current_round IS NULL THEN
    SELECT MAX(week) INTO v_current_round
    FROM afl.games_raw
    WHERE season = p_season AND status_short = 'FT';
  END IF;

  IF v_current_round IS NULL THEN
    v_current_round := 1;
  END IF;

  RETURN QUERY
  WITH
  -- All teams extracted from current season games
  all_teams AS (
    SELECT DISTINCT home_team_id AS tid, home_team_name AS tname
    FROM afl.games_raw WHERE season = p_season
    UNION
    SELECT DISTINCT away_team_id, away_team_name
    FROM afl.games_raw WHERE season = p_season
  ),
  -- Current round games per team
  current_games AS (
    SELECT
      t.tid,
      t.tname,
      g.game_id,
      g.game_date,
      g.status_short,
      CASE
        WHEN g.home_team_id = t.tid THEN g.away_team_id
        ELSE g.home_team_id
      END AS opp_id,
      CASE
        WHEN g.home_team_id = t.tid THEN g.away_team_name
        ELSE g.home_team_name
      END AS opp_name
    FROM all_teams t
    LEFT JOIN afl.games_raw g
      ON g.season = p_season
      AND g.week = v_current_round
      AND (g.home_team_id = t.tid OR g.away_team_id = t.tid)
  ),
  -- Next round games per team (smallest week > current_round)
  next_games AS (
    SELECT DISTINCT ON (t.tid)
      t.tid,
      g.game_id    AS next_gid,
      g.week       AS next_week,
      g.game_date  AS next_date,
      g.status_short AS next_status,
      CASE
        WHEN g.home_team_id = t.tid THEN g.away_team_id
        ELSE g.home_team_id
      END AS next_opp_id,
      CASE
        WHEN g.home_team_id = t.tid THEN g.away_team_name
        ELSE g.home_team_name
      END AS next_opp_name
    FROM all_teams t
    JOIN afl.games_raw g
      ON g.season = p_season
      AND g.week > v_current_round
      AND (g.home_team_id = t.tid OR g.away_team_id = t.tid)
    ORDER BY t.tid, g.week ASC, g.game_date ASC
  )
  SELECT
    cg.tid::integer                                AS team_id,
    cg.tname::text                                 AS team_name,
    v_current_round::integer                       AS current_round,
    cg.game_id::integer                            AS current_game_id,
    cg.game_date::timestamptz                      AS current_game_date,
    cg.opp_id::integer                             AS current_opponent_id,
    cg.opp_name::text                              AS current_opponent_name,
    COALESCE(cg.status_short, 'NS')::text          AS current_game_status,
    -- has_played = status is FT (Finished) — the only completed status in 2026 data
    (COALESCE(cg.status_short, 'NS') = 'FT')       AS has_played_current_round,
    ng.next_gid::integer                           AS next_game_id,
    ng.next_week::integer                          AS next_game_round,
    ng.next_date::timestamptz                      AS next_game_date,
    ng.next_opp_id::integer                        AS next_opponent_id,
    ng.next_opp_name::text                         AS next_opponent_name,
    COALESCE(ng.next_status, 'NS')::text           AS next_game_status,
    CASE
      WHEN cg.game_id IS NULL THEN 'bye'
      WHEN COALESCE(cg.status_short, 'NS') = 'FT' AND ng.next_gid IS NOT NULL THEN 'next-up'
      WHEN COALESCE(cg.status_short, 'NS') = 'FT' AND ng.next_gid IS NULL THEN 'no-fixture'
      ELSE 'current-round'
    END::text                                      AS target_mode_suggestion
  FROM current_games cg
  LEFT JOIN next_games ng ON ng.tid = cg.tid
  ORDER BY cg.tname;
END;
$$;

-- Revoke public access — admin only
REVOKE ALL ON FUNCTION public.admin_get_smart_next_up_targets(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_smart_next_up_targets(integer) TO service_role;
