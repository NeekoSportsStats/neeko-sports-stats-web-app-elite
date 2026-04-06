/*
  # Fix Player Name Mapping: match_method param + last_name/first_initial fallback

  ## Summary
  1. Adds `match_method` column to `afl.player_name_map` if missing
  2. Drops and recreates `afl.save_player_name_mapping` to accept optional `match_method` param
  3. Drops and recreates `public.save_player_name_mapping` to accept optional `match_method` param
  4. Adds a normalized last_name + first_initial index for fast fallback lookups
  5. Rebuilds `afl.lookup_player_name_mappings` to also return match_method
  6. Adds `public.lookup_player_by_last_initial` RPC for server-side fallback matching

  ## Modified Objects
  - `afl.player_name_map` — adds `match_method`, `last_name_norm`, `first_initial` columns (safe)
  - `afl.save_player_name_mapping` — drop old 2-arg, create 3-arg with match_method
  - `public.save_player_name_mapping` — drop old 2-arg, create 3-arg with match_method
  - `afl.lookup_player_name_mappings` — drop old, create new returning match_method
  - `public.lookup_player_name_mappings` — drop old, create new returning match_method
  - `public.lookup_player_by_last_initial` — NEW fallback RPC

  ## Security
  - All functions SECURITY DEFINER with admin guard or authenticated
  - No RLS changes
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add columns to afl.player_name_map if missing
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'match_method'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN match_method text DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'last_name_norm'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN last_name_norm text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map' AND column_name = 'first_initial'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN first_initial text;
  END IF;
END $$;

-- Backfill last_name_norm and first_initial from source_name
UPDATE afl.player_name_map
SET
  last_name_norm = upper(split_part(trim(source_name), ' ', 2)),
  first_initial  = upper(left(trim(source_name), 1))
WHERE last_name_norm IS NULL AND source_name IS NOT NULL AND trim(source_name) <> '';

CREATE INDEX IF NOT EXISTS idx_player_name_map_last_initial
  ON afl.player_name_map (last_name_norm, first_initial);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop and recreate afl.save_player_name_mapping with match_method param
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS afl.save_player_name_mapping(text, integer);
DROP FUNCTION IF EXISTS afl.save_player_name_mapping(text, integer, text);

CREATE FUNCTION afl.save_player_name_mapping(
  p_source_name  text,
  p_player_id    integer,
  p_match_method text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_normalized   text;
  v_player_name  text;
  v_last_name    text;
  v_initial      text;
BEGIN
  IF p_source_name IS NULL OR trim(p_source_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'source_name is required');
  END IF;

  IF p_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'player_id is required');
  END IF;

  v_normalized := lower(trim(regexp_replace(p_source_name, '[^a-zA-Z0-9\s]', '', 'g')));
  v_last_name  := upper(split_part(trim(p_source_name), ' ', 2));
  v_initial    := upper(left(trim(p_source_name), 1));

  SELECT player_name INTO v_player_name
  FROM afl.players
  WHERE player_id = p_player_id;

  IF v_player_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Player %s not found in afl.players', p_player_id)
    );
  END IF;

  INSERT INTO afl.player_name_map
    (source_name, normalized_source_name, player_id, player_name, confidence, is_verified, match_method, last_name_norm, first_initial)
  VALUES
    (p_source_name, v_normalized, p_player_id, v_player_name, 100, true, COALESCE(p_match_method, 'manual'), v_last_name, v_initial)
  ON CONFLICT (normalized_source_name)
  DO UPDATE SET
    player_id      = EXCLUDED.player_id,
    player_name    = EXCLUDED.player_name,
    confidence     = 100,
    is_verified    = true,
    match_method   = EXCLUDED.match_method,
    last_name_norm = EXCLUDED.last_name_norm,
    first_initial  = EXCLUDED.first_initial;

  RETURN jsonb_build_object(
    'success',      true,
    'source_name',  p_source_name,
    'player_id',    p_player_id,
    'player_name',  v_player_name,
    'match_method', COALESCE(p_match_method, 'manual')
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Drop and recreate public.save_player_name_mapping
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_player_name_mapping(text, integer);
DROP FUNCTION IF EXISTS public.save_player_name_mapping(text, integer, text);

CREATE FUNCTION public.save_player_name_mapping(
  p_source_name  text,
  p_player_id    integer,
  p_match_method text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.save_player_name_mapping(p_source_name, p_player_id, p_match_method);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_player_name_mapping(text, integer, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop and recreate lookup_player_name_mappings to include match_method
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS afl.lookup_player_name_mappings(text[]);
DROP FUNCTION IF EXISTS public.lookup_player_name_mappings(text[]);

CREATE FUNCTION afl.lookup_player_name_mappings(
  p_source_names text[]
)
RETURNS TABLE(
  source_name  text,
  player_id    integer,
  player_name  text,
  confidence   numeric,
  match_method text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT
    m.source_name,
    m.player_id,
    m.player_name,
    coalesce(m.confidence, 100)::numeric,
    coalesce(m.match_method, 'manual')
  FROM afl.player_name_map m
  WHERE m.normalized_source_name = ANY(
    SELECT lower(trim(regexp_replace(u, '[^a-zA-Z0-9\s]', '', 'g')))
    FROM unnest(p_source_names) AS u
  )
  OR m.source_name = ANY(p_source_names);
$$;

CREATE FUNCTION public.lookup_player_name_mappings(
  p_source_names text[]
)
RETURNS TABLE(
  source_name  text,
  player_id    integer,
  player_name  text,
  confidence   numeric,
  match_method text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT * FROM afl.lookup_player_name_mappings(p_source_names);
$$;

GRANT EXECUTE ON FUNCTION public.lookup_player_name_mappings(text[]) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. New RPC: lookup by last_name + first_initial (server-side fallback)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.lookup_player_by_last_initial(text, text);

CREATE FUNCTION public.lookup_player_by_last_initial(
  p_last_name     text,
  p_first_initial text
)
RETURNS TABLE(
  player_id   integer,
  player_name text,
  confidence  numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT DISTINCT
    p.player_id,
    p.player_name,
    85::numeric AS confidence
  FROM afl.players p
  WHERE upper(split_part(trim(p.player_name), ' ', 2)) = upper(trim(p_last_name))
    AND upper(left(trim(p.player_name), 1)) = upper(left(trim(p_first_initial), 1))
    AND p.active = true
  ORDER BY p.player_id;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_player_by_last_initial(text, text) TO authenticated;
