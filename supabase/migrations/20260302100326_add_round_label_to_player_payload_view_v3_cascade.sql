/*
  # Add round_label to afl.v_ai_player_payloads_2026_next_round

  ## Summary
  Adds a human-readable `round_label` field to the player payload view
  and inside the payload JSON's `match` object.

  ## Changes
  1. DROP ... CASCADE on afl.v_ai_player_payloads_2026_next_round
     (also drops the archive_ai dependent view which is no longer active)
  2. Recreate afl.v_ai_player_payloads_2026_next_round with new `round_label` column
  3. Recreate afl.v_ai_player_openai_requests_2026_next_round (active dependent)

  ## round_label logic
  - round_number = 0  → 'Opening Round'
  - otherwise         → 'Round ' || round_number

  ## No table modifications, no RLS changes
*/

DROP VIEW IF EXISTS archive_ai.v_ai_player_openai_inputs_2026_next_round;
DROP VIEW IF EXISTS afl.v_ai_player_openai_requests_2026_next_round;
DROP VIEW IF EXISTS afl.v_ai_player_payloads_2026_next_round;

CREATE VIEW afl.v_ai_player_payloads_2026_next_round AS
WITH schedule AS (
  SELECT round_number, match_id, match_date, venue, home_team, away_team
  FROM afl.v_team_schedule_2026
  WHERE match_date > now()
),
next_round AS (
  SELECT min(round_number) AS rn FROM schedule
),
next_fixtures AS (
  SELECT s.round_number, s.match_id, s.match_date, s.venue, s.home_team, s.away_team
  FROM schedule s
  JOIN next_round nr ON s.round_number = nr.rn
),
fixture_rows AS (
  SELECT round_number, match_id, match_date, venue, home_team AS team, away_team AS opponent, true AS is_home
  FROM next_fixtures
  UNION ALL
  SELECT round_number, match_id, match_date, venue, away_team AS team, home_team AS opponent, false AS is_home
  FROM next_fixtures
),
history AS (
  SELECT player, team, fantasy_points, round_number, season
  FROM afl.v_player_round_canonical_2025
  WHERE season = 2025 AND played = true
),
tog_source AS (
  SELECT p.player, p.team_canonical AS team, round(avg(p.time_on_ground), 1) AS avg_tog
  FROM afl.player_round_stats_2025_canonical_tbl p
  WHERE p.season = 2025
  GROUP BY p.player, p.team_canonical
),
ranked AS (
  SELECT player, team, fantasy_points,
    row_number() OVER (PARTITION BY player, team ORDER BY season DESC, round_number DESC) AS rk
  FROM history
),
player_stats AS (
  SELECT
    r.player,
    r.team,
    count(*) AS total_games,
    round(avg(r.fantasy_points), 1) AS season_avg,
    round(avg(CASE WHEN r.rk <= 5  THEN r.fantasy_points ELSE NULL::integer END), 1) AS last_5_avg,
    round(avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END), 1) AS last_10_avg,
    round(
      0.5 * avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points ELSE NULL::integer END) +
      0.3 * avg(CASE WHEN r.rk <= 5  THEN r.fantasy_points ELSE NULL::integer END) +
      0.2 * avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END),
    1) AS weighted_form,
    round(
      avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points ELSE NULL::integer END) -
      avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END),
    1) AS momentum,
    round(stddev(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END), 1) AS stdev_last_10,
    round(percentile_cont(0.10) WITHIN GROUP (ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END)::double precision)::numeric, 1) AS floor_p10,
    round(percentile_cont(0.90) WITHIN GROUP (ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END)::double precision)::numeric, 1) AS ceiling_p90,
    round(count(*) FILTER (WHERE r.fantasy_points >= 50)::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS consistency_score
  FROM ranked r
  GROUP BY r.player, r.team
),
defense AS (
  SELECT team, avg_fantasy_allowed AS opponent_avg_allowed, matchup_delta AS opponent_matchup_delta
  FROM afl.team_defense_profile_2026
),
team_context AS (
  SELECT DISTINCT ON (tf.team, tf.match_id) tf.team, tf.match_id, tf.days_rest, tf.quick_turnaround_flag
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
),
pricing_data AS (
  SELECT player_name, price
  FROM public.afl_player_prices
  WHERE season = 2026
    AND round_number = (SELECT max(round_number) FROM public.afl_player_prices WHERE season = 2026)
)
SELECT
  b.match_id,
  b.match_date,
  b.round_number,
  CASE
    WHEN b.round_number = 0 THEN 'Opening Round'
    ELSE 'Round ' || b.round_number
  END AS round_label,
  b.player,
  b.team,
  b.opponent,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',    b.match_id,
      'match_date',  b.match_date,
      'round',       b.round_number,
      'round_label', CASE WHEN b.round_number = 0 THEN 'Opening Round' ELSE 'Round ' || b.round_number END,
      'venue',       b.venue,
      'is_home',     b.is_home
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
      'predicted_score',  round(COALESCE(ps.weighted_form, ps.season_avg, 0) + COALESCE(def.opponent_matchup_delta, 0), 1),
      'predicted_change', round(COALESCE(ps.weighted_form, ps.season_avg, 0) + COALESCE(def.opponent_matchup_delta, 0) - COALESCE(ps.season_avg, 0), 1),
      'confidence',
        CASE
          WHEN COALESCE(ps.total_games, 0) >= 15 AND COALESCE(ps.stdev_last_10, 99) < 20 THEN 'Very High'
          WHEN COALESCE(ps.total_games, 0) >= 10 AND COALESCE(ps.stdev_last_10, 99) < 25 THEN 'High'
          WHEN COALESCE(ps.total_games, 0) >= 5  AND COALESCE(ps.stdev_last_10, 99) < 35 THEN 'Medium'
          WHEN COALESCE(ps.total_games, 0) >= 1  THEN 'Low'
          ELSE 'Insufficient Data'
        END
    ),
    'is_rookie_or_no_history', ps.total_games IS NULL OR ps.total_games = 0,
    'pricing', jsonb_build_object(
      'price',       pr.price,
      'value_score', round(
        (COALESCE(ps.weighted_form, ps.season_avg, 0) + COALESCE(def.opponent_matchup_delta, 0)) /
        NULLIF(pr.price, 0)::numeric * 10000,
      2),
      'value_tier',
        CASE
          WHEN pr.price IS NULL THEN NULL
          WHEN (COALESCE(ps.weighted_form, ps.season_avg, 0) + COALESCE(def.opponent_matchup_delta, 0)) / NULLIF(pr.price, 0)::numeric * 10000 >= 1.25 THEN 'ELITE'
          WHEN (COALESCE(ps.weighted_form, ps.season_avg, 0) + COALESCE(def.opponent_matchup_delta, 0)) / NULLIF(pr.price, 0)::numeric * 10000 >= 1.10 THEN 'GOOD'
          ELSE 'POOR'
        END
    )
  ) AS payload
FROM base b
LEFT JOIN player_stats    ps  ON ps.player = b.player  AND ps.team = b.team
LEFT JOIN tog_source      t   ON t.player  = b.player  AND t.team  = b.team
LEFT JOIN defense         def ON def.team  = b.opponent
LEFT JOIN team_context    tc  ON tc.team   = b.team    AND tc.match_id = b.match_id
LEFT JOIN roster_position rp  ON rp.player = b.player  AND rp.team    = b.team
LEFT JOIN pricing_data    pr  ON pr.player_name = b.player;

CREATE OR REPLACE VIEW afl.v_ai_player_openai_requests_2026_next_round AS
SELECT
  replace(
    replace(p.user_prompt_template, '{DATA}', pl.payload::text),
    '{{DATA}}', pl.payload::text
  ) AS user_prompt,
  jsonb_build_object(
    'system', p.system_prompt,
    'user', replace(
      replace(p.user_prompt_template, '{DATA}', pl.payload::text),
      '{{DATA}}', pl.payload::text
    )
  ) AS final_openai_input
FROM afl.v_ai_player_payloads_2026_next_round pl
JOIN afl.ai_prompts p
  ON p.prompt_key = 'player_round_summary' AND p.is_active = true;
