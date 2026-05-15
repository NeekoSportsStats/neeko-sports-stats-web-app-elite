/*
  # Create Projection Review RPCs

  ## Purpose
  Exposes player-level and aggregated projection accuracy data for the
  Admin Player Lab "Projection Review" subtab. Admin-only, read-only.

  ## New Functions
  - `get_projection_review(p_round, p_position, p_limit)`
    Per-game rows with signed_error, accuracy_pct, error_direction, within_N booleans.

  - `get_projection_review_summary()`
    Aggregated breakdowns by round, position, confidence tier, projection bucket.

  ## Security
  - SECURITY DEFINER with admin guard
  - Granted to authenticated only
*/

-- ─── Row-level projection review ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_projection_review(
  p_round    integer DEFAULT NULL,
  p_position text    DEFAULT NULL,
  p_limit    integer DEFAULT 500
)
RETURNS TABLE (
  player_id           integer,
  player_name         text,
  team                text,
  position_group      text,
  opponent_team       text,
  round_number        integer,
  round_label         text,
  game_date           timestamptz,
  projection          numeric,
  actual_score        numeric,
  signed_error        numeric,
  absolute_error      numeric,
  accuracy_pct        numeric,
  error_direction     text,
  within_5            boolean,
  within_10           boolean,
  within_15           boolean,
  within_20           boolean,
  within_25           boolean,
  within_30           boolean,
  confidence_tier     text,
  risk_rating         text,
  projection_bucket   text,
  price               integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    b.player_id,
    b.player_name,
    b.team,
    b.position_group,
    b.opponent_team,
    b.round_number,
    b.round_label,
    b.game_date,
    b.projection,
    b.actual_score,
    (b.actual_score - b.projection)::numeric(6,2)                                AS signed_error,
    b.abs_error                                                                  AS absolute_error,
    GREATEST(0, LEAST(100,
      100 - (b.abs_error / NULLIF(GREATEST(ABS(b.actual_score), ABS(b.projection), 1), 0)) * 100
    ))::numeric(5,1)                                                             AS accuracy_pct,
    CASE
      WHEN (b.actual_score - b.projection) > 5  THEN 'under_projected'
      WHEN (b.actual_score - b.projection) < -5 THEN 'over_projected'
      ELSE 'on_target'
    END                                                                          AS error_direction,
    b.within_5,
    b.within_10,
    b.within_15,
    b.within_20,
    b.within_25,
    b.within_30,
    b.confidence_tier,
    b.risk_rating,
    b.projection_bucket,
    b.price
  FROM public.v_accuracy_base b
  WHERE b.actual_score > 0
    AND (p_round    IS NULL OR b.round_number = p_round)
    AND (p_position IS NULL OR b.position_group = p_position)
  ORDER BY b.game_date DESC, b.abs_error DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_projection_review(integer, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_projection_review(integer, text, integer) FROM anon;

-- ─── Aggregated summary ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_projection_review_summary()
RETURNS TABLE (
  summary_type        text,
  dimension           text,
  games_count         integer,
  avg_mae             numeric,
  median_mae          numeric,
  avg_signed_error    numeric,
  within_5_pct        numeric,
  within_10_pct       numeric,
  within_15_pct       numeric,
  within_20_pct       numeric,
  within_25_pct       numeric,
  within_30_pct       numeric,
  over_projected_pct  numeric,
  under_projected_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- overall
  RETURN QUERY
  SELECT
    'overall'::text,
    'All'::text,
    count(*)::integer,
    round(avg(b.abs_error)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    round(avg(b.actual_score - b.projection)::numeric, 2),
    round(avg(CASE WHEN b.within_5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_10 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_15 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_20 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_25 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_30 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) < -5 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) > 5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1)
  FROM public.v_accuracy_base b WHERE b.actual_score > 0;

  -- by round
  RETURN QUERY
  SELECT
    'by_round'::text,
    COALESCE(b.round_label, 'R' || b.round_number::text),
    count(*)::integer,
    round(avg(b.abs_error)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    round(avg(b.actual_score - b.projection)::numeric, 2),
    round(avg(CASE WHEN b.within_5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_10 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_15 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_20 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_25 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_30 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) < -5 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) > 5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1)
  FROM public.v_accuracy_base b WHERE b.actual_score > 0
  GROUP BY b.round_label, b.round_number
  ORDER BY b.round_number DESC;

  -- by position
  RETURN QUERY
  SELECT
    'by_position'::text,
    COALESCE(b.position_group, 'Unknown'),
    count(*)::integer,
    round(avg(b.abs_error)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    round(avg(b.actual_score - b.projection)::numeric, 2),
    round(avg(CASE WHEN b.within_5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_10 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_15 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_20 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_25 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_30 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) < -5 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) > 5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1)
  FROM public.v_accuracy_base b WHERE b.actual_score > 0
  GROUP BY b.position_group;

  -- by confidence tier
  RETURN QUERY
  SELECT
    'by_confidence'::text,
    COALESCE(b.confidence_tier, 'Unknown'),
    count(*)::integer,
    round(avg(b.abs_error)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    round(avg(b.actual_score - b.projection)::numeric, 2),
    round(avg(CASE WHEN b.within_5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_10 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_15 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_20 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_25 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_30 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) < -5 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) > 5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1)
  FROM public.v_accuracy_base b WHERE b.actual_score > 0
  GROUP BY b.confidence_tier;

  -- by projection bucket
  RETURN QUERY
  SELECT
    'by_proj_bucket'::text,
    COALESCE(b.projection_bucket, 'Unknown'),
    count(*)::integer,
    round(avg(b.abs_error)::numeric, 2),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.abs_error)::numeric, 2),
    round(avg(b.actual_score - b.projection)::numeric, 2),
    round(avg(CASE WHEN b.within_5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_10 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_15 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_20 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_25 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN b.within_30 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) < -5 THEN 1.0 ELSE 0.0 END)::numeric * 100, 1),
    round(avg(CASE WHEN (b.actual_score - b.projection) > 5  THEN 1.0 ELSE 0.0 END)::numeric * 100, 1)
  FROM public.v_accuracy_base b WHERE b.actual_score > 0
  GROUP BY b.projection_bucket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_projection_review_summary() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_projection_review_summary() FROM anon;
