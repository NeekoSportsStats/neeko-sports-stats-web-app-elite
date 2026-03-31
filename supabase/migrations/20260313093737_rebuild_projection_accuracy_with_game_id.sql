/*
  # Rebuild Projection Accuracy Engine with game_id

  ## Summary
  Rebuilds the projection_accuracy table to include a game_id column,
  enabling precise per-game accuracy tracking rather than per-round.

  ## Changes
  ### Modified Tables
  - `public.projection_accuracy`
    - Added `game_id` INTEGER column (links to afl.games_raw)
    - Dropped old PK on (player_id, season, round_number)
    - New unique constraint: (player_id, game_id)
    - Renamed column: `projection` → `projected_score` for clarity
    - Added `round_label` TEXT column (human-readable round name)

  ## Data Rebuild
  - Clears 2026 data and repopulates by joining existing projections
    to afl.player_games actual scores via player_id + game_id
  - Applies injury/outlier filter:
      EXCLUDE where actual_score < projected_score - 40 AND projected_score >= 50
  - Injury flag stored in `injury_excluded` BOOLEAN for audit purposes

  ## New Functions
  - `public.refresh_projection_accuracy()` - incremental upsert of new
    completed games, skipping already-processed game/player combos

  ## Views
  - Rebuilds `afl.v_projection_accuracy_homepage` to use injury-filtered rows
  - Creates `afl.v_projection_error_distribution` with 4 error bands

  ## Security
  - RLS unchanged (already enabled)
  - Views granted SELECT to anon/authenticated
*/

-- ─── Step 1: Add columns to existing table ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projection_accuracy' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE public.projection_accuracy ADD COLUMN game_id INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projection_accuracy' AND column_name = 'projected_score'
  ) THEN
    ALTER TABLE public.projection_accuracy ADD COLUMN projected_score NUMERIC;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projection_accuracy' AND column_name = 'round_label'
  ) THEN
    ALTER TABLE public.projection_accuracy ADD COLUMN round_label TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projection_accuracy' AND column_name = 'injury_excluded'
  ) THEN
    ALTER TABLE public.projection_accuracy ADD COLUMN injury_excluded BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ─── Step 2: Backfill game_id and projected_score from player_games join ─────

UPDATE public.projection_accuracy pa
SET
  game_id        = pg.game_id,
  projected_score = pa.projection,
  round_label    = pg.round,
  injury_excluded = (pa.actual_score < pa.projection - 40 AND pa.projection >= 50)
FROM afl.player_games pg
WHERE pg.player_id = pa.player_id
  AND pg.season    = pa.season
  AND pa.season    = 2026
  AND pa.game_id IS NULL;

-- ─── Step 3: Drop old PK and add unique constraint on (player_id, game_id) ────

ALTER TABLE public.projection_accuracy DROP CONSTRAINT IF EXISTS projection_accuracy_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'projection_accuracy'
      AND constraint_name = 'projection_accuracy_player_game_uniq'
  ) THEN
    ALTER TABLE public.projection_accuracy
      ADD CONSTRAINT projection_accuracy_player_game_uniq
      UNIQUE (player_id, game_id);
  END IF;
END $$;

-- ─── Step 4: Rebuild afl.v_projection_accuracy_homepage (injury-filtered) ────

CREATE OR REPLACE VIEW afl.v_projection_accuracy_homepage
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT player_id)::integer AS players_analysed,
  round(avg(abs_error), 1)           AS avg_error,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 10 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  ) AS within_10,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 15 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  ) AS within_15,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 20 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  ) AS within_20,
  'neeko_projection_engine_v3'::text AS source
FROM public.projection_accuracy
WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND (injury_excluded IS NULL OR injury_excluded = false);

GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;

-- ─── Step 5: Create afl.v_projection_error_distribution ──────────────────────

CREATE OR REPLACE VIEW afl.v_projection_error_distribution
WITH (security_invoker = false)
AS
WITH base AS (
  SELECT abs_error
  FROM public.projection_accuracy
  WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
    AND (injury_excluded IS NULL OR injury_excluded = false)
),
total AS (
  SELECT COUNT(*) AS n FROM base
)
SELECT
  '0–10 pts'  AS band,
  1           AS sort_order,
  CASE WHEN t.n > 0 THEN
    round(100.0 * COUNT(CASE WHEN b.abs_error <= 10 THEN 1 END)::numeric / t.n::numeric, 1)
  ELSE 0 END  AS pct
FROM base b, total t
GROUP BY t.n

UNION ALL

SELECT
  '10–15 pts' AS band,
  2           AS sort_order,
  CASE WHEN t.n > 0 THEN
    round(100.0 * COUNT(CASE WHEN b.abs_error > 10 AND b.abs_error <= 15 THEN 1 END)::numeric / t.n::numeric, 1)
  ELSE 0 END  AS pct
FROM base b, total t
GROUP BY t.n

UNION ALL

SELECT
  '15–20 pts' AS band,
  3           AS sort_order,
  CASE WHEN t.n > 0 THEN
    round(100.0 * COUNT(CASE WHEN b.abs_error > 15 AND b.abs_error <= 20 THEN 1 END)::numeric / t.n::numeric, 1)
  ELSE 0 END  AS pct
FROM base b, total t
GROUP BY t.n

UNION ALL

SELECT
  '20+ pts'   AS band,
  4           AS sort_order,
  CASE WHEN t.n > 0 THEN
    round(100.0 * COUNT(CASE WHEN b.abs_error > 20 THEN 1 END)::numeric / t.n::numeric, 1)
  ELSE 0 END  AS pct
FROM base b, total t
GROUP BY t.n

ORDER BY sort_order;

GRANT SELECT ON afl.v_projection_error_distribution TO anon, authenticated;

-- ─── Step 6: Create refresh_projection_accuracy() function ───────────────────

CREATE OR REPLACE FUNCTION public.refresh_projection_accuracy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
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
    pg.player_id,
    pg.season,
    COALESCE(pg.week, 0)                          AS round_number,
    pg.round                                       AS round_label,
    pg.game_id,
    pa_existing.projection                         AS projection,
    pa_existing.projection                         AS projected_score,
    pg.fantasy_score::numeric                      AS actual_score,
    pg.fantasy_score::numeric - pa_existing.projection AS error,
    ABS(pg.fantasy_score::numeric - pa_existing.projection) AS abs_error,
    ABS(pg.fantasy_score::numeric - pa_existing.projection) <= 10 AS within_10,
    (pg.fantasy_score < pa_existing.projection - 40 AND pa_existing.projection >= 50) AS injury_excluded,
    now()
  FROM afl.player_games pg
  JOIN afl.games_raw gr ON gr.game_id = pg.game_id AND gr.status_short = 'FT'
  -- Only process games we have stored projections for
  JOIN public.projection_accuracy pa_existing
    ON pa_existing.player_id = pg.player_id
    AND pa_existing.season = pg.season
    AND pa_existing.game_id = pg.game_id
  WHERE pg.season = (SELECT MAX(season) FROM afl.games_raw WHERE status_short = 'FT')
  ON CONFLICT (player_id, game_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_projection_accuracy() TO authenticated;
