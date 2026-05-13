/*
  # Player Identity Anomaly Dashboard — DB Foundation

  ## Summary
  Creates the infrastructure for the admin Player Identity dashboard.
  
  1. New Tables
    - `public.player_identity_anomalies` — stores detected identity issues
  
  2. New Functions
    - `public.refresh_player_identity_anomalies()` — 6 detection rules

  3. Security
    - RLS enabled, admin-only (is_admin=true), service_role bypass
*/

-- =========================================================
-- 1. Anomalies table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.player_identity_anomalies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  severity     text        NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  anomaly_type text        NOT NULL,
  player_id    integer,
  player_name  text        NOT NULL DEFAULT '',
  team_name    text        NOT NULL DEFAULT '',
  details      jsonb       NOT NULL DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_pia_severity     ON public.player_identity_anomalies (severity);
CREATE INDEX IF NOT EXISTS idx_pia_status        ON public.player_identity_anomalies (status);
CREATE INDEX IF NOT EXISTS idx_pia_player_id     ON public.player_identity_anomalies (player_id);
CREATE INDEX IF NOT EXISTS idx_pia_anomaly_type  ON public.player_identity_anomalies (anomaly_type);

ALTER TABLE public.player_identity_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read identity anomalies"
  ON public.player_identity_anomalies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert identity anomalies"
  ON public.player_identity_anomalies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update identity anomalies"
  ON public.player_identity_anomalies FOR UPDATE
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

CREATE POLICY "Service role can manage identity anomalies"
  ON public.player_identity_anomalies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================
-- 2. Refresh / detection function
-- =========================================================
CREATE OR REPLACE FUNCTION public.refresh_player_identity_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_inserted   int := 0;
  v_updated    int := 0;
  v_total      int := 0;
  v_anomaly    record;
  v_existing   uuid;
  v_result     jsonb;
BEGIN

  -- RULE 1 — CRITICAL: Dual identity confirmed
  FOR v_anomaly IN
    SELECT
      o.player_id,
      COALESCE(p.player_name, o.player_name, 'Unknown') AS player_name,
      COALESCE(o.team_name, '')                          AS team_name,
      jsonb_build_object(
        'notes',      left(o.notes, 500),
        'position',   o.position,
        'updated_at', o.updated_at
      ) AS details
    FROM afl.player_identity_overrides o
    LEFT JOIN afl.players p ON p.player_id = o.player_id
    WHERE o.notes ILIKE '%DUAL IDENTITY%'
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_id = v_anomaly.player_id
      AND anomaly_type = 'dual_identity'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('critical', 'dual_identity', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- RULE 2 — HIGH: High-value placeholder (avg >= 60)
  FOR v_anomaly IN
    SELECT
      c.player_id,
      c.player_name,
      COALESCE(c.team_name, '') AS team_name,
      jsonb_build_object(
        'season_avg',   c.season_avg,
        'games_played', c.games_played,
        'last_5_avg',   c.last_5_avg,
        'position',     c.position,
        'price',        c.price
      ) AS details
    FROM public.player_rankings_cache c
    WHERE c.player_name ILIKE 'Player#%'
      AND c.season_avg >= 60
      AND c.games_played >= 2
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_id = v_anomaly.player_id
      AND anomaly_type = 'high_value_placeholder'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('high', 'high_value_placeholder', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- RULE 3 — HIGH: Unknown identity flagged via override
  FOR v_anomaly IN
    SELECT
      o.player_id,
      COALESCE(p.player_name, o.player_name, 'Unknown') AS player_name,
      COALESCE(o.team_name, '')                          AS team_name,
      jsonb_build_object(
        'notes',      left(o.notes, 500),
        'position',   o.position,
        'updated_at', o.updated_at
      ) AS details
    FROM afl.player_identity_overrides o
    LEFT JOIN afl.players p ON p.player_id = o.player_id
    WHERE o.notes ILIKE '%UNKNOWN IDENTITY%'
      AND o.notes NOT ILIKE '%DUAL IDENTITY%'
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_id = v_anomaly.player_id
      AND anomaly_type = 'unknown_identity'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('high', 'unknown_identity', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- RULE 4 — MEDIUM: Standard placeholder (avg < 60 or no stats)
  FOR v_anomaly IN
    SELECT
      c.player_id,
      c.player_name,
      COALESCE(c.team_name, '') AS team_name,
      jsonb_build_object(
        'season_avg',   c.season_avg,
        'games_played', c.games_played,
        'position',     c.position
      ) AS details
    FROM public.player_rankings_cache c
    WHERE c.player_name ILIKE 'Player#%'
      AND (c.season_avg < 60 OR c.season_avg IS NULL)
      AND c.games_played >= 1
      AND NOT EXISTS (
        SELECT 1 FROM public.player_identity_anomalies x
        WHERE x.player_id = c.player_id
          AND x.anomaly_type = 'high_value_placeholder'
          AND x.status != 'resolved'
      )
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_id = v_anomaly.player_id
      AND anomaly_type = 'placeholder'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('medium', 'placeholder', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- RULE 5 — MEDIUM: Duplicate active names within same team (from rankings cache)
  FOR v_anomaly IN
    SELECT
      MIN(c.player_id)   AS player_id,
      c.player_name      AS player_name,
      c.team_name        AS team_name,
      jsonb_build_object(
        'player_ids', array_agg(c.player_id ORDER BY c.player_id),
        'count',      count(*)
      ) AS details
    FROM public.player_rankings_cache c
    WHERE c.player_name NOT ILIKE 'Player#%'
      AND c.player_name IS NOT NULL
      AND c.player_name != ''
    GROUP BY lower(trim(c.player_name)), c.player_name, c.team_name
    HAVING count(*) > 1
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_name = v_anomaly.player_name
      AND team_name = v_anomaly.team_name
      AND anomaly_type = 'duplicate_name'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('medium', 'duplicate_name', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- RULE 6 — LOW: Has override record (general monitoring)
  FOR v_anomaly IN
    SELECT
      o.player_id,
      COALESCE(p.player_name, o.player_name, 'Unknown') AS player_name,
      COALESCE(o.team_name, '')                          AS team_name,
      jsonb_build_object(
        'position',   o.position,
        'notes',      left(o.notes, 200),
        'updated_at', o.updated_at
      ) AS details
    FROM afl.player_identity_overrides o
    LEFT JOIN afl.players p ON p.player_id = o.player_id
    WHERE o.notes NOT ILIKE '%DUAL IDENTITY%'
      AND o.notes NOT ILIKE '%UNKNOWN IDENTITY%'
  LOOP
    SELECT id INTO v_existing
    FROM public.player_identity_anomalies
    WHERE player_id = v_anomaly.player_id
      AND anomaly_type = 'has_override'
      AND status != 'resolved'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.player_identity_anomalies
        (severity, anomaly_type, player_id, player_name, team_name, details, status)
      VALUES ('low', 'has_override', v_anomaly.player_id,
              v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.player_identity_anomalies
      SET details = v_anomaly.details, detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- Summary + log
  SELECT count(*) INTO v_total FROM public.player_identity_anomalies WHERE status = 'open';

  v_result := jsonb_build_object(
    'inserted',   v_inserted,
    'updated',    v_updated,
    'total_open', v_total,
    'run_at',     now()
  );

  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
  VALUES ('info', 'identity_audit', 'anomaly_refresh',
          'Player identity anomaly refresh completed', v_result);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_player_identity_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_player_identity_anomalies() TO service_role;

-- Initial population
SELECT public.refresh_player_identity_anomalies();
