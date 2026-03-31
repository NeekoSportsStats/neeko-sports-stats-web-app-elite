/*
  # Hardening Step 1 — needs_regen column + auto-mark function

  ## Summary
  Adds a `needs_regen` boolean column to `ai.player_ai_analysis` so the pipeline
  can flag players that require AI regeneration without queuing them via the
  heavyweight generation queue.

  ## Changes

  ### Modified Tables
  - `ai.player_ai_analysis`
    - New column: `needs_regen` (boolean, default false)
    - New column: `needs_regen_reason` (text, nullable) — human-readable reason

  ### New Functions
  - `ai.fn_mark_players_needing_regen()`
    Scans `ai.player_ai_analysis` and sets `needs_regen = true` for any player
    whose `summary_short IS NULL OR summary_long IS NULL`. Also stamps the reason.
    Returns the count of players flagged.

  ### Security
  - Function runs as SECURITY DEFINER so it can be called by the pipeline
    (which runs under service_role / postgres).
*/

-- ── 1. Add columns ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ai' AND table_name = 'player_ai_analysis'
      AND column_name = 'needs_regen'
  ) THEN
    ALTER TABLE ai.player_ai_analysis ADD COLUMN needs_regen boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ai' AND table_name = 'player_ai_analysis'
      AND column_name = 'needs_regen_reason'
  ) THEN
    ALTER TABLE ai.player_ai_analysis ADD COLUMN needs_regen_reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_player_ai_analysis_needs_regen
  ON ai.player_ai_analysis (needs_regen)
  WHERE needs_regen = true;

-- ── 2. Mark function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ai.fn_mark_players_needing_regen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ai, public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE ai.player_ai_analysis
  SET
    needs_regen        = true,
    needs_regen_reason = CASE
      WHEN summary_short IS NULL AND summary_long IS NULL THEN 'missing_both'
      WHEN summary_short IS NULL                          THEN 'missing_summary_short'
      WHEN summary_long  IS NULL                          THEN 'missing_summary_long'
    END
  WHERE (summary_short IS NULL OR summary_long IS NULL)
    AND needs_regen = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'ai_regen_flagged', 'ai.fn_mark_players_needing_regen', 'warn',
      'Flagged ' || v_count || ' players needing AI regen (NULL summaries)',
      jsonb_build_object('flagged_count', v_count, 'flagged_at', now())
    );
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION ai.fn_mark_players_needing_regen() TO service_role;

-- ── 3. Immediately mark any already-missing players ──────────────────────────

SELECT ai.fn_mark_players_needing_regen();
