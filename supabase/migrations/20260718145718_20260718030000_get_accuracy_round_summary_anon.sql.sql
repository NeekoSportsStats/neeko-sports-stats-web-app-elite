/*
# Create anon-callable round accuracy summary RPC

## Purpose
Exposes per-round projection-accuracy summary data to unauthenticated clients.
Mirrors a subset of the admin-gated `get_projection_review_summary()` output
but scoped to a single round (defaults to the latest completed round of the
given season) and with no `profiles.is_admin` guard.

## Background
- `public.projection_accuracy` stores per-player, per-game projection vs actual.
- `public.player_rankings_cache` provides `player_name` joined on `player_id`.
- Both tables have anon SELECT granted (verified via `has_table_privilege`).
- The existing `get_projection_review_summary()` and `get_projection_review()`
  RPCs are admin-gated inside the function body, so anon clients cannot call
  them. This new RPC fills that gap for content surfaces.

## New function
- `public.get_accuracy_round_summary(p_season integer DEFAULT 2026,
  p_round integer DEFAULT NULL)`
  - Returns one summary row with round metadata, games count, avg + within-10
    accuracy percentages, over/under projection split, and the best and worst
    individual calls with player name, projected, and actual.

## Security
- `SECURITY DEFINER`, `SET search_path = public` -- runs as the function owner
  (postgres) with a pinned search path. No `auth.uid()` check, by design:
  this is intentionally public round-summary data for content/marketing.
- `GRANT EXECUTE TO anon, authenticated` so the anon-key frontend can call it.
- No admin guard (contrast with `get_projection_review_summary`).

## Notes
1. Source: `projection_accuracy` (raw table, anon-SELECT-able, no view drift).
2. Name join: `player_rankings_cache.player_name` (text) on `player_id`.
3. Projection = `projected_score` (numeric); actual = `actual_score` (numeric).
4. Best/worst call selection uses `abs_error` ASC/DESC, filtered to rows where
   both `projected_score` and `actual_score` are non-null and `actual_score > 0`.
5. Idempotent: uses `CREATE OR REPLACE FUNCTION`.
*/

CREATE OR REPLACE FUNCTION public.get_accuracy_round_summary(
  p_season integer DEFAULT 2026,
  p_round  integer DEFAULT NULL
)
RETURNS TABLE (
  round_number         integer,
  round_label          text,
  games_count          integer,
  avg_mae              numeric,
  within_10_pct        numeric,
  over_projected_pct   numeric,
  under_projected_pct  numeric,
  best_call_name       text,
  best_call_projected  numeric,
  best_call_actual     numeric,
  worst_call_name      text,
  worst_call_projected numeric,
  worst_call_actual    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round integer;
  v_label text;
BEGIN
  IF p_round IS NOT NULL THEN
    v_round := p_round;
    SELECT pa.round_label INTO v_label
    FROM public.projection_accuracy pa
    WHERE pa.season = p_season
      AND pa.round_number = p_round
      AND pa.actual_score IS NOT NULL
      AND pa.actual_score > 0
    ORDER BY pa.round_label NULLS LAST, pa.created_at DESC
    LIMIT 1;
  ELSE
    SELECT pa.round_number, pa.round_label
      INTO v_round, v_label
    FROM public.projection_accuracy pa
    WHERE pa.season = p_season
      AND pa.actual_score IS NOT NULL
      AND pa.actual_score > 0
    ORDER BY pa.round_number DESC, pa.created_at DESC
    LIMIT 1;
  END IF;

  IF v_round IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH round_rows AS (
    SELECT
      pa.player_id,
      pa.round_number,
      pa.round_label,
      pa.projected_score,
      pa.actual_score,
      pa.abs_error
    FROM public.projection_accuracy pa
    WHERE pa.season = p_season
      AND pa.round_number = v_round
      AND pa.actual_score IS NOT NULL
      AND pa.actual_score > 0
      AND pa.projected_score IS NOT NULL
  ),
  named AS (
    SELECT
      r.player_id,
      c.player_name,
      r.round_number,
      COALESCE(r.round_label, 'R' || r.round_number::text) AS round_label,
      r.projected_score,
      r.actual_score,
      r.abs_error,
      (r.actual_score - r.projected_score) AS signed_error
    FROM round_rows r
    LEFT JOIN public.player_rankings_cache c ON c.player_id = r.player_id
  ),
  agg AS (
    SELECT
      COUNT(*)::integer                                AS games_count,
      ROUND(AVG(abs_error)::numeric, 2)               AS avg_mae,
      ROUND(AVG(CASE WHEN abs_error <= 10
                      THEN 1.0 ELSE 0.0 END)::numeric * 100, 1) AS within_10_pct,
      ROUND(AVG(CASE WHEN signed_error < -5
                      THEN 1.0 ELSE 0.0 END)::numeric * 100, 1) AS over_projected_pct,
      ROUND(AVG(CASE WHEN signed_error > 5
                      THEN 1.0 ELSE 0.0 END)::numeric * 100, 1) AS under_projected_pct
    FROM named
  ),
  best AS (
    SELECT player_name, projected_score, actual_score
    FROM named
    ORDER BY abs_error ASC, player_name NULLS LAST
    LIMIT 1
  ),
  worst AS (
    SELECT player_name, projected_score, actual_score
    FROM named
    ORDER BY abs_error DESC, player_name NULLS LAST
    LIMIT 1
  )
  SELECT
    v_round,
    COALESCE(v_label, 'R' || v_round::text),
    a.games_count,
    a.avg_mae,
    a.within_10_pct,
    a.over_projected_pct,
    a.under_projected_pct,
    b.player_name,
    b.projected_score,
    b.actual_score,
    w.player_name,
    w.projected_score,
    w.actual_score
  FROM agg a, best b, worst w;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accuracy_round_summary(integer, integer)
  TO anon, authenticated;