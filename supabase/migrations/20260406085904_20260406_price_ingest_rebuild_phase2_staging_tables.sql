/*
  # Price Ingest System Rebuild — Phase 2: Canonical Staging Tables

  ## Summary
  Replaces the fragmented staging experience (unmatched_player_names + price_ingest_pending)
  with a single canonical staging model: price_ingest_sessions + price_ingest_rows.

  ## New Tables
  - price_ingest_sessions: tracks each import attempt as a named session
  - price_ingest_rows: one row per player in the import

  ## Modified Tables
  - player_name_map: add last_used_at, created_by, match_method, use_count columns

  ## Security
  - RLS enabled on all new tables
  - Only authenticated admins can read/write
  - service_role has full access
*/

-- ============================================================
-- 1. price_ingest_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS afl.price_ingest_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season           int  NOT NULL,
  round            int  NOT NULL,
  label            text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'committed', 'failed')),
  rows_total       int  NOT NULL DEFAULT 0,
  rows_matched     int  NOT NULL DEFAULT 0,
  rows_unresolved  int  NOT NULL DEFAULT 0,
  rows_committed   int  NULL,
  created_by       uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_by     uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  committed_at     timestamptz NULL,
  pipeline_queued  boolean NOT NULL DEFAULT false,
  pipeline_done    boolean NOT NULL DEFAULT false,
  pipeline_error   text NULL,
  notes            text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.price_ingest_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ingest sessions" ON afl.price_ingest_sessions;
CREATE POLICY "Admins can read ingest sessions"
  ON afl.price_ingest_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert ingest sessions" ON afl.price_ingest_sessions;
CREATE POLICY "Admins can insert ingest sessions"
  ON afl.price_ingest_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update ingest sessions" ON afl.price_ingest_sessions;
CREATE POLICY "Admins can update ingest sessions"
  ON afl.price_ingest_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Service role can manage ingest sessions" ON afl.price_ingest_sessions;
CREATE POLICY "Service role can manage ingest sessions"
  ON afl.price_ingest_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION afl.set_price_ingest_session_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_ingest_sessions_updated_at ON afl.price_ingest_sessions;
CREATE TRIGGER trg_price_ingest_sessions_updated_at
  BEFORE UPDATE ON afl.price_ingest_sessions
  FOR EACH ROW EXECUTE FUNCTION afl.set_price_ingest_session_updated_at();

-- ============================================================
-- 2. price_ingest_rows
-- ============================================================
CREATE TABLE IF NOT EXISTS afl.price_ingest_rows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES afl.price_ingest_sessions(id) ON DELETE CASCADE,
  row_index        int  NOT NULL DEFAULT 0,
  source_name      text NOT NULL,
  cleaned_price    int  NOT NULL,
  position         text NULL,
  team             text NULL,
  player_status    text NULL,
  external_id      bigint NULL,
  avg_points       numeric(6,1) NULL,
  last_round_score int NULL,
  ownership_pct    numeric(5,2) NULL,
  price_change     int NULL,
  price_change_pct numeric(5,2) NULL,
  positions        text[] NULL,
  player_id        bigint NULL,
  player_name      text NULL,
  match_method     text NULL,
  match_confidence int NULL,
  match_status     text NOT NULL DEFAULT 'unresolved',
  suggestions      jsonb NULL,
  committed        boolean NOT NULL DEFAULT false,
  skipped          boolean NOT NULL DEFAULT false,
  skip_reason      text NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.price_ingest_rows ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_price_ingest_rows_session_id
  ON afl.price_ingest_rows (session_id);

CREATE INDEX IF NOT EXISTS idx_price_ingest_rows_player_id
  ON afl.price_ingest_rows (player_id)
  WHERE player_id IS NOT NULL;

DROP POLICY IF EXISTS "Admins can read ingest rows" ON afl.price_ingest_rows;
CREATE POLICY "Admins can read ingest rows"
  ON afl.price_ingest_rows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert ingest rows" ON afl.price_ingest_rows;
CREATE POLICY "Admins can insert ingest rows"
  ON afl.price_ingest_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update ingest rows" ON afl.price_ingest_rows;
CREATE POLICY "Admins can update ingest rows"
  ON afl.price_ingest_rows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Service role can manage ingest rows" ON afl.price_ingest_rows;
CREATE POLICY "Service role can manage ingest rows"
  ON afl.price_ingest_rows FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 3. Improve player_name_map — add tracking columns
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map'
    AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN last_used_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map'
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map'
    AND column_name = 'match_method'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN match_method text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_name_map'
    AND column_name = 'use_count'
  ) THEN
    ALTER TABLE afl.player_name_map ADD COLUMN use_count int NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ============================================================
-- 4. Drop + recreate save_player_name_mapping with new signature
-- ============================================================
DROP FUNCTION IF EXISTS public.save_player_name_mapping(text, integer);

CREATE OR REPLACE FUNCTION public.save_player_name_mapping(
  p_source_name text,
  p_player_id   int,
  p_match_method text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_player_name text;
BEGIN
  SELECT player_name INTO v_player_name
  FROM afl.players WHERE player_id = p_player_id;

  IF v_player_name IS NULL THEN
    RAISE EXCEPTION 'Player % not found', p_player_id;
  END IF;

  INSERT INTO afl.player_name_map (
    source_name, player_id, player_name, confidence,
    created_by, last_used_at, match_method, use_count
  ) VALUES (
    p_source_name, p_player_id, v_player_name, 100,
    auth.uid(), now(), p_match_method, 1
  )
  ON CONFLICT (source_name) DO UPDATE SET
    player_id    = EXCLUDED.player_id,
    player_name  = EXCLUDED.player_name,
    confidence   = 100,
    last_used_at = now(),
    match_method = EXCLUDED.match_method,
    use_count    = COALESCE(afl.player_name_map.use_count, 0) + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.save_player_name_mapping(text, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_player_name_mapping(text, int, text) TO authenticated;

-- ============================================================
-- 5. RPC: create_price_ingest_session
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_price_ingest_session(
  p_season          int,
  p_round           int,
  p_label           text DEFAULT '',
  p_rows_total      int DEFAULT 0,
  p_rows_matched    int DEFAULT 0,
  p_rows_unresolved int DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  INSERT INTO afl.price_ingest_sessions (
    season, round, label, status,
    rows_total, rows_matched, rows_unresolved,
    created_by
  ) VALUES (
    p_season, p_round,
    COALESCE(NULLIF(p_label, ''), 'Round ' || p_round || ' — ' || p_season),
    'draft',
    p_rows_total, p_rows_matched, p_rows_unresolved,
    auth.uid()
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_price_ingest_session FROM anon;
GRANT EXECUTE ON FUNCTION public.create_price_ingest_session TO authenticated;

-- ============================================================
-- 6. RPC: get_price_ingest_sessions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_price_ingest_sessions(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id                 uuid,
  season             int,
  round              int,
  label              text,
  status             text,
  rows_total         int,
  rows_matched       int,
  rows_unresolved    int,
  rows_committed     int,
  created_by_email   text,
  committed_by_email text,
  committed_at       timestamptz,
  pipeline_done      boolean,
  pipeline_error     text,
  created_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.season, s.round, s.label, s.status,
    s.rows_total, s.rows_matched, s.rows_unresolved, s.rows_committed,
    c.email::text AS created_by_email,
    cm.email::text AS committed_by_email,
    s.committed_at,
    s.pipeline_done, s.pipeline_error,
    s.created_at
  FROM afl.price_ingest_sessions s
  LEFT JOIN auth.users c ON c.id = s.created_by
  LEFT JOIN auth.users cm ON cm.id = s.committed_by
  ORDER BY s.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_price_ingest_sessions FROM anon;
GRANT EXECUTE ON FUNCTION public.get_price_ingest_sessions TO authenticated;
