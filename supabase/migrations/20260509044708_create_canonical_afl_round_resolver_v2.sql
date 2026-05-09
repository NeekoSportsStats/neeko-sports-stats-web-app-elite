/*
  # Canonical AFL Round Resolver v2

  ## Summary
  Create a single source of truth for "current AFL round" that correctly uses
  game status from afl.games_raw (status_short = 'FT'/'NS'/'LIVE') rather than
  score data from afl.games (which is never populated from the API).

  ## Root cause of existing bugs
  - get_latest_completed_round() used `afl.games WHERE home_score > 0` — but
    afl.games.home_score is NEVER populated (always 0). Returns 0 always. Wrong.
  - Stat board resolved_round used MAX(week) FROM afl.player_games — this works
    for historical stats but is independent of game completion status.
  - No unified source: Index.tsx, stat board, and rankings each use different RPCs.

  ## Architecture
  afl.games_raw is the authoritative status table (status_short: 'FT'/'NS'/'LIVE').
  afl.games shares game_id with games_raw and provides fixture metadata.
  afl.player_games has stats for completed games only.

  ## Correct rollover logic
  - Current round = lowest round where ANY game is NOT yet FT (still active/upcoming).
  - Stays on round N even if only 1 of 9 games remains NS or LIVE.
  - Rolls to round N+1 only when ALL games in round N have status_short = 'FT'.
  - If all rounds are complete: stays on last completed round (end-of-season safe state).

  ## New objects
  1. afl.v_game_completion  — per-game status join (games + games_raw)
  2. afl.v_round_completion — per-round completion summary
  3. public.get_current_afl_round_safe() — rich metadata, single canonical source
  4. public.v_current_afl_round — convenience view
  5. public.get_latest_completed_round() — rebuilt: highest round where ALL games are FT
  6. public.debug_afl_round_state() — diagnostic query for Supabase SQL editor
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-game completion status
--    Joins afl.games (fixtures) with afl.games_raw (live status)
--    games_raw is populated by the afl-worker-games-player-stats edge function
--    games_raw.game_id matches afl.games.game_id directly
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW afl.v_game_completion AS
SELECT
  g.game_id,
  g.season,
  g.week,
  g.round,
  g.game_date,
  g.home_team_id,
  g.home_team_name,
  g.away_team_id,
  g.away_team_name,
  -- Status from games_raw (authoritative). NULL means not yet ingested.
  COALESCE(gr.status_short, 'NS') AS status_short,
  CASE COALESCE(gr.status_short, 'NS')
    WHEN 'FT'   THEN 'complete'
    WHEN 'LIVE' THEN 'in_progress'
    ELSE             'upcoming'
  END AS status_group,
  -- A game is done only when status_short is exactly 'FT'
  (COALESCE(gr.status_short, 'NS') = 'FT') AS is_complete,
  gr.home_score,
  gr.away_score,
  gr.updated_at AS status_updated_at
FROM afl.games g
LEFT JOIN afl.games_raw gr
  ON  gr.game_id = g.game_id
  AND gr.season  = g.season;

GRANT SELECT ON afl.v_game_completion TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-round completion summary
--    is_round_complete = TRUE only when every game in that round is FT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW afl.v_round_completion AS
SELECT
  season,
  week,
  MAX(round)                                                AS round_label,
  MIN(game_date)                                            AS round_start_time,
  MAX(game_date)                                            AS round_last_game_time,
  COUNT(*)                                                  AS total_games,
  COUNT(*) FILTER (WHERE is_complete)                       AS completed_games,
  COUNT(*) FILTER (WHERE status_group = 'in_progress')      AS in_progress_games,
  COUNT(*) FILTER (WHERE status_group = 'upcoming')         AS upcoming_games,
  -- Complete only when EVERY game is FT
  (COUNT(*) FILTER (WHERE is_complete) = COUNT(*))          AS is_round_complete,
  -- Active when any game is not yet FT
  (COUNT(*) FILTER (WHERE NOT is_complete) > 0)             AS has_incomplete_games
FROM afl.v_game_completion
GROUP BY season, week;

GRANT SELECT ON afl.v_round_completion TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Canonical current round resolver
--
-- Returns the round the app should display + rich metadata.
-- current_round = lowest round with any incomplete game.
-- If all rounds complete: highest completed round (end-of-season).
-- should_rollover = true only when ALL games in current_round are FT AND
-- a next round exists with fixtures.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_current_afl_round_safe(integer);

CREATE FUNCTION public.get_current_afl_round_safe(
  p_season integer DEFAULT 2026
)
RETURNS TABLE (
  current_season    integer,
  current_round     integer,
  round_label       text,
  round_status      text,
  round_start_time  timestamptz,
  round_end_time    timestamptz,
  total_games       integer,
  completed_games   integer,
  in_progress_games integer,
  upcoming_games    integer,
  next_round        integer,
  should_rollover   boolean,
  reason            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_current_round   integer;
  v_next_round      integer;
  v_max_round       integer;
  v_total           integer;
  v_completed       integer;
  v_in_progress     integer;
  v_upcoming        integer;
  v_round_label     text;
  v_start_time      timestamptz;
  v_end_time        timestamptz;
BEGIN
  -- Highest fixture week this season
  SELECT MAX(week) INTO v_max_round
  FROM afl.games WHERE season = p_season;

  -- Pre-season: no fixtures at all
  IF v_max_round IS NULL THEN
    RETURN QUERY SELECT
      p_season, 0, 'Pre-Season'::text, 'pre_season'::text,
      NULL::timestamptz, NULL::timestamptz,
      0, 0, 0, 0, NULL::integer, false,
      'No fixtures loaded for this season'::text;
    RETURN;
  END IF;

  -- Find the lowest round with any incomplete (non-FT) game.
  -- That round is "current" — we must NOT roll over until it is fully done.
  SELECT MIN(rc.week) INTO v_current_round
  FROM afl.v_round_completion rc
  WHERE rc.season = p_season
    AND rc.has_incomplete_games = true;

  -- All rounds complete → end-of-season: stay on last completed round
  IF v_current_round IS NULL THEN
    SELECT MAX(rc.week) INTO v_current_round
    FROM afl.v_round_completion rc
    WHERE rc.season = p_season
      AND rc.is_round_complete = true;
  END IF;

  -- Final safety: use max round if somehow still null
  v_current_round := COALESCE(v_current_round, v_max_round);

  -- Next round with fixtures
  SELECT MIN(week) INTO v_next_round
  FROM afl.games
  WHERE season = p_season AND week > v_current_round;

  -- Stats for current round
  SELECT
    rc.round_label,
    rc.round_start_time,
    rc.round_last_game_time,
    rc.total_games::integer,
    rc.completed_games::integer,
    rc.in_progress_games::integer,
    rc.upcoming_games::integer
  INTO v_round_label, v_start_time, v_end_time, v_total, v_completed, v_in_progress, v_upcoming
  FROM afl.v_round_completion rc
  WHERE rc.season = p_season AND rc.week = v_current_round;

  RETURN QUERY SELECT
    p_season,
    v_current_round,
    COALESCE(v_round_label, 'Round ' || v_current_round),
    -- round_status
    CASE
      WHEN v_in_progress > 0                            THEN 'active'
      WHEN v_upcoming > 0 AND v_completed = 0           THEN 'upcoming'
      WHEN v_upcoming > 0 AND v_completed > 0           THEN 'active'
      WHEN v_completed = v_total AND v_total > 0         THEN 'complete'
      ELSE 'upcoming'
    END::text,
    v_start_time,
    v_end_time,
    COALESCE(v_total, 0),
    COALESCE(v_completed, 0),
    COALESCE(v_in_progress, 0),
    COALESCE(v_upcoming, 0),
    v_next_round,
    -- should_rollover: ALL games FT AND next round exists
    (v_completed = v_total AND v_total > 0 AND v_next_round IS NOT NULL),
    -- Human-readable reason
    CASE
      WHEN v_in_progress > 0 THEN
        format('%s/%s complete, %s in progress — holding round %s', v_completed, v_total, v_in_progress, v_current_round)
      WHEN v_upcoming > 0 THEN
        format('%s/%s complete, %s upcoming — holding round %s', v_completed, v_total, v_upcoming, v_current_round)
      WHEN v_completed = v_total AND v_total > 0 AND v_next_round IS NOT NULL THEN
        format('All %s games complete — ready to roll to round %s', v_total, v_next_round)
      WHEN v_completed = v_total AND v_total > 0 AND v_next_round IS NULL THEN
        format('All %s games complete — end of season, holding round %s', v_total, v_current_round)
      ELSE 'No game data for this round'
    END::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_afl_round_safe(integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_current_afl_round_safe IS
  'Canonical current round. Uses afl.games_raw status_short to determine completion.
   Stays on current round until ALL games are FT. Single source of truth.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Convenience view (refreshes on every select)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_current_afl_round AS
SELECT * FROM public.get_current_afl_round_safe(2026);

GRANT SELECT ON public.v_current_afl_round TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Rebuild get_latest_completed_round
--
-- OLD (WRONG): MAX(week) WHERE home_score > 0 from afl.games
--   - afl.games.home_score is NEVER populated (always 0) — function always returned 0
--   - Even if scores were populated, rolling on first score = wrong mid-round
--
-- NEW (CORRECT): MAX(week) of rounds where is_round_complete = true
--   - Uses afl.games_raw.status_short = 'FT' as completion signal
--   - Only returns N when EVERY game in round N has status FT
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_latest_completed_round(integer);

CREATE FUNCTION public.get_latest_completed_round(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_result integer;
BEGIN
  -- Highest round where every single game has status_short = 'FT'
  SELECT MAX(rc.week)
  INTO v_result
  FROM afl.v_round_completion rc
  WHERE rc.season = p_season
    AND rc.is_round_complete = true;

  -- 0 = no round fully complete yet (pre-season / opening round in progress)
  RETURN COALESCE(v_result, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_completed_round(integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_latest_completed_round IS
  'Returns highest round where ALL games have status_short=FT in afl.games_raw.
   Returns 0 if no round is fully complete. Correct mid-round: does not roll over
   until the last game of the round finishes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Diagnostic function — run in Supabase SQL editor to debug round state
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debug_afl_round_state(
  p_season integer DEFAULT 2026
)
RETURNS TABLE (
  week              integer,
  round_label       text,
  total_games       integer,
  completed_games   integer,
  in_progress_games integer,
  upcoming_games    integer,
  is_round_complete boolean,
  is_current_round  boolean,
  note              text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_current_round integer;
BEGIN
  SELECT cr.current_round INTO v_current_round
  FROM public.get_current_afl_round_safe(p_season) cr;

  RETURN QUERY
  SELECT
    rc.week::integer,
    COALESCE(rc.round_label, 'Round ' || rc.week)::text,
    rc.total_games::integer,
    rc.completed_games::integer,
    rc.in_progress_games::integer,
    rc.upcoming_games::integer,
    rc.is_round_complete,
    (rc.week = v_current_round),
    CASE
      WHEN rc.week = v_current_round AND NOT rc.is_round_complete THEN
        format('← CURRENT: %s/%s complete, %s upcoming, %s live',
          rc.completed_games, rc.total_games, rc.upcoming_games, rc.in_progress_games)
      WHEN rc.week = v_current_round AND rc.is_round_complete THEN
        '← CURRENT (complete, end of season)'
      WHEN rc.is_round_complete      THEN 'complete'
      WHEN rc.in_progress_games > 0  THEN 'in progress'
      WHEN rc.week < v_current_round THEN 'past'
      ELSE 'future fixture'
    END::text
  FROM afl.v_round_completion rc
  WHERE rc.season = p_season
  ORDER BY rc.week;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_afl_round_state(integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.debug_afl_round_state IS
  'Diagnostic: run SELECT * FROM public.debug_afl_round_state() to see per-round
   completion state and confirm which round the app believes is current.';
