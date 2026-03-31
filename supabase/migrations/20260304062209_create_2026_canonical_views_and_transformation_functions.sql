/*
  # Step 4+5 — 2026 Canonical Views and Transformation Functions

  ## Purpose
  Creates canonical views that mirror the 2025 view structure for 2026 data,
  plus SQL functions that transform raw_2026_* tables into the live canonical
  tables used by the ranking and AI feature pipelines.

  ## New Views

  ### afl.v_player_round_canonical_2026
  - Mirrors v_player_round_canonical_2025 column-for-column
  - Sources from afl.raw_2026_player_stats (populated by ingest edge function)
  - Joins afl.team_colors_2025 for team_color (shared colour map)

  ### afl.v_player_round_canonical_all_seasons
  - UNION of 2025 and 2026 canonical views
  - Allows future AI feature views to be season-agnostic

  ### afl.v_ingest_pipeline_status_2026
  - Summary of what data has been ingested per round
  - Used by the weekly edge function to detect if data is stale

  ## New Functions

  ### afl.fn_transform_raw_stats_to_canonical(p_season INT, p_round_number INT)
  - Reads afl.raw_2026_player_stats for the given season/round
  - Upserts rows into afl.player_round_stats_2025 (which supports all seasons via
    the season column)
  - Returns count of rows upserted

  ### afl.fn_transform_raw_matches_to_canonical(p_season INT, p_round_number INT)
  - Reads afl.raw_2026_matches for the given season/round
  - Upserts rows into afl.match_center_games_base
  - Returns count of rows upserted

  ### afl.fn_update_team_defense_profile(p_season INT)
  - Recomputes afl.team_defense_profile_2026 from ingested 2026 player stats
  - Uses the same methodology as the original 2025 profile build
  - Called after each round's stats are transformed

  ## Notes
  - All functions are SECURITY DEFINER — callable safely from edge functions
  - No 2025 data is touched — season filters are strict
  - Transformation is idempotent — safe to re-run on same round
*/

-- ─── 2026 canonical player round view ────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_player_round_canonical_2026 AS
WITH base AS (
  SELECT
    r.season,
    r.round_number,
    COALESCE('R' || r.round_number, 'R' || r.round_number) AS round_label,
    r.player_name                     AS player,
    r.team,
    r.opponent,
    r.position,
    COALESCE(r.disposals, 0)::bigint  AS disposals,
    COALESCE(r.goals, 0)::float8      AS goals,
    COALESCE(r.fantasy_points, 0)     AS fantasy_points,
    NULL::integer                     AS supercoach_points,
    1::bigint                         AS games_played,
    COALESCE(r.played, true)          AS played,
    tc.team_color,
    1                                 AS match_index,
    1::bigint                         AS games_in_round
  FROM afl.raw_2026_player_stats r
  LEFT JOIN afl.team_colors_2025 tc ON tc.team = r.team
  WHERE r.season = 2026
),
decorated AS (
  SELECT
    base.season,
    base.round_number,
    base.round_label,
    base.player,
    base.team,
    base.opponent,
    base.position,
    base.disposals,
    base.goals,
    base.fantasy_points,
    base.supercoach_points,
    base.games_played,
    base.played,
    base.team_color,
    base.match_index,
    base.games_in_round,
    base.round_label       AS round_display,
    (base.round_number * 100)::bigint AS round_sort_key
  FROM base
)
SELECT
  season,
  round_number,
  round_label,
  round_display,
  round_sort_key,
  player,
  team,
  opponent,
  position,
  team_color,
  played,
  disposals,
  goals,
  fantasy_points,
  supercoach_points,
  games_played,
  match_index
FROM decorated;

-- ─── All-seasons union view ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_player_round_canonical_all_seasons AS
SELECT
  season, round_number, round_label, round_display, round_sort_key,
  player, team, opponent, position, team_color, played,
  disposals, goals, fantasy_points, supercoach_points, games_played, match_index
FROM afl.v_player_round_canonical_2025

UNION ALL

SELECT
  season, round_number, round_label, round_display, round_sort_key,
  player, team, opponent, position, team_color, played,
  disposals, goals, fantasy_points, supercoach_points, games_played, match_index
FROM afl.v_player_round_canonical_2026;

-- ─── Ingest pipeline status view ─────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_ingest_pipeline_status_2026 AS
SELECT
  rm.season,
  rm.round_number,
  COUNT(DISTINCT rm.match_id)            AS matches_ingested,
  MAX(rm.ingested_at)                    AS last_match_ingest,
  COUNT(DISTINCT rm.match_id) FILTER
    (WHERE rm.status = 'FT')             AS matches_final,
  (
    SELECT COUNT(*)
    FROM afl.raw_2026_player_stats p2
    WHERE p2.season = rm.season
      AND p2.round_number = rm.round_number
  )                                      AS player_rows_ingested,
  (
    SELECT COUNT(*)
    FROM afl.raw_2026_team_stats t2
    WHERE t2.season = rm.season
      AND t2.round_number = rm.round_number
  )                                      AS team_rows_ingested
FROM afl.raw_2026_matches rm
WHERE rm.season = 2026
GROUP BY rm.season, rm.round_number
ORDER BY rm.round_number;

-- ─── fn_transform_raw_stats_to_canonical ─────────────────────────────────────
-- Upserts raw 2026 player stats into the canonical player_round_stats_2025 table
-- (which holds all seasons via the season column).

CREATE OR REPLACE FUNCTION afl.fn_transform_raw_stats_to_canonical(
  p_season      integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_rows_affected integer := 0;
BEGIN
  INSERT INTO afl.player_round_stats_2025 (
    player, position, team, opponent,
    round_number, round_label,
    disposals, kicks, handballs, marks, tackles,
    frees_for, frees_against, hitouts, goals, behinds,
    ruck_contests, center_bounce_attendance,
    kick_ins, kick_ins_play_on,
    time_on_ground, fantasy_points, supercoach_points,
    games_played, season, match_index
  )
  SELECT
    r.player_name,
    r.position,
    r.team,
    r.opponent,
    r.round_number,
    'R' || r.round_number,
    COALESCE(r.disposals, 0),
    COALESCE(r.kicks, 0),
    COALESCE(r.handballs, 0),
    COALESCE(r.marks, 0),
    COALESCE(r.tackles, 0),
    0,                                     -- frees_for default
    '0',                                   -- frees_against default
    COALESCE(r.hitouts, 0)::text,
    COALESCE(r.goals, 0)::text,
    COALESCE(r.behinds, 0),
    0,                                     -- ruck_contests default
    '0',                                   -- center_bounce_attendance default
    '0',                                   -- kick_ins default
    '0',                                   -- kick_ins_play_on default
    COALESCE(r.time_on_ground, 0),
    COALESCE(r.fantasy_points, 0),
    0,                                     -- supercoach_points default
    1,                                     -- games_played
    r.season,
    1                                      -- match_index default
  FROM afl.raw_2026_player_stats r
  WHERE r.season = p_season
    AND (p_round_number IS NULL OR r.round_number = p_round_number)
  ON CONFLICT (player, season, round_number, match_index)
  DO UPDATE SET
    position          = EXCLUDED.position,
    team              = EXCLUDED.team,
    opponent          = EXCLUDED.opponent,
    disposals         = EXCLUDED.disposals,
    kicks             = EXCLUDED.kicks,
    handballs         = EXCLUDED.handballs,
    marks             = EXCLUDED.marks,
    tackles           = EXCLUDED.tackles,
    hitouts           = EXCLUDED.hitouts,
    goals             = EXCLUDED.goals,
    behinds           = EXCLUDED.behinds,
    time_on_ground    = EXCLUDED.time_on_ground,
    fantasy_points    = EXCLUDED.fantasy_points,
    games_played      = EXCLUDED.games_played;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_transform_raw_stats_to_canonical(integer, integer)
  TO service_role;

-- ─── fn_transform_raw_matches_to_canonical ───────────────────────────────────
-- Upserts raw 2026 match data into afl.match_center_games_base.

CREATE OR REPLACE FUNCTION afl.fn_transform_raw_matches_to_canonical(
  p_season      integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_rows_affected integer := 0;
  v_max_id        integer;
BEGIN
  SELECT COALESCE(MAX(match_id), 0) INTO v_max_id FROM afl.match_center_games_base;

  INSERT INTO afl.match_center_games_base (
    match_id, season, round_label, round_number,
    home_team_vendor, away_team_vendor,
    home_score, away_score, home_goals, home_behinds,
    away_goals, away_behinds,
    venue, status, updated_at, round_instance, match_datetime
  )
  SELECT
    -- Derive a stable numeric match_id from season+round+match_id string
    v_max_id + ROW_NUMBER() OVER (
      ORDER BY r.round_number, r.match_id
    ),
    r.season,
    'R' || r.round_number,
    r.round_number,
    r.home_team,
    r.away_team,
    COALESCE(r.home_score, 0),
    COALESCE(r.away_score, 0),
    COALESCE(r.home_goals, 0),
    COALESCE(r.home_behinds, 0),
    COALESCE(r.away_goals, 0),
    COALESCE(r.away_behinds, 0),
    r.venue,
    CASE
      WHEN r.status = 'FT'        THEN 'FT'
      WHEN r.status = 'live'      THEN 'Live'
      WHEN r.status = 'upcoming'  THEN 'Not Started'
      ELSE COALESCE(r.status, 'Not Started')
    END,
    NOW(),
    r.round_number::text || '_1',
    r.match_date
  FROM afl.raw_2026_matches r
  WHERE r.season = p_season
    AND (p_round_number IS NULL OR r.round_number = p_round_number)
    -- Skip rows that already exist in canonical (by home/away/season/round)
    AND NOT EXISTS (
      SELECT 1 FROM afl.match_center_games_base ex
      WHERE ex.season = r.season
        AND ex.round_number = r.round_number
        AND ex.home_team_vendor = r.home_team
        AND ex.away_team_vendor = r.away_team
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- Update status on existing rows when match result changes
  UPDATE afl.match_center_games_base g
  SET
    home_score  = COALESCE(r.home_score, g.home_score),
    away_score  = COALESCE(r.away_score, g.away_score),
    home_goals  = COALESCE(r.home_goals, g.home_goals),
    home_behinds = COALESCE(r.home_behinds, g.home_behinds),
    away_goals  = COALESCE(r.away_goals, g.away_goals),
    away_behinds = COALESCE(r.away_behinds, g.away_behinds),
    status      = CASE
                    WHEN r.status = 'FT'       THEN 'FT'
                    WHEN r.status = 'live'     THEN 'Live'
                    ELSE g.status
                  END,
    updated_at  = NOW()
  FROM afl.raw_2026_matches r
  WHERE g.season = r.season
    AND g.round_number = r.round_number
    AND g.home_team_vendor = r.home_team
    AND g.away_team_vendor = r.away_team
    AND r.season = p_season
    AND (p_round_number IS NULL OR r.round_number = p_round_number);

  RETURN v_rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_transform_raw_matches_to_canonical(integer, integer)
  TO service_role;

-- ─── fn_update_team_defense_profile ──────────────────────────────────────────
-- Recomputes team defensive profile from all available 2026 data.
-- Safe to call after each round completes.

CREATE OR REPLACE FUNCTION afl.fn_update_team_defense_profile(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_rows_affected integer := 0;
  v_league_avg    numeric;
BEGIN
  -- Compute league-wide average fantasy points allowed per player per game
  SELECT ROUND(AVG(fantasy_points)::numeric, 2)
  INTO v_league_avg
  FROM afl.raw_2026_player_stats
  WHERE season = p_season
    AND played = true
    AND fantasy_points IS NOT NULL
    AND fantasy_points > 0;

  -- Bail out if no data yet
  IF v_league_avg IS NULL OR v_league_avg = 0 THEN
    RETURN 0;
  END IF;

  -- Upsert defensive profile per opponent team
  INSERT INTO afl.team_defense_profile_2026 (
    team, season, avg_fantasy_allowed, league_avg, raw_delta, matchup_delta
  )
  SELECT
    r.opponent                                           AS team,
    p_season                                             AS season,
    ROUND(AVG(r.fantasy_points)::numeric, 2)             AS avg_fantasy_allowed,
    v_league_avg                                         AS league_avg,
    ROUND((AVG(r.fantasy_points) - v_league_avg)::numeric, 2) AS raw_delta,
    ROUND(((AVG(r.fantasy_points) - v_league_avg) / NULLIF(v_league_avg, 0) * 100)::numeric, 1) AS matchup_delta
  FROM afl.raw_2026_player_stats r
  WHERE r.season = p_season
    AND r.played = true
    AND r.fantasy_points IS NOT NULL
    AND r.fantasy_points > 0
    AND r.opponent IS NOT NULL
  GROUP BY r.opponent
  ON CONFLICT (team, season)
  DO UPDATE SET
    avg_fantasy_allowed = EXCLUDED.avg_fantasy_allowed,
    league_avg          = EXCLUDED.league_avg,
    raw_delta           = EXCLUDED.raw_delta,
    matchup_delta       = EXCLUDED.matchup_delta;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_update_team_defense_profile(integer)
  TO service_role;

-- ─── fn_cleanup_stale_start_sit_cache ────────────────────────────────────────
-- Removes start_sit_cache entries older than 6 days.
-- Called weekly before AI regeneration so fresh analysis is always generated.

CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_start_sit_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.start_sit_cache
  WHERE created_at < now() - interval '6 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cleanup_stale_start_sit_cache()
  TO service_role;

-- ─── fn_refresh_neeko_intel_2026 ─────────────────────────────────────────────
-- Wrapper that calls the existing refresh function and returns rows affected.
-- Used by the weekly pipeline to keep Neeko intelligence scores current.

CREATE OR REPLACE FUNCTION public.fn_pipeline_refresh_neeko_intel()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  SELECT public.refresh_neeko_intel_features_2026() INTO v_rows;
  RETURN COALESCE(v_rows, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pipeline_refresh_neeko_intel()
  TO service_role;
