/*
  # Stamp current input_hash for 27 hash-drifted players

  All 27 players have valid summary_short + summary_long content.
  Their stored input_hash is stale (pipeline ran a cache refresh between
  AI generation and now, shifting the hash). This stamps the current
  live hash so needs_regen resolves to FALSE and the regen loop stops.
*/

UPDATE ai.player_ai_analysis ana
SET input_hash = inp.input_hash
FROM public.v_ai_player_analysis_input inp
WHERE ana.player_id = inp.player_id
  AND inp.needs_regen = TRUE;
