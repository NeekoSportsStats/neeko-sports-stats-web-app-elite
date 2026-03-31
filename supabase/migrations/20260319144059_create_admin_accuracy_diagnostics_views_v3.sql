/*
  # Admin Accuracy Diagnostics Views and RPCs (v3)
  
  Fixed ORDER BY referencing column aliases in SQL functions (need to use ordinal or repeat expression).
  All views and RPCs for the admin accuracy diagnostics workstation.
*/

-- ─── Base view ─────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_accuracy_base CASCADE;

CREATE VIEW public.v_accuracy_base AS
SELECT
  pe.id,
  pe.player_id,
  COALESCE(pl.player_name, pe.player_id::text)     AS player_name,
  COALESCE(pl.position_group, pe.position_group)   AS position_group,
  team_ref.team_name                               AS team,
  opp_ref.team_name                                AS opponent_team,
  pe.season,
  pe.round                                         AS round_label,
  COALESCE(
    NULLIF(REGEXP_REPLACE(pe.round, '[^0-9]', '', 'g'), '')::integer,
    NULL
  )                                                AS round_number,
  pe.game_id,
  pe.game_date,
  pe.projected_score                               AS projection,
  pe.actual_score,
  pe.error_raw                                     AS error,
  pe.error_abs                                     AS abs_error,
  (pe.error_raw)^2                                 AS sq_error,
  (pe.error_abs <= 5)                              AS within_5,
  (pe.error_abs <= 10)                             AS within_10,
  (pe.error_abs <= 15)                             AS within_15,
  (pe.error_abs <= 20)                             AS within_20,
  (pe.error_abs <= 25)                             AS within_25,
  (pe.error_abs <= 30)                             AS within_30,
  (pe.error_raw > 0)                               AS under_projected,
  (pe.error_raw < 0)                               AS over_projected,
  pe.projection_confidence,
  pe.confidence_tier,
  pe.risk_rating,
  pe.form_rating,
  pe.matchup_rating,
  pe.volatility_score,
  pe.stability_score,
  pe.bucket_projection_range                       AS projection_bucket,
  pe.bucket_confidence_range                       AS confidence_bucket,
  prc.price,
  CASE
    WHEN prc.price IS NULL OR prc.price = 0 THEN 'Unknown'
    WHEN prc.price < 200000 THEN 'Budget (<200k)'
    WHEN prc.price < 400000 THEN 'Mid (200-400k)'
    WHEN prc.price < 600000 THEN 'Premium (400-600k)'
    ELSE 'Elite (600k+)'
  END                                              AS price_tier,
  pe.created_at
FROM afl.player_projection_error pe
LEFT JOIN afl.players pl
  ON pl.player_id = pe.player_id
LEFT JOIN (
  SELECT DISTINCT ON (team_id) team_id, team_name
  FROM afl.raw_player_stats
  ORDER BY team_id, season DESC
) team_ref ON team_ref.team_id = pe.team_id
LEFT JOIN (
  SELECT DISTINCT ON (team_id) team_id, team_name
  FROM afl.raw_player_stats
  ORDER BY team_id, season DESC
) opp_ref ON opp_ref.team_id = pe.opponent_team_id
LEFT JOIN afl.player_rankings_cache prc ON prc.player_id = pe.player_id
WHERE pe.projected_score IS NOT NULL
  AND pe.actual_score    IS NOT NULL
  AND pe.error_abs       IS NOT NULL;

GRANT SELECT ON public.v_accuracy_base TO authenticated;
GRANT SELECT ON public.v_accuracy_base TO anon;

-- ─── RPC: KPI Summary ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_kpi_summary(integer);

CREATE FUNCTION public.get_accuracy_kpi_summary(
  p_season integer DEFAULT NULL
)
RETURNS TABLE (
  total_predictions    bigint,
  players_evaluated    bigint,
  games_evaluated      bigint,
  latest_round         integer,
  latest_round_mae     numeric,
  season_mae           numeric,
  season_median_ae     numeric,
  season_rmse          numeric,
  within_5_pct         numeric,
  within_10_pct        numeric,
  within_15_pct        numeric,
  within_20_pct        numeric,
  within_25_pct        numeric,
  avg_signed_error     numeric,
  over_projection_pct  numeric,
  under_projection_pct numeric,
  best_position        text,
  worst_position       text,
  best_position_mae    numeric,
  worst_position_mae   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_round    integer;
  v_best_pos        text;
  v_worst_pos       text;
  v_best_pos_mae    numeric;
  v_worst_pos_mae   numeric;
BEGIN
  SELECT MAX(round_number) INTO v_latest_round
  FROM public.v_accuracy_base
  WHERE (p_season IS NULL OR season = p_season) AND round_number IS NOT NULL;

  SELECT position_group, ROUND(AVG(abs_error)::numeric, 2)
  INTO v_best_pos, v_best_pos_mae
  FROM public.v_accuracy_base
  WHERE position_group IS NOT NULL AND (p_season IS NULL OR season = p_season)
  GROUP BY position_group ORDER BY 2 ASC LIMIT 1;

  SELECT position_group, ROUND(AVG(abs_error)::numeric, 2)
  INTO v_worst_pos, v_worst_pos_mae
  FROM public.v_accuracy_base
  WHERE position_group IS NOT NULL AND (p_season IS NULL OR season = p_season)
  GROUP BY position_group ORDER BY 2 DESC LIMIT 1;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COUNT(DISTINCT b.player_id)::bigint,
    COUNT(DISTINCT b.game_id)::bigint,
    v_latest_round,
    ROUND((SELECT AVG(x.abs_error) FROM public.v_accuracy_base x
           WHERE x.round_number = v_latest_round
             AND (p_season IS NULL OR x.season = p_season))::numeric, 2),
    ROUND(AVG(b.abs_error)::numeric, 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    ROUND(SQRT(AVG(b.sq_error))::numeric, 2),
    ROUND(100.0 * AVG(b.within_5::int)::numeric, 1),
    ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
    ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
    ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
    ROUND(100.0 * AVG(b.within_25::int)::numeric, 1),
    ROUND(AVG(b.error)::numeric, 2),
    ROUND(100.0 * AVG(b.over_projected::int)::numeric, 1),
    ROUND(100.0 * AVG(b.under_projected::int)::numeric, 1),
    v_best_pos,
    v_worst_pos,
    v_best_pos_mae,
    v_worst_pos_mae
  FROM public.v_accuracy_base b
  WHERE (p_season IS NULL OR b.season = p_season);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_kpi_summary(integer) TO authenticated;

-- ─── RPC: By Round ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_by_round(integer, text, text);

CREATE FUNCTION public.get_accuracy_by_round(
  p_season   integer DEFAULT NULL,
  p_team     text    DEFAULT NULL,
  p_position text    DEFAULT NULL
)
RETURNS TABLE (
  round_number        integer,
  round_label         text,
  predictions_count   bigint,
  mae                 numeric,
  median_ae           numeric,
  rmse                numeric,
  within_5_pct        numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  within_25_pct       numeric,
  avg_signed_error    numeric,
  over_pct            numeric,
  under_pct           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.round_number::integer,
  b.round_label,
  COUNT(*)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
  ROUND(SQRT(AVG(b.sq_error))::numeric, 2),
  ROUND(100.0 * AVG(b.within_5::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_25::int)::numeric, 1),
  ROUND(AVG(b.error)::numeric, 2),
  ROUND(100.0 * AVG(b.over_projected::int)::numeric, 1),
  ROUND(100.0 * AVG(b.under_projected::int)::numeric, 1)
FROM public.v_accuracy_base b
WHERE (p_season IS NULL   OR b.season = p_season)
  AND (p_team IS NULL     OR b.team ILIKE p_team)
  AND (p_position IS NULL OR b.position_group ILIKE p_position)
  AND b.round_number IS NOT NULL
GROUP BY b.round_number, b.round_label
ORDER BY b.round_number
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_by_round(integer, text, text) TO authenticated;

-- ─── RPC: By Team ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_by_team(integer, text);

CREATE FUNCTION public.get_accuracy_by_team(
  p_season   integer DEFAULT NULL,
  p_position text    DEFAULT NULL
)
RETURNS TABLE (
  team                text,
  predictions_count   bigint,
  mae                 numeric,
  median_ae           numeric,
  within_5_pct        numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  within_25_pct       numeric,
  avg_signed_error    numeric,
  over_count          bigint,
  under_count         bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.team,
  COUNT(*)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
  ROUND(100.0 * AVG(b.within_5::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_25::int)::numeric, 1),
  ROUND(AVG(b.error)::numeric, 2),
  SUM(b.over_projected::int)::bigint,
  SUM(b.under_projected::int)::bigint
FROM public.v_accuracy_base b
WHERE b.team IS NOT NULL
  AND (p_season IS NULL   OR b.season = p_season)
  AND (p_position IS NULL OR b.position_group ILIKE p_position)
GROUP BY b.team
ORDER BY ROUND(AVG(b.abs_error)::numeric, 2) ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_by_team(integer, text) TO authenticated;

-- ─── RPC: By Opponent ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_by_opponent(integer, text);

CREATE FUNCTION public.get_accuracy_by_opponent(
  p_season   integer DEFAULT NULL,
  p_position text    DEFAULT NULL
)
RETURNS TABLE (
  opponent_team       text,
  predictions_count   bigint,
  mae                 numeric,
  median_ae           numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  avg_signed_error    numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.opponent_team,
  COUNT(*)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
  ROUND(AVG(b.error)::numeric, 2)
FROM public.v_accuracy_base b
WHERE b.opponent_team IS NOT NULL
  AND (p_season IS NULL   OR b.season = p_season)
  AND (p_position IS NULL OR b.position_group ILIKE p_position)
GROUP BY b.opponent_team
ORDER BY ROUND(AVG(b.abs_error)::numeric, 2) ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_by_opponent(integer, text) TO authenticated;

-- ─── RPC: By Position ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_by_position(integer, text);

CREATE FUNCTION public.get_accuracy_by_position(
  p_season integer DEFAULT NULL,
  p_team   text    DEFAULT NULL
)
RETURNS TABLE (
  position_group      text,
  predictions_count   bigint,
  players_count       bigint,
  mae                 numeric,
  median_ae           numeric,
  rmse                numeric,
  within_5_pct        numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  within_25_pct       numeric,
  avg_signed_error    numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.position_group,
  COUNT(*)::bigint,
  COUNT(DISTINCT b.player_id)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
  ROUND(SQRT(AVG(b.sq_error))::numeric, 2),
  ROUND(100.0 * AVG(b.within_5::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_25::int)::numeric, 1),
  ROUND(AVG(b.error)::numeric, 2)
FROM public.v_accuracy_base b
WHERE b.position_group IS NOT NULL
  AND (p_season IS NULL OR b.season = p_season)
  AND (p_team IS NULL   OR b.team ILIKE p_team)
GROUP BY b.position_group
ORDER BY ROUND(AVG(b.abs_error)::numeric, 2) ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_by_position(integer, text) TO authenticated;

-- ─── RPC: By Tier ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_by_tier(integer, text);

CREATE FUNCTION public.get_accuracy_by_tier(
  p_season    integer DEFAULT NULL,
  p_tier_type text    DEFAULT 'confidence'
)
RETURNS TABLE (
  tier_label          text,
  predictions_count   bigint,
  mae                 numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  avg_signed_error    numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  CASE
    WHEN p_tier_type = 'confidence' THEN COALESCE(b.confidence_tier, 'Unknown')
    WHEN p_tier_type = 'price'      THEN b.price_tier
    ELSE COALESCE(b.projection_bucket, 'Unknown')
  END                                                AS tier_label,
  COUNT(*)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_20::int)::numeric, 1),
  ROUND(AVG(b.error)::numeric, 2)
FROM public.v_accuracy_base b
WHERE (p_season IS NULL OR b.season = p_season)
GROUP BY 1
ORDER BY ROUND(AVG(b.abs_error)::numeric, 2) ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_by_tier(integer, text) TO authenticated;

-- ─── RPC: Player Diagnostics ───────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_player_diagnostics(integer, text, text, integer, text, text, integer);

CREATE FUNCTION public.get_accuracy_player_diagnostics(
  p_season     integer DEFAULT NULL,
  p_team       text    DEFAULT NULL,
  p_position   text    DEFAULT NULL,
  p_min_games  integer DEFAULT 3,
  p_search     text    DEFAULT NULL,
  p_sort_by    text    DEFAULT 'mae',
  p_limit      integer DEFAULT 50
)
RETURNS TABLE (
  player_id        integer,
  player_name      text,
  team             text,
  position_group   text,
  games_evaluated  bigint,
  avg_projection   numeric,
  avg_actual       numeric,
  avg_signed_error numeric,
  mae              numeric,
  within_10_pct    numeric,
  within_15_pct    numeric,
  best_score       numeric,
  worst_miss       numeric,
  over_count       bigint,
  under_count      bigint,
  tendency         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.player_id,
  b.player_name,
  b.team,
  b.position_group,
  COUNT(*)::bigint                                           AS games_evaluated,
  ROUND(AVG(b.projection)::numeric, 1)                      AS avg_projection,
  ROUND(AVG(b.actual_score)::numeric, 1)                    AS avg_actual,
  ROUND(AVG(b.error)::numeric, 2)                           AS avg_signed_error,
  ROUND(AVG(b.abs_error)::numeric, 2)                       AS mae,
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1)          AS within_10_pct,
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1)          AS within_15_pct,
  ROUND(MAX(b.actual_score)::numeric, 0)                    AS best_score,
  ROUND(MAX(b.abs_error)::numeric, 0)                       AS worst_miss,
  SUM(b.over_projected::int)::bigint                        AS over_count,
  SUM(b.under_projected::int)::bigint                       AS under_count,
  CASE
    WHEN AVG(b.error) < -5 THEN 'Over-projected'
    WHEN AVG(b.error) > 5  THEN 'Under-projected'
    ELSE 'Balanced'
  END                                                        AS tendency
FROM public.v_accuracy_base b
WHERE (p_season IS NULL   OR b.season = p_season)
  AND (p_team IS NULL     OR b.team ILIKE p_team)
  AND (p_position IS NULL OR b.position_group ILIKE p_position)
  AND (p_search IS NULL   OR b.player_name ILIKE '%' || p_search || '%')
GROUP BY b.player_id, b.player_name, b.team, b.position_group
HAVING COUNT(*) >= p_min_games
ORDER BY
  CASE WHEN p_sort_by = 'mae'       THEN AVG(b.abs_error)               END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'over'      THEN AVG(b.error)                   END ASC  NULLS LAST,
  CASE WHEN p_sort_by = 'under'     THEN AVG(b.error)                   END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'games'     THEN COUNT(*)::numeric              END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'within_10' THEN AVG(b.within_10::int)::numeric END ASC  NULLS LAST
LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_player_diagnostics(integer, text, text, integer, text, text, integer) TO authenticated;

-- ─── RPC: Error Distribution ───────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_error_distribution(integer, text, text);

CREATE FUNCTION public.get_accuracy_error_distribution(
  p_season   integer DEFAULT NULL,
  p_position text    DEFAULT NULL,
  p_team     text    DEFAULT NULL
)
RETURNS TABLE (
  band       text,
  sort_order integer,
  count      bigint,
  pct        numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT abs_error
  FROM public.v_accuracy_base
  WHERE (p_season IS NULL   OR season = p_season)
    AND (p_position IS NULL OR position_group ILIKE p_position)
    AND (p_team IS NULL     OR team ILIKE p_team)
),
bucketed AS (
  SELECT
    CASE
      WHEN abs_error <= 5  THEN '0–5'
      WHEN abs_error <= 10 THEN '6–10'
      WHEN abs_error <= 15 THEN '11–15'
      WHEN abs_error <= 20 THEN '16–20'
      WHEN abs_error <= 25 THEN '21–25'
      WHEN abs_error <= 30 THEN '26–30'
      ELSE '31+'
    END AS band,
    CASE
      WHEN abs_error <= 5  THEN 1
      WHEN abs_error <= 10 THEN 2
      WHEN abs_error <= 15 THEN 3
      WHEN abs_error <= 20 THEN 4
      WHEN abs_error <= 25 THEN 5
      WHEN abs_error <= 30 THEN 6
      ELSE 7
    END AS sort_order
  FROM base
),
totals AS (SELECT COUNT(*) AS n FROM bucketed)
SELECT
  b.band,
  b.sort_order::integer,
  COUNT(*)::bigint,
  ROUND(100.0 * COUNT(*) / NULLIF(MAX(t.n), 0)::numeric, 1)
FROM bucketed b
CROSS JOIN totals t
GROUP BY b.band, b.sort_order
ORDER BY b.sort_order
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_error_distribution(integer, text, text) TO authenticated;

-- ─── RPC: Games Summary ────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_accuracy_games(integer, integer, text);

CREATE FUNCTION public.get_accuracy_games(
  p_season integer DEFAULT NULL,
  p_round  integer DEFAULT NULL,
  p_team   text    DEFAULT NULL
)
RETURNS TABLE (
  game_id          integer,
  round_label      text,
  round_number     integer,
  game_date        timestamp with time zone,
  team_a           text,
  team_b           text,
  player_count     bigint,
  mae              numeric,
  within_10_pct    numeric,
  within_15_pct    numeric,
  biggest_miss     numeric,
  avg_signed_error numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  b.game_id,
  b.round_label,
  b.round_number::integer,
  MIN(b.game_date),
  MIN(b.team),
  MIN(b.opponent_team),
  COUNT(*)::bigint,
  ROUND(AVG(b.abs_error)::numeric, 2),
  ROUND(100.0 * AVG(b.within_10::int)::numeric, 1),
  ROUND(100.0 * AVG(b.within_15::int)::numeric, 1),
  ROUND(MAX(b.abs_error)::numeric, 0),
  ROUND(AVG(b.error)::numeric, 2)
FROM public.v_accuracy_base b
WHERE b.game_id IS NOT NULL
  AND (p_season IS NULL OR b.season = p_season)
  AND (p_round  IS NULL OR b.round_number = p_round)
  AND (p_team   IS NULL OR b.team ILIKE p_team OR b.opponent_team ILIKE p_team)
GROUP BY b.game_id, b.round_label, b.round_number
ORDER BY b.round_number DESC NULLS LAST, ROUND(AVG(b.abs_error)::numeric, 2) DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_games(integer, integer, text) TO authenticated;
