/*
  # Fix projection_accuracy cron timeout

  ## Problem
  refresh_projection_accuracy() was timing out because:
  - It scanned the full afl.v_player_rankings view (all-time) with no date filter
  - Used a LEFT JOIN anti-pattern which forces a full join before filtering NULLs
  - No index existed to support the NOT EXISTS / actual_score IS NULL lookups

  ## Changes

  ### 1. New indexes
  - idx_projection_accuracy_actual_null — partial index for the UPDATE step (rows missing actuals)
  - idx_games_raw_game_date            — speeds up the 21-day date window filter
  - idx_games_raw_game_id              — supports JOIN from v_player_rankings
  (projection_accuracy already has a unique index on (player_id, game_id) — used for ON CONFLICT)

  ### 2. Rewritten refresh_projection_accuracy()
  - INSERT step: filters to games within the last 21 days, uses ON CONFLICT DO NOTHING
    against the existing unique index — no full-table scan needed
  - UPDATE step: restricted to games completed within the last 21 days and only rows
    where actual_score IS NULL (hits the new partial index)
  - Batch cap of 5000 rows applied via CTE on the SELECT side

  ### 3. Pipeline isolation already in place
  Stage 5 of run_afl_processing_pipeline() already wraps this call in a
  BEGIN...EXCEPTION block, so a failure here cannot break the wider pipeline.
  No change required to the pipeline function.
*/

-- ── 1. INDEXES ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projection_accuracy_actual_null
  ON public.projection_accuracy (player_id, game_id)
  WHERE actual_score IS NULL;

CREATE INDEX IF NOT EXISTS idx_games_raw_game_date
  ON afl.games_raw (game_date);

CREATE INDEX IF NOT EXISTS idx_games_raw_game_id
  ON afl.games_raw (game_id);

-- ── 2. REWRITE refresh_projection_accuracy() ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_projection_accuracy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN

  -- ── STEP 1: Seed projection snapshot rows (incremental, recent games only) ──
  --   Batch-capped at 5000 rows via CTE. ON CONFLICT DO NOTHING uses the
  --   existing unique index on (player_id, game_id) — no full-table scan.

  INSERT INTO public.projection_accuracy (
    player_id,
    season,
    round_number,
    round_label,
    game_id,
    projection,
    projected_score,
    actual_score,
    error,
    abs_error,
    within_10,
    injury_excluded,
    created_at
  )
  SELECT
    src.player_id,
    src.season,
    src.round_number,
    src.round_label,
    src.game_id,
    src.projection,
    src.projection,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::boolean,
    NULL::boolean,
    now()
  FROM (
    SELECT
      r.player_id,
      EXTRACT(YEAR FROM g.game_date)::int AS season,
      COALESCE(g.week, 0)                AS round_number,
      g.round                            AS round_label,
      r.game_id,
      r.projection::numeric              AS projection
    FROM afl.v_player_rankings r
    JOIN afl.games_raw g
      ON g.game_id = r.game_id
    WHERE g.game_date >= now() - INTERVAL '21 days'
    LIMIT 5000
  ) src
  ON CONFLICT (player_id, game_id) DO NOTHING;

  -- ── STEP 2: Fill in actuals for recently completed games only ──────────────
  --   Restricted to FT games in the last 21 days and rows where
  --   actual_score IS NULL — hits the partial index.

  UPDATE public.projection_accuracy pa
  SET
    actual_score    = pg.fantasy_score::numeric,
    error           = pg.fantasy_score::numeric - pa.projected_score,
    abs_error       = ABS(pg.fantasy_score::numeric - pa.projected_score),
    within_10       = ABS(pg.fantasy_score::numeric - pa.projected_score) <= 10,
    injury_excluded = (
      pg.fantasy_score < pa.projected_score - 40
      AND pa.projected_score >= 50
    )
  FROM afl.player_games pg
  JOIN afl.games_raw gr
    ON gr.game_id    = pg.game_id
   AND gr.status_short = 'FT'
   AND gr.game_date  >= now() - INTERVAL '21 days'
  WHERE pa.player_id    = pg.player_id
    AND pa.game_id      = pg.game_id
    AND pg.fantasy_score IS NOT NULL
    AND pa.actual_score  IS NULL;

END;
$$;
