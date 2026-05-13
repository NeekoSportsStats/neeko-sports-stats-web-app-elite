
/*
  # Fix False-Positive Zac Taylor Dual-Identity Anomaly

  ## Root Cause
  Two bugs in refresh_player_identity_anomalies():

  1. RULE 1 (dual_identity): Fires whenever an override note contains "DUAL IDENTITY".
     Player_id 1819 (Zac Taylor) has that text in its override note because there WAS
     a second Zac Taylor (1845). Since 1845 was renamed to Nick Murray, the underlying
     conflict no longer exists — but RULE 1 still re-opens critical anomalies on every
     refresh because it only reads the note text, not whether the conflict is real today.

  2. RULE 5 (duplicate_name): Stale "duplicate_name" row for player_id 1819 was created
     when both 1819 and 1845 shared the name "Zac Taylor". It was never closed when 1845
     was renamed. RULE 5 does not auto-resolve rows where the duplicate no longer exists.

  ## Fix
  - Clear the stale dual_identity and duplicate_name anomaly rows for 1819.
  - Rebuild refresh_player_identity_anomalies() with two guards:
    a. RULE 1: Only flag dual_identity if two distinct active player_ids currently share
       the same name on the same team in player_rankings_cache. The override note is
       demoted to informational context only.
    b. RULE 5: After inserting/updating, auto-resolve any open duplicate_name rows where
       the duplicate no longer exists in the current rankings cache.

  ## Changes
  - public.player_identity_anomalies: close stale rows for player_id 1819
  - public.refresh_player_identity_anomalies(): rebuilt with corrected logic
*/

-- ─── STEP 1: Close the stale false-positive anomaly rows ──────────────────────

UPDATE public.player_identity_anomalies SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(notes, '') ||
    ' | RESOLVED 2026-05-13: False positive. player_id 1845 renamed to Nick Murray. ' ||
    'Only one Zac Taylor (player_id 1819) now exists in the backend. No real conflict.'
WHERE player_id = 1819
  AND anomaly_type IN ('dual_identity', 'duplicate_name')
  AND status != 'resolved';

-- ─── STEP 2: Rebuild refresh_player_identity_anomalies() ─────────────────────

CREATE OR REPLACE FUNCTION public.refresh_player_identity_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_inserted   int := 0;
  v_updated    int := 0;
  v_total      int := 0;
  v_anomaly    record;
  v_existing   uuid;
  v_result     jsonb;
BEGIN

-- ── RULE 1 — CRITICAL: Dual identity ────────────────────────────────────────
-- FIXED: Only fire when two distinct player_ids currently share the same name
-- on the same team in the live rankings cache. The override note is used for
-- context only — it no longer triggers the rule on its own.
FOR v_anomaly IN
  SELECT
    MIN(c.player_id)   AS player_id,
    c.player_name      AS player_name,
    c.team_name        AS team_name,
    jsonb_build_object(
      'player_ids', array_agg(c.player_id ORDER BY c.player_id),
      'count',      count(*),
      'note',       'Two active players share the same name on the same team in rankings cache'
    ) AS details
  FROM public.player_rankings_cache c
  WHERE c.player_name NOT ILIKE 'Player#%'
    AND c.player_name IS NOT NULL
    AND c.player_name != ''
  GROUP BY lower(trim(c.player_name)), c.player_name, c.team_name
  HAVING count(DISTINCT c.player_id) > 1
LOOP
  SELECT id INTO v_existing
  FROM public.player_identity_anomalies
  WHERE player_id   = v_anomaly.player_id
    AND anomaly_type = 'dual_identity'
    AND status       != 'resolved'
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

-- Auto-resolve open dual_identity rows where the conflict no longer exists
UPDATE public.player_identity_anomalies a SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(a.notes, '') || ' | Auto-resolved: duplicate name no longer present in rankings cache.'
WHERE a.anomaly_type = 'dual_identity'
  AND a.status       != 'resolved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_rankings_cache c
    WHERE lower(trim(c.player_name)) = lower(trim(a.player_name))
      AND c.team_name = a.team_name
      AND c.player_id != a.player_id
  );

-- ── RULE 2 — HIGH: High-value placeholder (avg >= 60) ───────────────────────
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
  WHERE player_id    = v_anomaly.player_id
    AND anomaly_type  = 'high_value_placeholder'
    AND status        != 'resolved'
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

-- ── RULE 3 — HIGH: Unknown identity flagged via override ─────────────────────
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
  WHERE player_id    = v_anomaly.player_id
    AND anomaly_type  = 'unknown_identity'
    AND status        != 'resolved'
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

-- ── RULE 4 — MEDIUM: Standard placeholder (avg < 60 or no stats) ─────────────
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
      WHERE x.player_id    = c.player_id
        AND x.anomaly_type  = 'high_value_placeholder'
        AND x.status        != 'resolved'
    )
LOOP
  SELECT id INTO v_existing
  FROM public.player_identity_anomalies
  WHERE player_id    = v_anomaly.player_id
    AND anomaly_type  = 'placeholder'
    AND status        != 'resolved'
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

-- ── RULE 5 — MEDIUM: Duplicate active names within same team ─────────────────
-- FIXED: After detecting duplicates, also auto-resolve stale duplicate_name
-- rows where the duplicate no longer exists in the rankings cache.
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
  WHERE player_name    = v_anomaly.player_name
    AND team_name       = v_anomaly.team_name
    AND anomaly_type    = 'duplicate_name'
    AND status          != 'resolved'
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

-- Auto-resolve open duplicate_name rows where the duplicate no longer exists
UPDATE public.player_identity_anomalies a SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(a.notes, '') || ' | Auto-resolved: duplicate name no longer present in rankings cache.'
WHERE a.anomaly_type = 'duplicate_name'
  AND a.status       != 'resolved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_rankings_cache c1
    JOIN public.player_rankings_cache c2
      ON lower(trim(c1.player_name)) = lower(trim(c2.player_name))
      AND c1.team_name = c2.team_name
      AND c1.player_id != c2.player_id
    WHERE lower(trim(c1.player_name)) = lower(trim(a.player_name))
      AND c1.team_name = a.team_name
  );

-- ── RULE 6 — LOW: Has override record (general monitoring) ───────────────────
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
  WHERE player_id    = v_anomaly.player_id
    AND anomaly_type  = 'has_override'
    AND status        != 'resolved'
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

-- ── Summary + log ─────────────────────────────────────────────────────────────
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
$function$;
