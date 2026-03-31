/*
  # Neeko Phase 3 — Next Round Context View

  Creates v_neeko_next_round_context:
  - One row per team for the UPCOMING round
  - Derives: next_round_number, opponent, venue, is_home, start_time
  - Uses afl.v_team_schedule_2026 which only contains future fixtures

  ## Logic
  - For each team, pick the match with the MIN match_date (soonest upcoming)
  - Produce both home and away perspective rows
  - Returns max 18 rows (one per AFL team)
*/

CREATE OR REPLACE VIEW public.v_neeko_next_round_context
WITH (security_invoker = false)
AS
WITH next_matches AS (
  SELECT
    round_number,
    match_date,
    home_team,
    away_team,
    venue,
    ROW_NUMBER() OVER (ORDER BY match_date ASC) AS rn
  FROM afl.v_team_schedule_2026
),
min_round AS (
  SELECT MIN(round_number) AS next_round
  FROM next_matches
  WHERE rn <= 9
),
upcoming AS (
  SELECT s.round_number, s.match_date, s.home_team, s.away_team, s.venue
  FROM afl.v_team_schedule_2026 s
  CROSS JOIN min_round mr
  WHERE s.round_number = mr.next_round
),
home_rows AS (
  SELECT
    home_team   AS team,
    away_team   AS opponent,
    venue,
    true        AS is_home,
    round_number AS next_round_number,
    match_date  AS next_start_time
  FROM upcoming
),
away_rows AS (
  SELECT
    away_team   AS team,
    home_team   AS opponent,
    venue,
    false       AS is_home,
    round_number AS next_round_number,
    match_date  AS next_start_time
  FROM upcoming
)
SELECT * FROM home_rows
UNION ALL
SELECT * FROM away_rows;

GRANT SELECT ON public.v_neeko_next_round_context TO anon, authenticated;
