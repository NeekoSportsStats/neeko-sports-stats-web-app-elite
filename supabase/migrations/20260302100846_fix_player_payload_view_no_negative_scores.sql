/*
  # Fix v_ai_player_payloads_2026_next_round — No Negative Scores

  ## Summary
  Rebuilds the player AI payload view to prevent negative predicted_score
  and value_score values without changing any projection formulas.

  ## Changes

  ### Modified View
  - `afl.v_ai_player_payloads_2026_next_round`

  ### Fixes Applied

  1. **base_form computed field**
     A safe COALESCE chain across available form fields:
     weighted_form → last_10_avg → last_5_avg → season_avg
     If all are NULL, base_form remains NULL.

  2. **predicted_score**
     - If base_form IS NULL → predicted_score = NULL (not 0 + delta)
     - Otherwise → GREATEST(0, base_form + matchup_delta)
     - Prevents a large negative matchup_delta from pulling score below zero

  3. **value_score**
     - If price IS NULL or predicted_score IS NULL → value_score = NULL
     - Otherwise → GREATEST(0, ROUND(predicted_score / price * 10000, 2))

  4. **value_tier**
     - Guards against NULL predicted_score with same GREATEST logic

  ## What Was NOT Changed
  - All CTEs (schedule, history, player_stats, defense, etc.)
  - Form field formulas (weighted_form, last_5_avg, etc.)
  - Confidence logic
  - Any other payload sections
  - No tables touched
*/

CREATE OR REPLACE VIEW afl.v_ai_player_payloads_2026_next_round AS
WITH schedule AS (
  SELECT
    v_team_schedule_2026.round_number,
    v_team_schedule_2026.match_id,
    v_team_schedule_2026.match_date,
    v_team_schedule_2026.venue,
    v_team_schedule_2026.home_team,
    v_team_schedule_2026.away_team
  FROM afl.v_team_schedule_2026
  WHERE v_team_schedule_2026.match_date > now()
),
next_round AS (
  SELECT min(schedule.round_number) AS rn FROM schedule
),
next_fixtures AS (
  SELECT s.round_number, s.match_id, s.match_date, s.venue, s.home_team, s.away_team
  FROM schedule s
  JOIN next_round nr ON s.round_number = nr.rn
),
fixture_rows AS (
  SELECT
    next_fixtures.round_number, next_fixtures.match_id, next_fixtures.match_date,
    next_fixtures.venue, next_fixtures.home_team AS team,
    next_fixtures.away_team AS opponent, true AS is_home
  FROM next_fixtures
  UNION ALL
  SELECT
    next_fixtures.round_number, next_fixtures.match_id, next_fixtures.match_date,
    next_fixtures.venue, next_fixtures.away_team AS team,
    next_fixtures.home_team AS opponent, false AS is_home
  FROM next_fixtures
),
history AS (
  SELECT
    v_player_round_canonical_2025.player,
    v_player_round_canonical_2025.team,
    v_player_round_canonical_2025.fantasy_points,
    v_player_round_canonical_2025.round_number,
    v_player_round_canonical_2025.season
  FROM afl.v_player_round_canonical_2025
  WHERE v_player_round_canonical_2025.season = 2025
    AND v_player_round_canonical_2025.played = true
),
tog_source AS (
  SELECT
    p.player,
    p.team_canonical AS team,
    round(avg(p.time_on_ground), 1) AS avg_tog
  FROM afl.player_round_stats_2025_canonical_tbl p
  WHERE p.season = 2025
  GROUP BY p.player, p.team_canonical
),
ranked AS (
  SELECT
    history.player,
    history.team,
    history.fantasy_points,
    row_number() OVER (
      PARTITION BY history.player, history.team
      ORDER BY history.season DESC, history.round_number DESC
    ) AS rk
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
      0.5 * avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points ELSE NULL::integer END)
    + 0.3 * avg(CASE WHEN r.rk <= 5  THEN r.fantasy_points ELSE NULL::integer END)
    + 0.2 * avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END),
    1) AS weighted_form,
    round(
      avg(CASE WHEN r.rk <= 3  THEN r.fantasy_points ELSE NULL::integer END)
    - avg(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END),
    1) AS momentum,
    round(stddev(CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END), 1) AS stdev_last_10,
    round(
      percentile_cont(0.10::double precision) WITHIN GROUP (
        ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END)::double precision
      )::numeric, 1
    ) AS floor_p10,
    round(
      percentile_cont(0.90::double precision) WITHIN GROUP (
        ORDER BY (CASE WHEN r.rk <= 10 THEN r.fantasy_points ELSE NULL::integer END)::double precision
      )::numeric, 1
    ) AS ceiling_p90,
    round(
      count(*) FILTER (WHERE r.fantasy_points >= 50)::numeric
      / NULLIF(count(*), 0)::numeric * 100::numeric,
    1) AS consistency_score
  FROM ranked r
  GROUP BY r.player, r.team
),
defense AS (
  SELECT
    team_defense_profile_2026.team,
    team_defense_profile_2026.avg_fantasy_allowed AS opponent_avg_allowed,
    team_defense_profile_2026.matchup_delta AS opponent_matchup_delta
  FROM afl.team_defense_profile_2026
),
team_context AS (
  SELECT DISTINCT ON (tf.team, tf.match_id)
    tf.team,
    tf.match_id,
    tf.days_rest,
    tf.quick_turnaround_flag
  FROM afl.v_ai_team_match_features_2026_next_round tf
),
roster_position AS (
  SELECT
    v_player_roster_2026_resolved."Player" AS player,
    v_player_roster_2026_resolved."Team"   AS team,
    v_player_roster_2026_resolved."Position" AS "position"
  FROM afl.v_player_roster_2026_resolved
  WHERE v_player_roster_2026_resolved."Team"   IS NOT NULL
    AND v_player_roster_2026_resolved."Player" IS NOT NULL
),
base AS (
  SELECT
    r.player,
    r.team,
    COALESCE(f.round_number, (SELECT next_round.rn FROM next_round)) AS round_number,
    f.match_id,
    f.match_date,
    f.venue,
    f.opponent,
    f.is_home
  FROM afl.v_roster_2026_canon r
  LEFT JOIN fixture_rows f ON f.team = r.team
),
pricing_data AS (
  SELECT afl_player_prices.player_name, afl_player_prices.price
  FROM afl_player_prices
  WHERE afl_player_prices.season = 2026
    AND afl_player_prices.round_number = (
      SELECT max(afl_player_prices_1.round_number)
      FROM afl_player_prices afl_player_prices_1
      WHERE afl_player_prices_1.season = 2026
    )
),
computed AS (
  SELECT
    b.*,
    ps.season_avg,
    ps.last_5_avg,
    ps.last_10_avg,
    ps.weighted_form,
    ps.momentum,
    ps.stdev_last_10,
    ps.floor_p10,
    ps.ceiling_p90,
    ps.consistency_score,
    ps.total_games,
    t.avg_tog,
    def.opponent_avg_allowed,
    COALESCE(def.opponent_matchup_delta, 0::numeric) AS matchup_delta,
    rp."position",
    tc.days_rest,
    tc.quick_turnaround_flag,
    pr.price,
    -- Safe base_form: NULL if no history at all
    COALESCE(
      ps.weighted_form,
      ps.last_10_avg,
      ps.last_5_avg,
      ps.season_avg
    ) AS base_form
  FROM base b
  LEFT JOIN player_stats    ps  ON ps.player  = b.player  AND ps.team = b.team
  LEFT JOIN tog_source      t   ON t.player   = b.player  AND t.team  = b.team
  LEFT JOIN defense         def ON def.team   = b.opponent
  LEFT JOIN team_context    tc  ON tc.team    = b.team    AND tc.match_id = b.match_id
  LEFT JOIN roster_position rp  ON rp.player  = b.player  AND rp.team  = b.team
  LEFT JOIN pricing_data    pr  ON pr.player_name = b.player
)
SELECT
  c.match_id,
  c.match_date,
  c.round_number,
  CASE
    WHEN c.round_number = 0 THEN 'Opening Round'
    ELSE 'Round ' || c.round_number
  END AS round_label,
  c.player,
  c.team,
  c.opponent,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',    c.match_id,
      'match_date',  c.match_date,
      'round',       c.round_number,
      'round_label', CASE WHEN c.round_number = 0 THEN 'Opening Round' ELSE 'Round ' || c.round_number END,
      'venue',       c.venue,
      'is_home',     c.is_home
    ),
    'player', jsonb_build_object(
      'name',     c.player,
      'team',     c.team,
      'opponent', c.opponent,
      'position', c."position"
    ),
    'form', jsonb_build_object(
      'season_avg',    c.season_avg,
      'last_5_avg',    c.last_5_avg,
      'last_10_avg',   c.last_10_avg,
      'weighted_form', c.weighted_form,
      'momentum',      c.momentum
    ),
    'volatility', jsonb_build_object(
      'stdev',   c.stdev_last_10,
      'floor',   c.floor_p10,
      'ceiling', c.ceiling_p90
    ),
    'role', jsonb_build_object(
      'avg_time_on_ground', c.avg_tog,
      'consistency_score',  c.consistency_score,
      'games_available',    COALESCE(c.total_games, 0)
    ),
    'opponent_context', jsonb_build_object(
      'avg_allowed',    COALESCE(c.opponent_avg_allowed, 65.6),
      'matchup_delta',  c.matchup_delta
    ),
    'rest', jsonb_build_object(
      'days_rest',      COALESCE(c.days_rest, 0),
      'quick_turnaround', COALESCE(c.quick_turnaround_flag, false)
    ),
    'prediction', jsonb_build_object(
      'predicted_score',
        CASE
          WHEN c.base_form IS NULL THEN NULL
          ELSE GREATEST(0, round(c.base_form + c.matchup_delta, 1))
        END,
      'predicted_change',
        CASE
          WHEN c.base_form IS NULL THEN NULL
          ELSE round(c.base_form + c.matchup_delta - COALESCE(c.season_avg, 0), 1)
        END,
      'confidence',
        CASE
          WHEN COALESCE(c.total_games, 0) >= 15 AND COALESCE(c.stdev_last_10, 99) < 20 THEN 'Very High'
          WHEN COALESCE(c.total_games, 0) >= 10 AND COALESCE(c.stdev_last_10, 99) < 25 THEN 'High'
          WHEN COALESCE(c.total_games, 0) >= 5  AND COALESCE(c.stdev_last_10, 99) < 35 THEN 'Medium'
          WHEN COALESCE(c.total_games, 0) >= 1  THEN 'Low'
          ELSE 'Insufficient Data'
        END
    ),
    'is_rookie_or_no_history', (c.total_games IS NULL OR c.total_games = 0),
    'pricing', jsonb_build_object(
      'price', c.price,
      'value_score',
        CASE
          WHEN c.price IS NULL OR c.base_form IS NULL THEN NULL
          ELSE GREATEST(0, round(
            GREATEST(0, c.base_form + c.matchup_delta) / NULLIF(c.price, 0)::numeric * 10000,
          2))
        END,
      'value_tier',
        CASE
          WHEN c.price IS NULL OR c.base_form IS NULL THEN NULL
          WHEN (GREATEST(0, c.base_form + c.matchup_delta) / NULLIF(c.price, 0)::numeric * 10000) >= 1.25 THEN 'ELITE'
          WHEN (GREATEST(0, c.base_form + c.matchup_delta) / NULLIF(c.price, 0)::numeric * 10000) >= 1.10 THEN 'GOOD'
          ELSE 'POOR'
        END
    )
  ) AS payload
FROM computed c;
