/*
  # Stat Accuracy Views and RPCs — Admin Player Lab

  ## Purpose
  Powers the new "Stat Accuracy" tab in the Admin Player Lab.
  Measures how accurate the stat-board rolling-average projections
  were versus actual game results for completed games.

  ## Important: No Pre-Game Snapshot Table Exists
  The stat-board projection system computes projections LIVE from rolling averages.
  There is no stored pre-game snapshot table.

  To produce honest accuracy data we reconstruct the "leave-one-out" projection:
  For each completed game for a player, we compute what the projection WOULD have
  been using only games PRIOR to that game (not including it). This is:
    - last_3_avg of prior games
    - last_10_avg of prior games
    - season_avg of prior games
  And apply the same blended formula: (last_3 × 0.45) + (last_10 × 0.30) + (season × 0.25)

  This is marked snapshot_valid = false / projection_source = 'leave_one_out_reconstructed'
  so the UI can clearly distinguish it from a true pre-game snapshot.

  For goals: (last_3 × 0.35) + (last_10 × 0.35) + (season × 0.30)

  ## Tables / Views Created
  1. afl.v_player_stat_accuracy_review — player-level stat accuracy rows
  2. afl.v_team_stat_accuracy_review   — team-level stat accuracy rows (score + disposals)
  3. public.get_player_stat_accuracy(season, week) — RPC
  4. public.get_team_stat_accuracy(season, week)   — RPC
  5. public.get_stat_accuracy_round_summary(season) — round summary RPC
  6. public.get_stat_accuracy_stat_type_summary(season) — stat type summary RPC

  ## Security
  All views/RPCs are admin-only (no anon access, no public RLS grants).
  No public cache is touched. No AI regeneration. No player names altered.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- View 1: Player stat accuracy (leave-one-out reconstructed projections)
-- Stat types: disposals, kicks, handballs, marks, tackles, goals, behinds,
--             hitouts, clearances, goal_assists, free_kicks_for, free_kicks_against
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_player_stat_accuracy_review AS
WITH
-- All completed games with player stats
completed_games AS (
  SELECT
    pg.game_id,
    pg.player_id,
    pg.player_name,
    pg.team_id,
    pg.team_name,
    pg.season,
    pg.week,
    pg.round,
    gr.game_date,
    gr.home_team_id,
    gr.away_team_id,
    gr.home_team_name,
    gr.away_team_name,
    pg.disposals,
    pg.kicks,
    pg.handballs,
    pg.marks,
    pg.tackles,
    pg.goals,
    pg.behinds,
    pg.hitouts,
    pg.clearances,
    pg.goal_assists,
    pg.free_kicks_for,
    pg.free_kicks_against
  FROM afl.player_games pg
  JOIN afl.games_raw gr ON gr.game_id = pg.game_id AND gr.status_short = 'FT'
  WHERE pg.season = 2026
    AND pg.fantasy_score IS NOT NULL
    AND pg.fantasy_score > 0
    AND pg.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
),

-- Per-player ordered game history for rolling window reconstruction
player_history AS (
  SELECT
    pg.game_id,
    pg.player_id,
    pg.team_id,
    pg.season,
    pg.week,
    gr.game_date,
    pg.disposals,
    pg.kicks,
    pg.handballs,
    pg.marks,
    pg.tackles,
    pg.goals,
    pg.behinds,
    pg.hitouts,
    pg.clearances,
    pg.goal_assists,
    pg.free_kicks_for,
    pg.free_kicks_against,
    ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY gr.game_date ASC, pg.game_id ASC) AS game_seq
  FROM afl.player_games pg
  JOIN afl.games_raw gr ON gr.game_id = pg.game_id AND gr.status_short = 'FT'
  WHERE pg.season = 2026
    AND pg.fantasy_score IS NOT NULL
    AND pg.fantasy_score > 0
    AND pg.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
),

-- Leave-one-out projections: for game N, use only games 1..(N-1)
loo_proj AS (
  SELECT
    h.game_id,
    h.player_id,
    h.game_seq,

    -- Disposals projection (prior games only)
    ROUND(
      COALESCE(AVG(p.disposals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.disposals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.disposals) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_disposals,

    -- Kicks
    ROUND(
      COALESCE(AVG(p.kicks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.kicks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.kicks) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_kicks,

    -- Handballs
    ROUND(
      COALESCE(AVG(p.handballs) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.handballs) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.handballs) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_handballs,

    -- Marks
    ROUND(
      COALESCE(AVG(p.marks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.marks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.marks) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_marks,

    -- Tackles
    ROUND(
      COALESCE(AVG(p.tackles) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.tackles) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.tackles) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_tackles,

    -- Goals (different formula: 0.35/0.35/0.30)
    ROUND(
      COALESCE(AVG(p.goals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.35 +
      COALESCE(AVG(p.goals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.35 +
      COALESCE(AVG(p.goals) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.30,
      1
    )::numeric AS proj_goals,

    -- Behinds
    ROUND(
      COALESCE(AVG(p.behinds) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.35 +
      COALESCE(AVG(p.behinds) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.35 +
      COALESCE(AVG(p.behinds) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.30,
      1
    )::numeric AS proj_behinds,

    -- Hitouts
    ROUND(
      COALESCE(AVG(p.hitouts) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.hitouts) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.hitouts) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_hitouts,

    -- Clearances
    ROUND(
      COALESCE(AVG(p.clearances) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 3 AND h.game_seq - 1), 0) * 0.45 +
      COALESCE(AVG(p.clearances) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 10 AND h.game_seq - 1), 0) * 0.30 +
      COALESCE(AVG(p.clearances) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.25
    )::numeric AS proj_clearances,

    -- Count prior games (determines if projection is valid — need >= 2 prior games)
    COUNT(*) FILTER (WHERE p.game_seq < h.game_seq) AS prior_game_count

  FROM player_history h
  LEFT JOIN player_history p ON p.player_id = h.player_id AND p.game_seq < h.game_seq
  GROUP BY h.game_id, h.player_id, h.game_seq
),

-- Unpivot stats into rows (one row per player-game-stat_key)
unpivoted AS (
  SELECT
    cg.game_id,
    cg.player_id,
    cg.player_name,
    cg.team_id,
    cg.team_name,
    cg.season,
    cg.week,
    cg.round,
    cg.game_date,
    CASE WHEN cg.team_id = cg.home_team_id THEN cg.away_team_name ELSE cg.home_team_name END AS opponent_team_name,
    lp.game_seq,
    lp.prior_game_count,
    v.stat_key,
    v.stat_label,
    v.projected_value,
    v.actual_value
  FROM completed_games cg
  JOIN loo_proj lp ON lp.game_id = cg.game_id AND lp.player_id = cg.player_id
  CROSS JOIN LATERAL (VALUES
    ('disposals',         'Disposals',       lp.proj_disposals,   cg.disposals::numeric),
    ('kicks',             'Kicks',           lp.proj_kicks,       cg.kicks::numeric),
    ('handballs',         'Handballs',       lp.proj_handballs,   cg.handballs::numeric),
    ('marks',             'Marks',           lp.proj_marks,       cg.marks::numeric),
    ('tackles',           'Tackles',         lp.proj_tackles,     cg.tackles::numeric),
    ('goals',             'Goals',           lp.proj_goals,       cg.goals::numeric),
    ('behinds',           'Behinds',         lp.proj_behinds,     cg.behinds::numeric),
    ('hitouts',           'Hitouts',         lp.proj_hitouts,     cg.hitouts::numeric),
    ('clearances',        'Clearances',      lp.proj_clearances,  cg.clearances::numeric),
    ('goal_assists',      'Goal Assists',    NULL::numeric,       cg.goal_assists::numeric),
    ('free_kicks_for',    'FK For',          NULL::numeric,       cg.free_kicks_for::numeric),
    ('free_kicks_against','FK Against',      NULL::numeric,       cg.free_kicks_against::numeric)
  ) AS v(stat_key, stat_label, projected_value, actual_value)
  WHERE v.actual_value IS NOT NULL
)

SELECT
  u.season,
  u.week                                               AS week_number,
  u.round                                              AS round_label,
  u.game_id,
  u.game_date,
  u.player_id,
  u.player_name,
  u.team_name                                          AS team,
  u.opponent_team_name                                 AS opponent,
  u.stat_key,
  u.stat_label,
  u.projected_value,
  u.actual_value,
  (u.actual_value - COALESCE(u.projected_value, 0))   AS signed_error,
  ABS(u.actual_value - COALESCE(u.projected_value, 0)) AS absolute_error,
  CASE
    WHEN u.projected_value IS NULL THEN NULL
    ELSE GREATEST(0, LEAST(100,
      100 - (ABS(u.actual_value - u.projected_value) /
             GREATEST(ABS(u.actual_value), ABS(u.projected_value), 1) * 100)
    ))
  END                                                  AS accuracy_pct,
  CASE
    WHEN u.projected_value IS NULL          THEN 'no_projection'
    WHEN u.projected_value > u.actual_value THEN 'over_projected'
    WHEN u.projected_value < u.actual_value THEN 'under_projected'
    ELSE                                         'exact'
  END                                                  AS error_direction,
  -- Threshold hits
  CASE WHEN u.projected_value IS NOT NULL THEN ABS(u.actual_value - u.projected_value) <= 1  END AS within_1,
  CASE WHEN u.projected_value IS NOT NULL THEN ABS(u.actual_value - u.projected_value) <= 2  END AS within_2,
  CASE WHEN u.projected_value IS NOT NULL THEN
    ABS(u.actual_value - u.projected_value) / GREATEST(ABS(u.actual_value), ABS(u.projected_value), 1) <= 0.05 END AS within_5_pct,
  CASE WHEN u.projected_value IS NOT NULL THEN
    ABS(u.actual_value - u.projected_value) / GREATEST(ABS(u.actual_value), ABS(u.projected_value), 1) <= 0.10 END AS within_10_pct,
  CASE WHEN u.projected_value IS NOT NULL THEN
    ABS(u.actual_value - u.projected_value) / GREATEST(ABS(u.actual_value), ABS(u.projected_value), 1) <= 0.15 END AS within_15_pct,
  CASE WHEN u.projected_value IS NOT NULL THEN
    ABS(u.actual_value - u.projected_value) / GREATEST(ABS(u.actual_value), ABS(u.projected_value), 1) <= 0.20 END AS within_20_pct,
  -- Snapshot metadata
  u.prior_game_count                                   AS prior_game_count,
  (u.projected_value IS NOT NULL AND u.prior_game_count >= 2) AS snapshot_valid,
  'leave_one_out_reconstructed'                        AS projection_source,
  CASE
    WHEN u.projected_value IS NULL           THEN 'No projection formula for this stat'
    WHEN u.prior_game_count < 2              THEN 'Insufficient prior games (< 2) — projection unreliable'
    WHEN u.prior_game_count < 5             THEN 'Early season — small sample (' || u.prior_game_count || ' prior games)'
    ELSE NULL
  END                                                  AS notes,
  'FT'                                                 AS game_status
FROM unpivoted u;

-- ─────────────────────────────────────────────────────────────────────────────
-- View 2: Team stat accuracy
-- Actual team stats: score/goals/behinds from games_raw,
--                    disposals/tackles/marks/kicks/handballs/clearances/hitouts
--                    aggregated from player_games
-- Projections: reconstructed leave-one-out rolling average of same aggregated stats
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_team_stat_accuracy_review AS
WITH
-- Build team-game-level actual aggregated stats
team_game_actuals AS (
  SELECT
    gr.game_id,
    gr.season,
    gr.week,
    gr.round,
    gr.game_date,
    -- Home team row
    gr.home_team_id                      AS team_id,
    gr.home_team_name                    AS team_name,
    gr.away_team_id                      AS opponent_id,
    gr.away_team_name                    AS opponent_name,
    true                                 AS is_home,
    gr.home_score                        AS actual_score,
    gr.home_goals                        AS actual_goals,
    gr.home_behinds                      AS actual_behinds,
    SUM(pg.disposals)  FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_disposals,
    SUM(pg.kicks)      FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_kicks,
    SUM(pg.handballs)  FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_handballs,
    SUM(pg.marks)      FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_marks,
    SUM(pg.tackles)    FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_tackles,
    SUM(pg.hitouts)    FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_hitouts,
    SUM(pg.clearances) FILTER (WHERE pg.team_id = gr.home_team_id) AS actual_clearances
  FROM afl.games_raw gr
  JOIN afl.player_games pg ON pg.game_id = gr.game_id AND pg.season = gr.season
  WHERE gr.status_short = 'FT' AND gr.season = 2026
  GROUP BY gr.game_id, gr.season, gr.week, gr.round, gr.game_date,
           gr.home_team_id, gr.home_team_name, gr.away_team_id, gr.away_team_name,
           gr.home_score, gr.home_goals, gr.home_behinds

  UNION ALL

  SELECT
    gr.game_id,
    gr.season,
    gr.week,
    gr.round,
    gr.game_date,
    -- Away team row
    gr.away_team_id                      AS team_id,
    gr.away_team_name                    AS team_name,
    gr.home_team_id                      AS opponent_id,
    gr.home_team_name                    AS opponent_name,
    false                                AS is_home,
    gr.away_score                        AS actual_score,
    gr.away_goals                        AS actual_goals,
    gr.away_behinds                      AS actual_behinds,
    SUM(pg.disposals)  FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_disposals,
    SUM(pg.kicks)      FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_kicks,
    SUM(pg.handballs)  FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_handballs,
    SUM(pg.marks)      FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_marks,
    SUM(pg.tackles)    FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_tackles,
    SUM(pg.hitouts)    FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_hitouts,
    SUM(pg.clearances) FILTER (WHERE pg.team_id = gr.away_team_id) AS actual_clearances
  FROM afl.games_raw gr
  JOIN afl.player_games pg ON pg.game_id = gr.game_id AND pg.season = gr.season
  WHERE gr.status_short = 'FT' AND gr.season = 2026
  GROUP BY gr.game_id, gr.season, gr.week, gr.round, gr.game_date,
           gr.home_team_id, gr.home_team_name, gr.away_team_id, gr.away_team_name,
           gr.away_score, gr.away_goals, gr.away_behinds
),

-- Ordered team game sequence for leave-one-out rolling
team_history AS (
  SELECT
    tga.*,
    ROW_NUMBER() OVER (PARTITION BY tga.team_id ORDER BY tga.game_date ASC, tga.game_id ASC) AS game_seq
  FROM team_game_actuals tga
),

-- Leave-one-out team projections
team_loo AS (
  SELECT
    h.game_id,
    h.team_id,
    h.game_seq,

    ROUND(
      COALESCE(AVG(p.actual_score) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_score) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_score,

    ROUND(
      COALESCE(AVG(p.actual_goals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_goals) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40, 1
    )::numeric AS proj_goals,

    ROUND(
      COALESCE(AVG(p.actual_behinds) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_behinds) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40, 1
    )::numeric AS proj_behinds,

    ROUND(
      COALESCE(AVG(p.actual_disposals) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_disposals) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_disposals,

    ROUND(
      COALESCE(AVG(p.actual_kicks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_kicks) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_kicks,

    ROUND(
      COALESCE(AVG(p.actual_handballs) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_handballs) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_handballs,

    ROUND(
      COALESCE(AVG(p.actual_marks) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_marks) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_marks,

    ROUND(
      COALESCE(AVG(p.actual_tackles) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_tackles) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_tackles,

    ROUND(
      COALESCE(AVG(p.actual_hitouts) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_hitouts) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_hitouts,

    ROUND(
      COALESCE(AVG(p.actual_clearances) FILTER (WHERE p.game_seq BETWEEN h.game_seq - 5 AND h.game_seq - 1), 0) * 0.60 +
      COALESCE(AVG(p.actual_clearances) FILTER (WHERE p.game_seq < h.game_seq), 0) * 0.40
    )::numeric AS proj_clearances,

    COUNT(*) FILTER (WHERE p.game_seq < h.game_seq) AS prior_game_count

  FROM team_history h
  LEFT JOIN team_history p ON p.team_id = h.team_id AND p.game_seq < h.game_seq
  GROUP BY h.game_id, h.team_id, h.game_seq
),

-- Unpivot team stats
team_unpivoted AS (
  SELECT
    th.game_id,
    th.season,
    th.week,
    th.round,
    th.game_date,
    th.team_id,
    th.team_name,
    th.opponent_name,
    tl.prior_game_count,
    v.stat_key,
    v.stat_label,
    v.projected_value,
    v.actual_value
  FROM team_history th
  JOIN team_loo tl ON tl.game_id = th.game_id AND tl.team_id = th.team_id
  CROSS JOIN LATERAL (VALUES
    ('score',      'Team Score',  tl.proj_score,     th.actual_score::numeric),
    ('goals',      'Goals',       tl.proj_goals,     th.actual_goals::numeric),
    ('behinds',    'Behinds',     tl.proj_behinds,   th.actual_behinds::numeric),
    ('disposals',  'Disposals',   tl.proj_disposals, th.actual_disposals),
    ('kicks',      'Kicks',       tl.proj_kicks,     th.actual_kicks),
    ('handballs',  'Handballs',   tl.proj_handballs, th.actual_handballs),
    ('marks',      'Marks',       tl.proj_marks,     th.actual_marks),
    ('tackles',    'Tackles',     tl.proj_tackles,   th.actual_tackles),
    ('hitouts',    'Hitouts',     tl.proj_hitouts,   th.actual_hitouts),
    ('clearances', 'Clearances',  tl.proj_clearances,th.actual_clearances)
  ) AS v(stat_key, stat_label, projected_value, actual_value)
  WHERE v.actual_value IS NOT NULL
)

SELECT
  tu.season,
  tu.week                                              AS week_number,
  tu.round                                             AS round_label,
  tu.game_id,
  tu.game_date,
  tu.team_name                                         AS team,
  tu.opponent_name                                     AS opponent,
  tu.stat_key,
  tu.stat_label,
  tu.projected_value,
  tu.actual_value,
  (tu.actual_value - COALESCE(tu.projected_value, 0)) AS signed_error,
  ABS(tu.actual_value - COALESCE(tu.projected_value, 0)) AS absolute_error,
  CASE
    WHEN tu.projected_value IS NULL THEN NULL
    ELSE GREATEST(0, LEAST(100,
      100 - (ABS(tu.actual_value - tu.projected_value) /
             GREATEST(ABS(tu.actual_value), ABS(tu.projected_value), 1) * 100)
    ))
  END                                                  AS accuracy_pct,
  CASE
    WHEN tu.projected_value IS NULL          THEN 'no_projection'
    WHEN tu.projected_value > tu.actual_value THEN 'over_projected'
    WHEN tu.projected_value < tu.actual_value THEN 'under_projected'
    ELSE                                          'exact'
  END                                                  AS error_direction,
  CASE WHEN tu.projected_value IS NOT NULL THEN ABS(tu.actual_value - tu.projected_value) <= 1  END AS within_1,
  CASE WHEN tu.projected_value IS NOT NULL THEN ABS(tu.actual_value - tu.projected_value) <= 2  END AS within_2,
  CASE WHEN tu.projected_value IS NOT NULL THEN
    ABS(tu.actual_value - tu.projected_value) / GREATEST(ABS(tu.actual_value), ABS(tu.projected_value), 1) <= 0.10 END AS within_10_pct,
  CASE WHEN tu.projected_value IS NOT NULL THEN
    ABS(tu.actual_value - tu.projected_value) / GREATEST(ABS(tu.actual_value), ABS(tu.projected_value), 1) <= 0.20 END AS within_20_pct,
  tu.prior_game_count,
  (tu.projected_value IS NOT NULL AND tu.prior_game_count >= 2) AS snapshot_valid,
  'leave_one_out_reconstructed'                        AS projection_source,
  CASE
    WHEN tu.projected_value IS NULL  THEN 'No valid projection for this stat'
    WHEN tu.prior_game_count < 2     THEN 'Insufficient prior games — projection unreliable'
    ELSE NULL
  END                                                  AS notes,
  'FT'                                                 AS game_status
FROM team_unpivoted tu;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 1: get_player_stat_accuracy
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_stat_accuracy(
  p_season       integer  DEFAULT 2026,
  p_week         integer  DEFAULT NULL,
  p_stat_key     text     DEFAULT NULL,
  p_team         text     DEFAULT NULL,
  p_player_search text    DEFAULT NULL,
  p_valid_only   boolean  DEFAULT true,
  p_limit        integer  DEFAULT 500,
  p_offset       integer  DEFAULT 0
)
RETURNS TABLE (
  season          integer,
  week_number     integer,
  round_label     text,
  game_id         integer,
  game_date       timestamptz,
  player_id       integer,
  player_name     text,
  team            text,
  opponent        text,
  stat_key        text,
  stat_label      text,
  projected_value numeric,
  actual_value    numeric,
  signed_error    numeric,
  absolute_error  numeric,
  accuracy_pct    numeric,
  error_direction text,
  within_1        boolean,
  within_2        boolean,
  within_5_pct    boolean,
  within_10_pct   boolean,
  within_15_pct   boolean,
  within_20_pct   boolean,
  prior_game_count bigint,
  snapshot_valid  boolean,
  projection_source text,
  notes           text,
  game_status     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    v.season, v.week_number, v.round_label, v.game_id, v.game_date,
    v.player_id, v.player_name, v.team, v.opponent,
    v.stat_key, v.stat_label,
    v.projected_value, v.actual_value,
    v.signed_error, v.absolute_error, v.accuracy_pct,
    v.error_direction,
    v.within_1, v.within_2, v.within_5_pct, v.within_10_pct, v.within_15_pct, v.within_20_pct,
    v.prior_game_count, v.snapshot_valid, v.projection_source, v.notes, v.game_status
  FROM afl.v_player_stat_accuracy_review v
  WHERE (p_season    IS NULL OR v.season = p_season)
    AND (p_week      IS NULL OR v.week_number = p_week)
    AND (p_stat_key  IS NULL OR v.stat_key = p_stat_key)
    AND (p_team      IS NULL OR v.team ILIKE '%' || p_team || '%')
    AND (p_player_search IS NULL OR v.player_name ILIKE '%' || p_player_search || '%')
    AND (NOT p_valid_only OR v.snapshot_valid = true)
  ORDER BY v.game_date DESC, v.player_name, v.stat_key
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 2: get_team_stat_accuracy
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_team_stat_accuracy(
  p_season     integer DEFAULT 2026,
  p_week       integer DEFAULT NULL,
  p_stat_key   text    DEFAULT NULL,
  p_team       text    DEFAULT NULL,
  p_valid_only boolean DEFAULT true,
  p_limit      integer DEFAULT 300,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE (
  season          integer,
  week_number     integer,
  round_label     text,
  game_id         integer,
  game_date       timestamptz,
  team            text,
  opponent        text,
  stat_key        text,
  stat_label      text,
  projected_value numeric,
  actual_value    numeric,
  signed_error    numeric,
  absolute_error  numeric,
  accuracy_pct    numeric,
  error_direction text,
  within_1        boolean,
  within_2        boolean,
  within_10_pct   boolean,
  within_20_pct   boolean,
  prior_game_count bigint,
  snapshot_valid  boolean,
  projection_source text,
  notes           text,
  game_status     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    v.season, v.week_number, v.round_label, v.game_id, v.game_date,
    v.team, v.opponent,
    v.stat_key, v.stat_label,
    v.projected_value, v.actual_value,
    v.signed_error, v.absolute_error, v.accuracy_pct,
    v.error_direction,
    v.within_1, v.within_2, v.within_10_pct, v.within_20_pct,
    v.prior_game_count, v.snapshot_valid, v.projection_source, v.notes, v.game_status
  FROM afl.v_team_stat_accuracy_review v
  WHERE (p_season   IS NULL OR v.season = p_season)
    AND (p_week     IS NULL OR v.week_number = p_week)
    AND (p_stat_key IS NULL OR v.stat_key = p_stat_key)
    AND (p_team     IS NULL OR v.team ILIKE '%' || p_team || '%')
    AND (NOT p_valid_only OR v.snapshot_valid = true)
  ORDER BY v.game_date DESC, v.team, v.stat_key
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 3: get_stat_accuracy_round_summary
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_accuracy_round_summary(
  p_season integer DEFAULT 2026
)
RETURNS TABLE (
  week_number          integer,
  round_label          text,
  player_rows          bigint,
  team_rows            bigint,
  avg_accuracy_pct     numeric,
  mae                  numeric,
  rmse                 numeric,
  bias                 numeric,
  over_projected_count bigint,
  under_projected_count bigint,
  exact_count          bigint,
  within_10_pct        numeric,
  within_20_pct        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH combined AS (
    SELECT
      week_number, round_label,
      'player' AS src,
      accuracy_pct, signed_error, absolute_error,
      error_direction,
      within_10_pct, within_20_pct
    FROM afl.v_player_stat_accuracy_review
    WHERE season = p_season AND snapshot_valid = true

    UNION ALL

    SELECT
      week_number, round_label,
      'team' AS src,
      accuracy_pct, signed_error, absolute_error,
      error_direction,
      within_10_pct, within_20_pct
    FROM afl.v_team_stat_accuracy_review
    WHERE season = p_season AND snapshot_valid = true
  )
  SELECT
    week_number,
    MAX(round_label)                                         AS round_label,
    COUNT(*) FILTER (WHERE src = 'player')                   AS player_rows,
    COUNT(*) FILTER (WHERE src = 'team')                     AS team_rows,
    ROUND(AVG(accuracy_pct), 1)                              AS avg_accuracy_pct,
    ROUND(AVG(absolute_error), 2)                            AS mae,
    ROUND(SQRT(AVG(absolute_error * absolute_error)), 2)     AS rmse,
    ROUND(AVG(signed_error), 2)                              AS bias,
    COUNT(*) FILTER (WHERE error_direction = 'over_projected') AS over_projected_count,
    COUNT(*) FILTER (WHERE error_direction = 'under_projected') AS under_projected_count,
    COUNT(*) FILTER (WHERE error_direction = 'exact')        AS exact_count,
    ROUND(100.0 * AVG(within_10_pct::int), 1)               AS within_10_pct,
    ROUND(100.0 * AVG(within_20_pct::int), 1)               AS within_20_pct
  FROM combined
  GROUP BY week_number
  ORDER BY week_number;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 4: get_stat_accuracy_type_summary
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_accuracy_type_summary(
  p_season integer DEFAULT 2026,
  p_scope  text    DEFAULT 'all'  -- 'all' | 'player' | 'team'
)
RETURNS TABLE (
  stat_key             text,
  stat_label           text,
  scope                text,
  sample_size          bigint,
  avg_projected        numeric,
  avg_actual           numeric,
  avg_signed_error     numeric,
  mae                  numeric,
  rmse                 numeric,
  avg_accuracy_pct     numeric,
  within_10_pct        numeric,
  within_20_pct        numeric,
  over_projected_pct   numeric,
  under_projected_pct  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH combined AS (
    SELECT
      stat_key, stat_label, 'player' AS scope,
      projected_value, actual_value, signed_error, absolute_error,
      accuracy_pct, error_direction, within_10_pct, within_20_pct
    FROM afl.v_player_stat_accuracy_review
    WHERE season = p_season AND snapshot_valid = true
      AND projected_value IS NOT NULL

    UNION ALL

    SELECT
      stat_key, stat_label, 'team' AS scope,
      projected_value, actual_value, signed_error, absolute_error,
      accuracy_pct, error_direction, within_10_pct, within_20_pct
    FROM afl.v_team_stat_accuracy_review
    WHERE season = p_season AND snapshot_valid = true
      AND projected_value IS NOT NULL
  )
  SELECT
    stat_key,
    MAX(stat_label)                                          AS stat_label,
    scope,
    COUNT(*)                                                 AS sample_size,
    ROUND(AVG(projected_value), 1)                           AS avg_projected,
    ROUND(AVG(actual_value), 1)                              AS avg_actual,
    ROUND(AVG(signed_error), 2)                              AS avg_signed_error,
    ROUND(AVG(absolute_error), 2)                            AS mae,
    ROUND(SQRT(AVG(absolute_error * absolute_error)), 2)     AS rmse,
    ROUND(AVG(accuracy_pct), 1)                              AS avg_accuracy_pct,
    ROUND(100.0 * AVG(within_10_pct::int), 1)               AS within_10_pct,
    ROUND(100.0 * AVG(within_20_pct::int), 1)               AS within_20_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_direction = 'over_projected')  / GREATEST(COUNT(*), 1), 1) AS over_projected_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_direction = 'under_projected') / GREATEST(COUNT(*), 1), 1) AS under_projected_pct
  FROM combined
  WHERE (p_scope = 'all' OR scope = p_scope)
  GROUP BY stat_key, scope
  ORDER BY stat_key, scope;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Security: admin-only — no anon/authenticated grants
-- These RPCs are only callable by service_role (used by admin panel)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_player_stat_accuracy(integer, integer, text, text, text, boolean, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_team_stat_accuracy(integer, integer, text, text, boolean, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stat_accuracy_round_summary(integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stat_accuracy_type_summary(integer, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_player_stat_accuracy(integer, integer, text, text, text, boolean, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_stat_accuracy(integer, integer, text, text, boolean, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stat_accuracy_round_summary(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stat_accuracy_type_summary(integer, text) TO service_role;
