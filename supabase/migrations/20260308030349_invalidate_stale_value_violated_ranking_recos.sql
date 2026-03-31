/*
  # Invalidate stale ranking recos that violate value rules

  ## Problem
  27 players in ai_rankings_player_recos have recommendation_label of
  'MUST START', 'BUY', or 'STRONG BUY' but have value_score < 95 in v_rankings_canonical.
  These were generated before the v10 prompt (which enforces hard value rules) was activated.

  ## Fix
  NULL out input_hash for these 27 rows. The next time generate-ranking-ai or
  generate-ai-worker runs, the hash mismatch will trigger regeneration with the
  correct v10 prompt that enforces value consistency.

  ## Affected rows
  All 2026 season rows where value_score < 95 AND recommendation_label in
  ('BUY', 'MUST START', 'STRONG BUY').
*/

UPDATE public.ai_rankings_player_recos r
SET input_hash = NULL
FROM public.v_rankings_canonical c
WHERE c.player_id = r.player_id
  AND r.season = 2026
  AND c.value_score < 95
  AND r.recommendation_label IN ('BUY', 'MUST START', 'STRONG BUY');
