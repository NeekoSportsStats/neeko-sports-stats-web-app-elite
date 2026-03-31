/*
  # Phase 4: Accuracy Intelligence System

  Creates a player-level accuracy metrics table and supporting views for
  analysing projection model performance.

  ## Tables Created
  - afl.player_accuracy_metrics  — Per-player MAE, RMSE, hit rate, bias, etc.

  ## Views Created
  - public.v_accuracy_by_position  — Position-level accuracy breakdown
  - public.v_accuracy_leaderboard  — Best and worst predicted players
  - public.v_accuracy_round_summary — Round-level accuracy (latest rounds first)

  ## Function Created
  - afl.fn_refresh_player_accuracy_metrics() — Rebuilds from projection_accuracy
*/

-- ─── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.player_accuracy_metrics (
  player_id          integer     PRIMARY KEY REFERENCES afl.players(player_id) ON DELETE CASCADE,
  player_name        text,
  position           text,
  team               text,
  games_tracked      integer     NOT NULL DEFAULT 0,
  mae                numeric(6,2),
  rmse               numeric(6,2),
  avg_error          numeric(6,2),
  std_dev_error      numeric(6,2),
  directional_bias   text        CHECK (directional_bias IN ('over','under','neutral')),
  hit_rate_10        numeric(5,3),
  hit_rate_15        numeric(5,3),
  hit_rate_20        numeric(5,3),
  median_abs_error   numeric(6,2),
  p90_abs_error      numeric(6,2),
  best_round_error   numeric(6,2),
  worst_round_error  numeric(6,2),
  season             integer,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.player_accuracy_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accuracy metrics readable by all"
  ON afl.player_accuracy_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── Refresh Function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.fn_refresh_player_accuracy_metrics(p_season integer DEFAULT 2026)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_written integer := 0;
BEGIN
  INSERT INTO afl.player_accuracy_metrics
    (player_id, player_name, position, team, games_tracked,
     mae, rmse, avg_error, std_dev_error,
     directional_bias, hit_rate_10, hit_rate_15, hit_rate_20,
     median_abs_error, p90_abs_error,
     best_round_error, worst_round_error, season, updated_at)
  WITH base AS (
    SELECT
      pa.player_id,
      r.player_name,
      r.position,
      r.team,
      pa.error,
      pa.abs_error,
      pa.within_10
    FROM public.projection_accuracy pa
    LEFT JOIN afl.player_rankings_cache r USING (player_id)
    WHERE pa.season = p_season
      AND (pa.injury_excluded IS NOT TRUE)
      AND pa.actual_score IS NOT NULL
      AND pa.abs_error IS NOT NULL
  ),
  agg AS (
    SELECT
      player_id,
      MAX(player_name)                                         AS player_name,
      MAX(position)                                            AS position,
      MAX(team)                                                AS team,
      COUNT(*)                                                 AS games_tracked,
      AVG(abs_error)                                           AS mae,
      SQRT(AVG(error * error))                                 AS rmse,
      AVG(error)                                               AS avg_error,
      STDDEV(error)                                            AS std_dev_error,
      AVG(CASE WHEN within_10 THEN 1.0 ELSE 0.0 END)          AS hit_rate_10,
      AVG(CASE WHEN abs_error <= 15 THEN 1.0 ELSE 0.0 END)    AS hit_rate_15,
      AVG(CASE WHEN abs_error <= 20 THEN 1.0 ELSE 0.0 END)    AS hit_rate_20,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY abs_error) AS median_abs_error,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY abs_error) AS p90_abs_error,
      MIN(abs_error)                                           AS best_round_error,
      MAX(abs_error)                                           AS worst_round_error
    FROM base
    GROUP BY player_id
    HAVING COUNT(*) >= 1
  )
  SELECT
    player_id,
    player_name,
    position,
    team,
    games_tracked::integer,
    ROUND(mae::numeric, 2),
    ROUND(rmse::numeric, 2),
    ROUND(avg_error::numeric, 2),
    ROUND(std_dev_error::numeric, 2),
    CASE
      WHEN avg_error > 5  THEN 'over'
      WHEN avg_error < -5 THEN 'under'
      ELSE 'neutral'
    END,
    ROUND(hit_rate_10::numeric, 3),
    ROUND(hit_rate_15::numeric, 3),
    ROUND(hit_rate_20::numeric, 3),
    ROUND(median_abs_error::numeric, 2),
    ROUND(p90_abs_error::numeric, 2),
    ROUND(best_round_error::numeric, 2),
    ROUND(worst_round_error::numeric, 2),
    p_season,
    now()
  FROM agg
  ON CONFLICT (player_id) DO UPDATE SET
    player_name       = EXCLUDED.player_name,
    position          = EXCLUDED.position,
    team              = EXCLUDED.team,
    games_tracked     = EXCLUDED.games_tracked,
    mae               = EXCLUDED.mae,
    rmse              = EXCLUDED.rmse,
    avg_error         = EXCLUDED.avg_error,
    std_dev_error     = EXCLUDED.std_dev_error,
    directional_bias  = EXCLUDED.directional_bias,
    hit_rate_10       = EXCLUDED.hit_rate_10,
    hit_rate_15       = EXCLUDED.hit_rate_15,
    hit_rate_20       = EXCLUDED.hit_rate_20,
    median_abs_error  = EXCLUDED.median_abs_error,
    p90_abs_error     = EXCLUDED.p90_abs_error,
    best_round_error  = EXCLUDED.best_round_error,
    worst_round_error = EXCLUDED.worst_round_error,
    season            = EXCLUDED.season,
    updated_at        = now();

  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'players_updated', v_written,
    'season', p_season,
    'generated_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'hint', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_refresh_player_accuracy_metrics(integer) TO authenticated;

-- ─── Views ────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_accuracy_by_position;
CREATE OR REPLACE VIEW public.v_accuracy_by_position AS
SELECT
  position,
  COUNT(*)                         AS players,
  ROUND(AVG(mae), 2)               AS avg_mae,
  ROUND(AVG(rmse), 2)              AS avg_rmse,
  ROUND(AVG(avg_error), 2)         AS avg_bias,
  ROUND(AVG(hit_rate_10) * 100, 1) AS hit_rate_10_pct,
  ROUND(AVG(hit_rate_15) * 100, 1) AS hit_rate_15_pct,
  ROUND(AVG(hit_rate_20) * 100, 1) AS hit_rate_20_pct,
  COUNT(*) FILTER (WHERE directional_bias = 'over')    AS over_bias_count,
  COUNT(*) FILTER (WHERE directional_bias = 'under')   AS under_bias_count,
  COUNT(*) FILTER (WHERE directional_bias = 'neutral') AS neutral_count
FROM afl.player_accuracy_metrics
WHERE games_tracked >= 1
GROUP BY position
ORDER BY avg_mae ASC;

GRANT SELECT ON public.v_accuracy_by_position TO anon, authenticated;

DROP VIEW IF EXISTS public.v_accuracy_leaderboard;
CREATE OR REPLACE VIEW public.v_accuracy_leaderboard AS
SELECT
  am.player_id,
  am.player_name,
  am.position,
  am.team,
  am.games_tracked,
  am.mae,
  am.rmse,
  am.avg_error,
  am.directional_bias,
  ROUND(am.hit_rate_10 * 100, 1) AS hit_rate_10_pct,
  ROUND(am.hit_rate_15 * 100, 1) AS hit_rate_15_pct,
  am.median_abs_error,
  am.p90_abs_error,
  r.neeko_rating,
  r.projection_confidence,
  -- accuracy tier
  CASE
    WHEN am.mae <= 8  AND am.hit_rate_10 >= 0.65 THEN 'Elite'
    WHEN am.mae <= 12 AND am.hit_rate_10 >= 0.50 THEN 'Strong'
    WHEN am.mae <= 18 AND am.hit_rate_10 >= 0.35 THEN 'Moderate'
    ELSE 'Poor'
  END AS accuracy_tier
FROM afl.player_accuracy_metrics am
LEFT JOIN afl.player_rankings_cache r USING (player_id)
WHERE am.games_tracked >= 1
ORDER BY am.mae ASC NULLS LAST;

GRANT SELECT ON public.v_accuracy_leaderboard TO anon, authenticated;

DROP VIEW IF EXISTS public.v_accuracy_round_summary;
CREATE OR REPLACE VIEW public.v_accuracy_round_summary AS
SELECT
  season,
  round_number,
  COUNT(*)                                              AS players_tracked,
  ROUND(AVG(abs_error), 2)                              AS avg_mae,
  ROUND(SQRT(AVG(error * error)), 2)                    AS rmse,
  ROUND(AVG(error), 2)                                  AS avg_bias,
  ROUND(AVG(CASE WHEN within_10 THEN 1.0 ELSE 0 END) * 100, 1) AS hit_rate_10_pct,
  ROUND(AVG(CASE WHEN abs_error <= 15 THEN 1.0 ELSE 0 END) * 100, 1) AS hit_rate_15_pct,
  COUNT(*) FILTER (WHERE error > 0)                     AS over_predicted,
  COUNT(*) FILTER (WHERE error < 0)                     AS under_predicted,
  MIN(abs_error)                                        AS best_prediction,
  MAX(abs_error)                                        AS worst_prediction
FROM public.projection_accuracy
WHERE injury_excluded IS NOT TRUE
  AND actual_score IS NOT NULL
GROUP BY season, round_number
ORDER BY season DESC, round_number DESC;

GRANT SELECT ON public.v_accuracy_round_summary TO anon, authenticated;

-- Run initial population
SELECT afl.fn_refresh_player_accuracy_metrics(2026);
