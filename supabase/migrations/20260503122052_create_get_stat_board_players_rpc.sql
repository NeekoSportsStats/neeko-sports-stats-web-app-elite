/*
  # Create get_stat_board_players RPC

  Main data contract for the AFL Stat Board player list.

  Computes per-player rolling raw-stat averages and projections directly from
  afl.player_games — no fantasy projection model tables are used.

  ## Projection formulae (MVP)
  - Disposals: (last_3_avg * 0.45) + (last_10_avg * 0.30) + (season_avg * 0.25), rounded to nearest integer
  - Goals:     (last_3_avg * 0.35) + (last_10_avg * 0.35) + (season_avg * 0.30), rounded to 1 decimal place

  ## Key design decisions
  - stat_lens ('disposals' | 'goals') drives which stat is aggregated for rolling avgs,
    projection, hit_rate etc. Other stats are always available on the row.
  - p_threshold: optional "hit" threshold for hit_rate_last_10 (e.g. 20 for "20+ disposals")
    Defaults to: disposals → 20, goals → 1 when null.
  - confidence_label: LOW (< 5 games), MEDIUM (5–9), HIGH (10+)
  - hit_rate_last_10: proportion of last-10 games where stat >= threshold (0.0–1.0)
  - next_game_date / venue / opponent: from afl.v_next_games (next scheduled game per team)
  - is_home: derived by comparing player's team_id to next game's home_team_id

  ## Sources
  - afl.player_games       — canonical per-game raw stats
  - afl.games              — game metadata (venue, date, opponent)
  - afl.players            — player registry (position_group, active, manual_status)
  - afl.v_next_games       — next upcoming fixture per team

  ## NOT used
  - afl.player_projection, afl.mv_player_projection, afl.feature_player_form,
    afl.player_rankings_cache — all fantasy model tables are excluded by design.
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_players(
  p_season      integer  DEFAULT 2026,
  p_round       integer  DEFAULT NULL,
  p_match_id    integer  DEFAULT NULL,
  p_stat_lens   text     DEFAULT 'disposals',
  p_threshold   numeric  DEFAULT NULL,
  p_position    text     DEFAULT NULL,
  p_team_name   text     DEFAULT NULL,
  p_search      text     DEFAULT NULL,
  p_limit       integer  DEFAULT 200,
  p_offset      integer  DEFAULT 0
)
RETURNS TABLE (
  player_id           integer,
  player_name         text,
  team_name           text,
  opponent_team_name  text,
  match_id            integer,
  game_id             integer,
  round               text,
  season              integer,
  position_group      text,
  stat_lens           text,
  last_10_values      numeric[],
  last_10_avg         numeric,
  last_5_avg          numeric,
  last_3_avg          numeric,
  season_avg          numeric,
  min_last_10         numeric,
  max_last_10         numeric,
  games_played        integer,
  projection          numeric,
  threshold           numeric,
  hit_count_last_10   integer,
  hit_rate_last_10    numeric,
  confidence_label    text,
  next_game_date      timestamptz,
  venue               text,
  is_home             boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_effective_threshold numeric;
  v_lens                text;
BEGIN
  -- Normalise stat_lens; only 'disposals' and 'goals' are supported for MVP
  v_lens := lower(coalesce(p_stat_lens, 'disposals'));
  IF v_lens NOT IN ('disposals', 'goals') THEN
    v_lens := 'disposals';
  END IF;

  -- Default threshold when not supplied
  v_effective_threshold := CASE
    WHEN p_threshold IS NOT NULL THEN p_threshold
    WHEN v_lens = 'disposals'    THEN 20
    ELSE 1
  END;

  RETURN QUERY
  WITH
  -- ── 1. Season game log per player ─────────────────────────────────────────
  season_games AS (
    SELECT
      pg.player_id,
      pg.player_name,
      pg.team_id,
      pg.team_name,
      pg.season,
      pg.week,
      pg.round,
      pg.game_id,
      -- Opponent name from the joined games row
      CASE
        WHEN pg.team_id = g.home_team_id THEN g.away_team_name
        ELSE g.home_team_name
      END AS opponent_team_name,
      g.venue,
      g.game_id AS g_game_id,
      -- Stat value for the chosen lens
      CASE v_lens
        WHEN 'disposals' THEN pg.disposals::numeric
        ELSE pg.goals::numeric
      END AS stat_val
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.season = p_season
  ),

  -- ── 2. Row-number windows per player ──────────────────────────────────────
  ranked_games AS (
    SELECT
      sg.*,
      ROW_NUMBER() OVER (PARTITION BY sg.player_id ORDER BY sg.week DESC) AS rn
    FROM season_games sg
  ),

  -- ── 3. Last-10 slice per player ────────────────────────────────────────────
  last10 AS (
    SELECT
      player_id,
      -- Collect last-10 values as an array (most recent first)
      array_agg(stat_val ORDER BY week DESC) FILTER (WHERE rn <= 10) AS vals,
      COUNT(*)                               FILTER (WHERE rn <= 10) AS cnt,
      AVG(stat_val)                          FILTER (WHERE rn <= 10) AS avg10,
      AVG(stat_val)                          FILTER (WHERE rn <= 5)  AS avg5,
      AVG(stat_val)                          FILTER (WHERE rn <= 3)  AS avg3,
      AVG(stat_val)                                                    AS avg_season,
      MIN(stat_val)                          FILTER (WHERE rn <= 10) AS min10,
      MAX(stat_val)                          FILTER (WHERE rn <= 10) AS max10,
      COUNT(*)                                                         AS total_games,
      -- Hit count: games where stat >= threshold (last 10 only)
      COUNT(*) FILTER (WHERE rn <= 10 AND stat_val >= v_effective_threshold) AS hit_cnt
    FROM ranked_games
    GROUP BY player_id
  ),

  -- ── 4. Most recent game context per player ─────────────────────────────────
  latest_game AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      team_id,
      team_name,
      round,
      game_id,
      opponent_team_name,
      venue
    FROM ranked_games
    WHERE rn = 1
    ORDER BY player_id, week DESC
  ),

  -- ── 5. Next upcoming fixture per team (from existing view) ────────────────
  next_fixtures AS (
    SELECT
      ng.team_id,
      ng.game_date         AS next_game_date,
      ng.venue             AS next_venue,
      ng.home_team_id,
      ng.home_team_name,
      ng.away_team_name,
      ng.game_id           AS next_game_id
    FROM afl.v_next_games ng
  ),

  -- ── 6. Player registry ────────────────────────────────────────────────────
  player_reg AS (
    SELECT
      p.player_id,
      p.position_group,
      p.active,
      p.manual_status
    FROM afl.players p
    WHERE p.active = true
      AND (p.manual_status IS NULL OR p.manual_status NOT IN ('INACTIVE', 'DELISTED'))
  ),

  -- ── 7. Assemble final rows ─────────────────────────────────────────────────
  assembled AS (
    SELECT
      lg.player_id,
      lg.player_name,
      lg.team_name,
      -- Opponent from latest completed game (context for the round filter scenario)
      -- When p_round is supplied, this will be the opponent for that round
      lg.opponent_team_name,
      lg.game_id                              AS match_id,
      lg.game_id,
      lg.round,
      p_season                                AS season,
      pr.position_group,
      v_lens                                  AS stat_lens,
      l.vals                                  AS last_10_values,
      ROUND(l.avg10,    2)                    AS last_10_avg,
      ROUND(l.avg5,     2)                    AS last_5_avg,
      ROUND(l.avg3,     2)                    AS last_3_avg,
      ROUND(l.avg_season, 2)                  AS season_avg,
      l.min10                                 AS min_last_10,
      l.max10                                 AS max_last_10,
      l.total_games::integer                  AS games_played,
      -- Projection formula
      CASE v_lens
        WHEN 'disposals' THEN
          ROUND(
            COALESCE(l.avg3,       l.avg_season) * 0.45 +
            COALESCE(l.avg10,      l.avg_season) * 0.30 +
            COALESCE(l.avg_season, l.avg10)      * 0.25
          , 0)
        ELSE -- goals
          ROUND(
            COALESCE(l.avg3,       l.avg_season) * 0.35 +
            COALESCE(l.avg10,      l.avg_season) * 0.35 +
            COALESCE(l.avg_season, l.avg10)      * 0.30
          , 1)
      END                                     AS projection,
      v_effective_threshold                   AS threshold,
      l.hit_cnt::integer                      AS hit_count_last_10,
      CASE
        WHEN l.cnt > 0 THEN ROUND(l.hit_cnt::numeric / l.cnt, 3)
        ELSE 0
      END                                     AS hit_rate_last_10,
      -- Confidence label based on games with data in last 10
      CASE
        WHEN l.cnt >= 10 THEN 'HIGH'
        WHEN l.cnt >= 5  THEN 'MEDIUM'
        ELSE 'LOW'
      END                                     AS confidence_label,
      nf.next_game_date,
      nf.next_venue                           AS venue,
      -- is_home: player's team is home team in next fixture
      (lg.team_id = nf.home_team_id)          AS is_home
    FROM latest_game lg
    JOIN last10       l  ON l.player_id  = lg.player_id
    JOIN player_reg   pr ON pr.player_id = lg.player_id
    LEFT JOIN next_fixtures nf ON nf.team_id = lg.team_id
  )

  SELECT
    a.player_id,
    a.player_name,
    a.team_name,
    a.opponent_team_name,
    a.match_id,
    a.game_id,
    a.round,
    a.season,
    a.position_group,
    a.stat_lens,
    a.last_10_values,
    a.last_10_avg,
    a.last_5_avg,
    a.last_3_avg,
    a.season_avg,
    a.min_last_10,
    a.max_last_10,
    a.games_played,
    a.projection,
    a.threshold,
    a.hit_count_last_10,
    a.hit_rate_last_10,
    a.confidence_label,
    a.next_game_date,
    a.venue,
    a.is_home
  FROM assembled a
  WHERE
    -- Position filter
    (p_position IS NULL OR a.position_group ILIKE p_position)
    -- Team filter
    AND (p_team_name IS NULL OR a.team_name ILIKE '%' || p_team_name || '%')
    -- Search by player name
    AND (p_search IS NULL OR a.player_name ILIKE '%' || p_search || '%')
    -- Must have at least 1 game to appear
    AND a.games_played >= 1
  ORDER BY a.last_10_avg DESC NULLS LAST
  LIMIT  LEAST(p_limit, 500)
  OFFSET p_offset;
END;
$$;

-- Grant execute to anon and authenticated for frontend access
GRANT EXECUTE ON FUNCTION public.get_stat_board_players(
  integer, integer, integer, text, numeric, text, text, text, integer, integer
) TO anon, authenticated;


-- ── Validation queries ───────────────────────────────────────────────────────

-- Test 1: get_stat_board_player_history for Patrick Cripps (player_id = 1096)
-- SELECT * FROM public.get_stat_board_player_history(1096, 2026, 10);

-- Test 2: get_stat_board_players — all MIDs, disposals lens
-- SELECT player_name, team_name, games_played, last_3_avg, last_10_avg, season_avg,
--        projection, hit_count_last_10, hit_rate_last_10, confidence_label
-- FROM public.get_stat_board_players(2026, NULL, NULL, 'disposals', 20, 'MID', NULL, NULL, 20, 0);

-- Test 3: get_stat_board_players — goals lens, search for Cripps
-- SELECT player_name, last_3_avg, season_avg, projection, hit_rate_last_10
-- FROM public.get_stat_board_players(2026, NULL, NULL, 'goals', 1, NULL, NULL, 'Cripps', 5, 0);
