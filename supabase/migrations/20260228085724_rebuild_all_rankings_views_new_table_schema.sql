/*
  # Rebuild all rankings views for new ai_rankings_player_recos schema

  ## Summary
  The ai_rankings_player_recos table was rebuilt with player_id as sole PK
  and an updated_at column for staleness tracking. All dependent views must
  be recreated to match the new schema.

  ## Changes
  1. Recreate v_rankings_premium — simplified join (no season/round filter needed)
  2. Create v_ai_player_ranking_openai_inputs_2026 — input view with fixture context
  3. Create v_ai_rankings_generation_queue — staleness-based queue (50 rows, 3-day TTL)
  4. Recreate v_rankings_master — unified premium view exposed to frontend

  ## Security
  - All views grant SELECT to authenticated and anon
*/

-- ─── 1. Recreate v_rankings_premium ─────────────────────────────────────────

DROP VIEW IF EXISTS public.v_rankings_premium CASCADE;

CREATE VIEW public.v_rankings_premium AS
SELECT
  proj.player_id,
  proj.player_name,
  proj.team,
  CASE
    WHEN pc."position" ILIKE '%defender%' THEN 'DEF'
    WHEN pc."position" ILIKE '%forward%'  THEN 'FWD'
    WHEN pc."position" ILIKE '%mid%'      THEN 'MID'
    WHEN pc."position" ILIKE '%ruck%'     THEN 'RUC'
    ELSE 'MID'
  END AS "position",
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,
  (CASE
    WHEN proj.trend_3_vs_10 >= 15  THEN 90
    WHEN proj.trend_3_vs_10 >= 8   THEN 80
    WHEN proj.trend_3_vs_10 >= 3   THEN 70
    WHEN proj.trend_3_vs_10 >= -3  THEN 60
    WHEN proj.trend_3_vs_10 >= -10 THEN 45
    ELSE 30
  END)::numeric AS form_rating,
  (CASE
    WHEN proj.matchup_delta >= 10 THEN 90
    WHEN proj.matchup_delta >= 5  THEN 80
    WHEN proj.matchup_delta >= 0  THEN 65
    WHEN proj.matchup_delta >= -5 THEN 50
    ELSE 35
  END)::numeric AS matchup_rating,
  CASE
    WHEN proj.projection_final > 0
    THEN round(((proj.ceiling_estimate - proj.projection_final) / proj.projection_final) * 100)
    ELSE NULL
  END AS upside_rating,
  CASE
    WHEN proj.projection_final > 0
    THEN round(((proj.projection_final - proj.floor_estimate) / proj.projection_final) * 100)
    ELSE NULL
  END AS risk_rating,
  round(proj.consistency_score) AS projection_confidence,
  lr.recommendation_label AS ai_recommendation,
  lr.recommendation_long  AS ai_analysis,
  round((
    (COALESCE(proj.projection_final, 0)             * 0.45) +
    (COALESCE(proj.ceiling_estimate, 0)             * 0.25) +
    (COALESCE(proj.consistency_score::numeric, 0)   * 0.20) +
    (GREATEST(COALESCE(proj.matchup_delta, 0), 0)   * 1.5)  +
    (GREATEST(COALESCE(proj.trend_3_vs_10, 0), 0)   * 0.8)
  ), 1) AS captain_score,
  CASE
    WHEN proj.projection_final >= 115 AND proj.consistency_score >= 70 THEN 'Elite Captain'
    WHEN proj.projection_final >= 105 AND proj.consistency_score >= 60 THEN 'Strong Captain'
    WHEN proj.projection_final >= 95                                    THEN 'Captain Option'
    ELSE 'Risky Captain'
  END AS captain_rating
FROM v_player_detail_premium proj
LEFT JOIN afl.players_canonical pc
  ON  pc.player_name = proj.player_name
  AND pc.team        = proj.team
  AND pc.season      = 2026
LEFT JOIN public.ai_rankings_player_recos lr
  ON lr.player_id = proj.player_id::bigint;

GRANT SELECT ON public.v_rankings_premium TO authenticated, anon;

-- ─── 2. Create v_ai_player_ranking_openai_inputs_2026 ────────────────────────

DROP VIEW IF EXISTS public.v_ai_player_ranking_openai_inputs_2026 CASCADE;

CREATE VIEW public.v_ai_player_ranking_openai_inputs_2026 AS
WITH home_fixtures AS (
  SELECT DISTINCT ON (f.home_team)
    f.home_team  AS team,
    f.away_team  AS opponent,
    f.venue,
    f.kickoff_at,
    f.round_number
  FROM afl.v_fixtures_canonical f
  WHERE f.season = 2026
    AND f.kickoff_at > now()
  ORDER BY f.home_team, f.kickoff_at ASC
),
away_fixtures AS (
  SELECT DISTINCT ON (f.away_team)
    f.away_team  AS team,
    f.home_team  AS opponent,
    f.venue,
    f.kickoff_at,
    f.round_number
  FROM afl.v_fixtures_canonical f
  WHERE f.season = 2026
    AND f.kickoff_at > now()
  ORDER BY f.away_team, f.kickoff_at ASC
),
all_fixtures AS (
  SELECT * FROM home_fixtures
  UNION ALL
  SELECT * FROM away_fixtures
),
deduped_fixtures AS (
  SELECT DISTINCT ON (team)
    team, opponent, venue, kickoff_at, round_number
  FROM all_fixtures
  ORDER BY team, kickoff_at ASC
)
SELECT
  r.player_id::bigint                AS player_id,
  r.player_name,
  r.team,
  r."position",
  jsonb_build_object(
    'player',                r.player_name,
    'team',                  r.team,
    'position',              r."position",
    'projection_final',      r.projection_final,
    'ceiling_estimate',      r.ceiling_estimate,
    'floor_estimate',        r.floor_estimate,
    'consistency_score',     r.consistency_score,
    'form_rating',           r.form_rating,
    'matchup_rating',        r.matchup_rating,
    'upside_rating',         r.upside_rating,
    'risk_rating',           r.risk_rating,
    'projection_confidence', r.projection_confidence,
    'captain_score',         r.captain_score,
    'captain_rating',        r.captain_rating,
    'upcoming_opponent',     df.opponent,
    'upcoming_venue',        df.venue,
    'upcoming_kickoff',      df.kickoff_at,
    'upcoming_round',        df.round_number
  ) AS openai_input_json
FROM public.v_rankings_premium r
LEFT JOIN deduped_fixtures df ON df.team = r.team
WHERE r.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_ranking_openai_inputs_2026 TO authenticated, anon;

-- ─── 3. Create v_ai_rankings_generation_queue ────────────────────────────────

DROP VIEW IF EXISTS public.v_ai_rankings_generation_queue CASCADE;

CREATE VIEW public.v_ai_rankings_generation_queue AS
SELECT
  inp.player_id,
  inp.player_name,
  inp.team,
  inp."position",
  inp.openai_input_json,
  rec.updated_at
FROM public.v_ai_player_ranking_openai_inputs_2026 inp
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = inp.player_id
WHERE
  rec.player_id IS NULL
  OR rec.updated_at < now() - interval '3 days'
ORDER BY rec.updated_at ASC NULLS FIRST
LIMIT 50;

GRANT SELECT ON public.v_ai_rankings_generation_queue TO authenticated, anon;

-- ─── 4. Recreate v_rankings_master ───────────────────────────────────────────

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  "position",
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  ai_analysis,
  captain_score,
  captain_rating
FROM public.v_rankings_premium
ORDER BY projection_final DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO authenticated, anon;
