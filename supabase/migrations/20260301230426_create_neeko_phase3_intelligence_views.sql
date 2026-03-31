/*
  # Neeko Phase 3 — Intelligence Views

  Creates:
  1. v_neeko_player_trends       — avg_last_3/5/season + SURGING/FADING labels
  2. v_neeko_role_change_signals — CBA/TOG delta role signals
  3. v_neeko_availability_flags  — days_rest + turnaround risk flags
  4. v_neeko_value_engine        — placeholder (no price data)
  5. v_neeko_leverage_engine     — placeholder (no ownership data)

  Source: afl.v_neeko_player_recent_games (player_id, fantasy_points, row_num)
          afl.player_round_stats_2025_canonical_tbl (center_bounce_attendance, time_on_ground)
          afl.v_ai_team_match_features_2026_next_round (days_rest, quick_turnaround_flag)

  All views: SELECT granted to anon + authenticated.
*/

-- ── 1. Player Trends ──────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_player_trends
WITH (security_invoker = false)
AS
WITH windowed AS (
  SELECT
    player_id,
    player_name,
    team,
    fantasy_points,
    row_num,
    AVG(fantasy_points) OVER (PARTITION BY player_id)                        AS avg_season,
    AVG(fantasy_points) FILTER (WHERE row_num <= 3) OVER (PARTITION BY player_id) AS avg_last_3,
    AVG(fantasy_points) FILTER (WHERE row_num <= 5) OVER (PARTITION BY player_id) AS avg_last_5,
    STDDEV(fantasy_points) FILTER (WHERE row_num <= 5) OVER (PARTITION BY player_id) AS stddev_last_5
  FROM afl.v_neeko_player_recent_games
),
per_player AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    player_name,
    team,
    ROUND(avg_last_3::numeric, 1)   AS avg_last_3,
    ROUND(avg_last_5::numeric, 1)   AS avg_last_5,
    ROUND(avg_season::numeric, 1)   AS avg_season,
    ROUND((avg_last_3 - avg_season)::numeric, 1) AS trend_delta_3v_season,
    ROUND((avg_last_5 - avg_season)::numeric, 1) AS trend_delta_5v_season,
    ROUND(stddev_last_5::numeric, 1) AS consistency_stddev
  FROM windowed
  WHERE avg_last_3 IS NOT NULL AND avg_last_5 IS NOT NULL
  ORDER BY player_id
)
SELECT
  player_id,
  player_name,
  team,
  avg_last_3,
  avg_last_5,
  avg_season,
  trend_delta_3v_season,
  trend_delta_5v_season,
  consistency_stddev,
  CASE
    WHEN trend_delta_3v_season >= 12  THEN 'SURGING'
    WHEN trend_delta_3v_season >= 6   THEN 'RISING'
    WHEN trend_delta_3v_season >= -6  THEN 'STABLE'
    WHEN trend_delta_3v_season >= -12 THEN 'FADING'
    ELSE 'CRASHING'
  END AS trend_label,
  CASE
    WHEN consistency_stddev IS NULL   THEN 'STEADY'
    WHEN consistency_stddev <= 18     THEN 'STEADY'
    WHEN consistency_stddev <= 32     THEN 'VOLATILE'
    ELSE 'CHAOTIC'
  END AS consistency_label
FROM per_player;

GRANT SELECT ON public.v_neeko_player_trends TO anon, authenticated;


-- ── 2. Role Change Signals ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_role_change_signals
WITH (security_invoker = false)
AS
WITH recent_roles AS (
  SELECT
    s.player,
    s.team_canonical               AS team,
    s.round_number,
    s.season,
    s.time_on_ground::numeric      AS tog,
    CASE
      WHEN s.center_bounce_attendance ~ '^[0-9]+$'
      THEN s.center_bounce_attendance::numeric
      ELSE 0
    END                            AS cba,
    ROW_NUMBER() OVER (
      PARTITION BY s.player, s.team_canonical
      ORDER BY s.season DESC, s.round_number DESC
    ) AS rn
  FROM afl.player_round_stats_2025_canonical_tbl s
  WHERE s.games_played >= 1
),
season_avg AS (
  SELECT
    player,
    team,
    AVG(tog)::numeric AS avg_tog_season,
    AVG(cba)::numeric AS avg_cba_season
  FROM recent_roles
  GROUP BY player, team
),
last3_avg AS (
  SELECT
    player,
    team,
    AVG(tog)::numeric AS avg_tog_last3,
    AVG(cba)::numeric AS avg_cba_last3
  FROM recent_roles
  WHERE rn <= 3
  GROUP BY player, team
),
joined AS (
  SELECT
    sa.player,
    sa.team,
    ROUND(l.avg_cba_last3 - sa.avg_cba_season, 1)  AS delta_cba,
    ROUND(l.avg_tog_last3 - sa.avg_tog_season, 1)  AS delta_tog
  FROM season_avg sa
  JOIN last3_avg l USING (player, team)
),
with_players AS (
  SELECT
    r.player_id,
    j.*
  FROM joined j
  JOIN afl.v_neeko_player_recent_games r
    ON r.player_name = j.player AND r.team = j.team
  WHERE r.row_num = 1
)
SELECT DISTINCT ON (player_id)
  player_id,
  player       AS player_name,
  team,
  ROUND(delta_cba, 1)  AS delta_cba,
  ROUND(delta_tog, 1)  AS delta_tog,
  CASE
    WHEN delta_cba >= 8  THEN 'MID BOOST'
    WHEN delta_cba <= -8 THEN 'ROLE LOSS'
    WHEN delta_tog <= -8 THEN 'TOG DROP'
    ELSE NULL
  END AS role_signal,
  CASE
    WHEN delta_cba >= 8  THEN LEAST(100, 50 + ROUND(delta_cba::numeric * 3, 0))::integer
    WHEN delta_cba <= -8 THEN LEAST(100, 50 + ROUND(ABS(delta_cba::numeric) * 3, 0))::integer
    WHEN delta_tog <= -8 THEN LEAST(100, 50 + ROUND(ABS(delta_tog::numeric) * 2, 0))::integer
    ELSE 0
  END AS role_signal_strength
FROM with_players
ORDER BY player_id;

GRANT SELECT ON public.v_neeko_role_change_signals TO anon, authenticated;


-- ── 3. Availability Flags ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_availability_flags
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  t.days_rest,
  t.quick_turnaround_flag,
  CASE WHEN t.quick_turnaround_flag = true THEN 'Quick turnaround — managed risk' ELSE NULL END AS availability_note
FROM afl.v_neeko_player_recent_games r
JOIN afl.v_ai_team_match_features_2026_next_round t
  ON r.team = t.team
WHERE r.row_num = 1;

GRANT SELECT ON public.v_neeko_availability_flags TO anon, authenticated;


-- ── 4. Value Engine (placeholder — no price data) ────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_value_engine
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  NULL::numeric   AS price,
  NULL::numeric   AS value_score,
  'NO DATA'::text AS value_tier
FROM public.v_neeko_intel_master_v2
WHERE false;  -- returns 0 rows cleanly; join is a safe LEFT JOIN

GRANT SELECT ON public.v_neeko_value_engine TO anon, authenticated;


-- ── 5. Leverage Engine (placeholder — no ownership data) ─────────────────────

CREATE OR REPLACE VIEW public.v_neeko_leverage_engine
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  NULL::numeric   AS projected_ownership_pct,
  NULL::numeric   AS leverage_score,
  'NO DATA'::text AS leverage_label
FROM public.v_neeko_intel_master_v2
WHERE false;

GRANT SELECT ON public.v_neeko_leverage_engine TO anon, authenticated;
