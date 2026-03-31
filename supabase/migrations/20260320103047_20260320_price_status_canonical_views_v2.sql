/*
  # Fantasy Price Status System — Phases 1-5

  ## Summary
  Adds status tracking to player prices and creates canonical views.

  ## Changes
  1. Adds `status` TEXT column to `afl.player_prices`
  2. Adds `afl.normalise_player_status()` helper
  3. Rebuilds `afl.commit_price_round` with status normalisation
  4. Creates `afl.v_player_price_current` — latest price per player with status/is_available
  5. Drops and recreates `public.v_player_price_full` with status, team, price delta
  6. Drops and recreates `public.v_player_prices_latest` with full enriched columns
  7. Rebuilds `public.get_price_rounds()` to include player_count

  ## Status Mapping
  - playing / available / active → AVAILABLE
  - injured / suspended / omitted / ruled-out / dnp / out → OUT
  - test / dtd / gtd / questionable → TEST
  - null / unknown → null

  ## Security
  - GRANT SELECT to anon + authenticated on all views
*/

-- ─── 1. Add status column ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_prices' AND column_name = 'status'
  ) THEN
    ALTER TABLE afl.player_prices ADD COLUMN status TEXT;
  END IF;
END $$;

-- ─── 2. Status normalisation helper ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.normalise_player_status(raw_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_status IS NULL THEN NULL
    WHEN lower(raw_status) IN ('playing', 'available', 'active') THEN 'AVAILABLE'
    WHEN lower(raw_status) IN (
      'injured', 'suspended', 'omitted', 'ruled-out', 'ruled out',
      'did-not-play', 'dnp', 'out'
    ) THEN 'OUT'
    WHEN lower(raw_status) IN (
      'test', 'dtd', 'day-to-day', 'game-time-decision', 'gtd', 'questionable'
    ) THEN 'TEST'
    ELSE NULL
  END
$$;

-- ─── 3. Rebuild commit_price_round with status normalisation ─────────────────

CREATE OR REPLACE FUNCTION afl.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked       BOOLEAN;
  v_deleted      INTEGER;
  v_inserted     INTEGER;
BEGIN
  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
    );
  END IF;

  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  SELECT COUNT(*) INTO v_deleted
  FROM afl.player_prices
  WHERE season = p_season AND round = p_round;

  DELETE FROM afl.player_prices
  WHERE season = p_season AND round = p_round;

  INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
  SELECT
    (r->>'player_id')::INTEGER,
    (r->>'cleaned_price')::INTEGER,
    p_season,
    p_round,
    afl.normalise_player_status(r->>'player_status'),
    now(),
    now()
  FROM jsonb_array_elements(p_rows) AS r
  WHERE (r->>'player_id') IS NOT NULL
    AND (r->>'cleaned_price') IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',       true,
    'season',   p_season,
    'round',    p_round,
    'deleted',  v_deleted,
    'inserted', v_inserted,
    'total',    v_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT afl.commit_price_round(p_rows, p_season, p_round);
$$;

-- ─── 4. v_player_price_current ───────────────────────────────────────────────

DROP VIEW IF EXISTS afl.v_player_price_current;

CREATE VIEW afl.v_player_price_current AS
WITH ranked AS (
  SELECT
    pp.*,
    ROW_NUMBER() OVER (PARTITION BY pp.player_id ORDER BY pp.season DESC, pp.round DESC) AS rn
  FROM afl.player_prices pp
  WHERE pp.price IS NOT NULL AND pp.price > 0
)
SELECT
  r.player_id,
  p.player_name,
  r.price          AS current_price,
  r.season,
  r.round,
  r.status,
  CASE WHEN r.status = 'OUT' THEN false ELSE true END AS is_available,
  r.updated_at,
  r.created_at
FROM ranked r
JOIN afl.players p ON p.player_id = r.player_id
WHERE r.rn = 1;

GRANT SELECT ON afl.v_player_price_current TO anon, authenticated;

-- ─── 5. Drop and recreate public.v_player_price_full ─────────────────────────

DROP VIEW IF EXISTS public.v_player_prices_latest;
DROP VIEW IF EXISTS public.v_player_price_full;

CREATE VIEW public.v_player_price_full AS
WITH current_prices AS (
  SELECT
    pp.player_id,
    pp.price        AS current_price,
    pp.season       AS current_season,
    pp.round        AS current_round,
    pp.status,
    pp.updated_at,
    ROW_NUMBER() OVER (PARTITION BY pp.player_id ORDER BY pp.season DESC, pp.round DESC) AS rn
  FROM afl.player_prices pp
  WHERE pp.price IS NOT NULL AND pp.price > 0
),
prev_prices AS (
  SELECT
    pp.player_id,
    pp.price        AS prev_price,
    pp.round        AS prev_round,
    ROW_NUMBER() OVER (PARTITION BY pp.player_id ORDER BY pp.season DESC, pp.round DESC) AS rn
  FROM afl.player_prices pp
  WHERE pp.price IS NOT NULL AND pp.price > 0
)
SELECT
  cp.player_id,
  p.player_name,
  rc.team,
  p.position_group                                              AS position,
  cp.current_price,
  cp.current_season                                             AS season,
  cp.current_round                                              AS round,
  cp.status,
  CASE WHEN cp.status = 'OUT' THEN false ELSE true END          AS is_available,
  pp2.prev_price,
  pp2.prev_round,
  (cp.current_price - COALESCE(pp2.prev_price, cp.current_price)) AS price_change,
  CASE
    WHEN pp2.prev_price IS NOT NULL AND pp2.prev_price > 0
    THEN ROUND(
      ((cp.current_price - pp2.prev_price)::NUMERIC / pp2.prev_price) * 100, 1
    )
    ELSE 0
  END                                                           AS price_change_pct,
  cp.updated_at
FROM current_prices cp
JOIN afl.players p ON p.player_id = cp.player_id
LEFT JOIN prev_prices pp2 ON pp2.player_id = cp.player_id AND pp2.rn = 2
LEFT JOIN afl.player_rankings_cache rc ON rc.player_id = cp.player_id
WHERE cp.rn = 1;

GRANT SELECT ON public.v_player_price_full TO anon, authenticated;

-- ─── 6. Recreate public.v_player_prices_latest ───────────────────────────────

CREATE VIEW public.v_player_prices_latest AS
SELECT
  player_id,
  player_name,
  team,
  position,
  current_price   AS price,
  season,
  round,
  status,
  is_available,
  prev_price,
  price_change,
  price_change_pct,
  updated_at
FROM public.v_player_price_full;

GRANT SELECT ON public.v_player_prices_latest TO anon, authenticated;

-- ─── 7. Rebuild get_price_rounds with player_count ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_price_rounds(p_season INTEGER DEFAULT 2026)
RETURNS TABLE (
  season       INTEGER,
  round        INTEGER,
  label        TEXT,
  is_locked    BOOLEAN,
  created_at   TIMESTAMPTZ,
  player_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    pr.season,
    pr.round,
    pr.label,
    pr.is_locked,
    pr.created_at,
    COUNT(pp.player_id) AS player_count
  FROM afl.price_rounds pr
  LEFT JOIN afl.player_prices pp
    ON pp.season = pr.season AND pp.round = pr.round
  WHERE pr.season = p_season
  GROUP BY pr.season, pr.round, pr.label, pr.is_locked, pr.created_at
  ORDER BY pr.round ASC;
$$;
