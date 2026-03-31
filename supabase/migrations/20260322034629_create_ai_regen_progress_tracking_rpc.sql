/*
  # Create AI Regen Progress Tracking RPC

  ## Purpose
  Provides a single public RPC that the admin panel can poll to monitor
  AI regeneration progress in real time.

  ## Returns
  - completed: players with ai text written
  - remaining: players still needing regen
  - total: all players in rankings cache
  - pct_complete: 0–100
  - priority_remaining: top-150 by neeko_rating still needing regen
  - last_generated_at: timestamp of most recent completed player

  ## Security
  SECURITY DEFINER with admin guard — only authenticated admins can call.
*/

CREATE OR REPLACE FUNCTION public.get_ai_regen_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, ai
AS $$
DECLARE
  v_completed        INT;
  v_remaining        INT;
  v_total            INT;
  v_priority_rem     INT;
  v_last_generated   TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE recommendation_short IS NOT NULL AND recommendation_why IS NOT NULL),
    COUNT(*) FILTER (WHERE recommendation_short IS NULL OR recommendation_why IS NULL),
    COUNT(*)
  INTO v_completed, v_remaining, v_total
  FROM afl.player_rankings_cache;

  -- Priority: top 150 by neeko_rating still missing text
  SELECT COUNT(*) INTO v_priority_rem
  FROM (
    SELECT player_id
    FROM afl.player_rankings_cache
    ORDER BY neeko_rating DESC NULLS LAST
    LIMIT 150
  ) top150
  WHERE top150.player_id IN (
    SELECT player_id FROM afl.player_rankings_cache
    WHERE recommendation_short IS NULL OR recommendation_why IS NULL
  );

  SELECT MAX(ai_generated_at) INTO v_last_generated
  FROM afl.player_rankings_cache
  WHERE ai_generated_at IS NOT NULL;

  RETURN jsonb_build_object(
    'completed',         v_completed,
    'remaining',         v_remaining,
    'total',             v_total,
    'pct_complete',      CASE WHEN v_total > 0 THEN ROUND((v_completed::numeric / v_total) * 100, 1) ELSE 0 END,
    'priority_remaining', v_priority_rem,
    'last_generated_at', v_last_generated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_regen_progress() TO authenticated;
