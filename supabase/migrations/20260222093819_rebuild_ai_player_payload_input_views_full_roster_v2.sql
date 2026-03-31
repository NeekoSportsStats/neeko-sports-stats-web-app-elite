/*
  # Rebuild AI player payload + input views — full 2026 roster

  ## Problem
  v_ai_player_payloads_2026_next_round was built on v_ai_player_features_2026
  which INNER JOINed fixtures → roster. Only the 10 teams with upcoming fixtures
  appeared, producing ~389 rows instead of the full ~780.

  All 18 teams have upcoming fixtures; the issue was the JOIN direction.
  Fix: use v_roster_2026_canon as the primary FROM, LEFT JOIN fixtures.

  ## Strategy
  1. DROP CASCADE on payload view (removes dependent views cleanly)
  2. Recreate payload view with roster as base
  3. Recreate input view (exact same prompt logic as before)
  4. Recreate requests view (restored from existing definition)

  ## Not modified
  - Edge functions, writeback tables, prompts, v_ai_player_features_2026
*/

-- Drop dependents first (CASCADE not needed — drop in order)
DROP VIEW IF EXISTS afl.v_ai_player_openai_requests_2026_next_round;
DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round;
DROP VIEW IF EXISTS afl.v_ai_player_payloads_2026_next_round;

-- ── 1. Payload view ───────────────────────────────────────────────────────

CREATE VIEW afl.v_ai_player_payloads_2026_next_round AS
WITH schedule AS (
  SELECT round_number, match_id, match_date, venue, home_team, away_team
  FROM afl.v_team_schedule_2026
  WHERE match_date > now()
),
next_round AS (
  SELECT MIN(round_number) AS rn FROM schedule
),
next_fixtures AS (
  SELECT s.round_number, s.match_id, s.match_date, s.venue, s.home_team, s.away_team
  FROM schedule s
  JOIN next_round nr ON s.round_number = nr.rn
),
fixture_rows AS (
  SELECT round_number, match_id, match_date, venue,
         home_team AS team, away_team AS opponent, true AS is_home
  FROM next_fixtures
  UNION ALL
  SELECT round_number, match_id, match_date, venue,
         away_team AS team, home_team AS opponent, false AS is_home
  FROM next_fixtures
),
history AS (
  SELECT h.player, h.team, h.fantasy_points, h.round_number, h.season
  FROM afl.v_player_round_canonical_2025 h
  WHERE h.season = 2025 AND h.played = true
),
tog_source AS (
  SELECT p.player, p.team_canonical AS team,
         round(avg(p.time_on_ground), 1) AS avg_tog
  FROM afl.player_round_stats_2025_canonical_tbl p
  WHERE p.season = 2025
  GROUP BY p.player, p.team_canonical
),
ranked AS (
  SELECT h.player, h.team, h.fantasy_points,
    row_number() OVER (
      PARTITION BY h.player, h.team ORDER BY h.season DESC, h.round_number DESC
    ) AS rk
  FROM history h
),
player_stats AS (
  SELECT
    r.player,
    r.team,
    count(*) AS total_games,
    round(avg(r.fantasy_points), 1) AS season_avg,
    round(avg(CASE WHEN r.rk <= 5  THEN r.fantasy_points END), 1) AS last_5_avg,
    round(avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points END), 1) AS last_10_avg,
    round(
      0.5 * avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points END) +
      0.3 * avg(CASE WHEN r.rk <= 5  THEN r.fantasy_points END) +
      0.2 * avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)
    , 1) AS weighted_form,
    round(
      avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points END) -
      avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)
    , 1) AS momentum,
    round(stddev(CASE WHEN r.rk <= 10 THEN r.fantasy_points END), 1) AS stdev_last_10,
    round(percentile_cont(0.10) WITHIN GROUP (
      ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points END)::float
    )::numeric, 1) AS floor_p10,
    round(percentile_cont(0.90) WITHIN GROUP (
      ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points END)::float
    )::numeric, 1) AS ceiling_p90,
    round(
      count(*) FILTER (WHERE r.fantasy_points >= 50)::numeric /
      NULLIF(count(*), 0)::numeric * 100
    , 1) AS consistency_score
  FROM ranked r
  GROUP BY r.player, r.team
),
defense AS (
  SELECT team,
         avg_fantasy_allowed AS opponent_avg_allowed,
         matchup_delta       AS opponent_matchup_delta
  FROM afl.team_defense_profile_2026
),
team_context AS (
  SELECT DISTINCT ON (tf.team, tf.match_id)
    tf.team, tf.match_id, tf.days_rest, tf.quick_turnaround_flag
  FROM afl.v_ai_team_match_features_2026_next_round tf
),
roster_position AS (
  SELECT "Player" AS player, "Team" AS team, "Position" AS position
  FROM afl.v_player_roster_2026_resolved
  WHERE "Team" IS NOT NULL AND "Player" IS NOT NULL
),
base AS (
  SELECT
    r.player,
    r.team,
    COALESCE(f.round_number, (SELECT rn FROM next_round)) AS round_number,
    f.match_id,
    f.match_date,
    f.venue,
    f.opponent,
    f.is_home
  FROM afl.v_roster_2026_canon r
  LEFT JOIN fixture_rows f ON f.team = r.team
)
SELECT
  b.match_id,
  b.match_date,
  b.round_number,
  b.player,
  b.team,
  b.opponent,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',   b.match_id,
      'match_date', b.match_date,
      'round',      b.round_number,
      'venue',      b.venue,
      'is_home',    b.is_home
    ),
    'player', jsonb_build_object(
      'name',     b.player,
      'team',     b.team,
      'opponent', b.opponent,
      'position', rp.position
    ),
    'form', jsonb_build_object(
      'season_avg',    ps.season_avg,
      'last_5_avg',    ps.last_5_avg,
      'last_10_avg',   ps.last_10_avg,
      'weighted_form', ps.weighted_form,
      'momentum',      ps.momentum
    ),
    'volatility', jsonb_build_object(
      'stdev',   ps.stdev_last_10,
      'floor',   ps.floor_p10,
      'ceiling', ps.ceiling_p90
    ),
    'role', jsonb_build_object(
      'avg_time_on_ground', t.avg_tog,
      'consistency_score',  ps.consistency_score,
      'games_available',    COALESCE(ps.total_games, 0)
    ),
    'opponent_context', jsonb_build_object(
      'avg_allowed',   COALESCE(def.opponent_avg_allowed, 65.6),
      'matchup_delta', COALESCE(def.opponent_matchup_delta, 0)
    ),
    'rest', jsonb_build_object(
      'days_rest',        COALESCE(tc.days_rest, 0),
      'quick_turnaround', COALESCE(tc.quick_turnaround_flag, false)
    ),
    'prediction', jsonb_build_object(
      'predicted_score', round(
        COALESCE(ps.weighted_form, ps.season_avg, 0) +
        COALESCE(def.opponent_matchup_delta, 0)
      , 1),
      'predicted_change', round(
        COALESCE(ps.weighted_form, ps.season_avg, 0) +
        COALESCE(def.opponent_matchup_delta, 0) -
        COALESCE(ps.season_avg, 0)
      , 1),
      'confidence', CASE
        WHEN COALESCE(ps.total_games, 0) >= 15 AND COALESCE(ps.stdev_last_10, 99) < 20 THEN 'Very High'
        WHEN COALESCE(ps.total_games, 0) >= 10 AND COALESCE(ps.stdev_last_10, 99) < 25 THEN 'High'
        WHEN COALESCE(ps.total_games, 0) >=  5 AND COALESCE(ps.stdev_last_10, 99) < 35 THEN 'Medium'
        WHEN COALESCE(ps.total_games, 0) >=  1 THEN 'Low'
        ELSE 'Insufficient Data'
      END
    ),
    'is_rookie_or_no_history', (ps.total_games IS NULL OR ps.total_games = 0)
  ) AS payload
FROM base b
LEFT JOIN player_stats   ps  ON ps.player = b.player  AND ps.team     = b.team
LEFT JOIN tog_source      t   ON t.player  = b.player  AND t.team      = b.team
LEFT JOIN defense         def ON def.team  = b.opponent
LEFT JOIN team_context    tc  ON tc.team   = b.team    AND tc.match_id = b.match_id
LEFT JOIN roster_position rp  ON rp.player = b.player  AND rp.team     = b.team;


-- ── 2. Input view (prompt logic identical to original) ────────────────────

CREATE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
SELECT
  p.match_id,
  p.round_number,
  p.player,
  p.team,
  p.opponent,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user', replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(pr.user_prompt_template, '{player}'::text, COALESCE(p.player, ''::text)), '{expected}'::text, COALESCE(round(s.expected_fantasy, 1)::text, 'N/A'::text)), '{floor_fantasy}'::text, COALESCE(round(s.floor_fantasy, 1)::text, 'N/A'::text)), '{ceiling_fantasy}'::text, COALESCE(round(s.ceiling_fantasy, 1)::text, 'N/A'::text)), '{season_avg}'::text, COALESCE(round(s.season_avg, 1)::text, 'N/A'::text)), '{last_3_avg}'::text, COALESCE(round(s.last_3_avg, 1)::text, 'N/A'::text)), '{last_5_avg}'::text, COALESCE(round(s.last_5_avg, 1)::text, 'N/A'::text)), '{volatility}'::text, COALESCE(round(s.volatility, 2)::text, 'N/A'::text)), '{risk_tier}'::text, COALESCE(s.risk_tier, 'N/A'::text)), '{consistency_score}'::text, COALESCE(s.consistency_score::text, 'N/A'::text)), '{matchup_delta}'::text, COALESCE(round(s.matchup_delta, 2)::text, 'N/A'::text)), '{matchup_label}'::text, COALESCE(s.matchup_label, 'N/A'::text)), '{prob_100_plus}'::text, COALESCE(round(s.prob_100_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{prob_120_plus}'::text, COALESCE(round(s.prob_120_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{prob_140_plus}'::text, COALESCE(round(s.prob_140_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{games_played}'::text, COALESCE(s.games_played::text, 'N/A'::text)), '{trend_direction}'::text, COALESCE(s.trend_direction, 'N/A'::text)),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_player_payloads_2026_next_round p
JOIN afl.ai_prompts pr ON pr.prompt_key = 'player_round_summary'::text AND pr.is_active = true
LEFT JOIN afl.v_ai_player_summary_input_2026 s ON s.player = p.player AND s.team = p.team;


-- ── 3. Requests view (restored from original definition) ──────────────────

CREATE VIEW afl.v_ai_player_openai_requests_2026_next_round AS
SELECT
  replace(p.user_prompt_template, '{{DATA}}'::text, pl.payload::text) AS user_prompt,
  jsonb_build_object(
    'system', p.system_prompt,
    'user', replace(p.user_prompt_template, '{{DATA}}'::text, pl.payload::text)
  ) AS final_openai_input
FROM afl.v_ai_player_payloads_2026_next_round pl
JOIN afl.ai_prompts p ON p.prompt_key = 'player_round_summary'::text AND p.is_active = true;
