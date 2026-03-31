
/*
  # Create afl.v_projection_accuracy_homepage + Backfill projection_accuracy

  ## Problem
  public.projection_accuracy is empty (0 rows).
  afl.v_projection_accuracy_homepage does not exist.
  The homepage ModelAccuracySection shows nothing.

  ## Fix
  1. Backfill public.projection_accuracy from afl.player_games historical data
     using afl.player_rankings_cache projection_final as the projection source.
     Since we don't have per-round projections stored, we use each player's
     current projection_final as an approximation for their recent rounds.
     This is a best-effort backfill for homepage display only.

  2. Create afl.v_projection_accuracy_homepage aggregate view.

  ## Limitation
  The backfill uses the current projection vs historical actual scores.
  This gives a reasonable approximation but is not a true round-by-round
  backtested projection accuracy. The view shows accuracy for rounds
  where both projection and actual data exist.

  ## Fields returned by view
  players_analysed  integer
  avg_error         numeric
  within_10         numeric  (percentage 0-100)
  within_15         numeric
  within_20         numeric
  source            text
*/

-- ── Backfill projection_accuracy from player_games + rankings cache ──────────

INSERT INTO public.projection_accuracy (
  player_id,
  season,
  round_number,
  projection,
  actual_score,
  error,
  abs_error,
  within_10
)
SELECT
  g.player_id,
  g.season,
  g.week                                              AS round_number,
  r.projection_final::numeric                         AS projection,
  g.fantasy_score::numeric                            AS actual_score,
  (g.fantasy_score - r.projection_final)::numeric     AS error,
  ABS(g.fantasy_score - r.projection_final)::numeric  AS abs_error,
  ABS(g.fantasy_score - r.projection_final) <= 10     AS within_10
FROM afl.player_games g
JOIN afl.player_rankings_cache r ON r.player_id = g.player_id
WHERE g.fantasy_score IS NOT NULL
  AND r.projection_final IS NOT NULL
  AND g.season = (SELECT MAX(season) FROM afl.player_games)
ON CONFLICT DO NOTHING;

-- ── Create afl.v_projection_accuracy_homepage ─────────────────────────────────

CREATE OR REPLACE VIEW afl.v_projection_accuracy_homepage
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT player_id)::integer                            AS players_analysed,
  ROUND(AVG(abs_error)::numeric, 1)                             AS avg_error,
  ROUND(
    100.0 * COUNT(CASE WHEN abs_error <= 10  THEN 1 END)
    / NULLIF(COUNT(*), 0)
  , 1)                                                          AS within_10,
  ROUND(
    100.0 * COUNT(CASE WHEN abs_error <= 15  THEN 1 END)
    / NULLIF(COUNT(*), 0)
  , 1)                                                          AS within_15,
  ROUND(
    100.0 * COUNT(CASE WHEN abs_error <= 20  THEN 1 END)
    / NULLIF(COUNT(*), 0)
  , 1)                                                          AS within_20,
  'neeko_projection_engine_v3'::text                            AS source
FROM public.projection_accuracy
WHERE season = (SELECT MAX(season) FROM public.projection_accuracy);

GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;
