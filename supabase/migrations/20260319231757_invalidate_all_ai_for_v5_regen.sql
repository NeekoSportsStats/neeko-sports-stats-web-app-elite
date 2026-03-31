/*
  # Invalidate All Player AI for v5 Prompt Regen

  ## Purpose
  Force full regeneration of all 687+ player AI outputs with the new v5 prompt.

  Issues fixed in v5 vs previous versions:
  - Root cause fixed: pipeline was silently failing with HTTP 401 (wrong auth token)
  - SELL contradiction still present in ~113+ rows (positive language on SELL players)
  - "this round" used 575 times, "primed for" 188 times — templated outputs
  - Extended analysis (long) was 4 sentences — now enforced as 5 sentences
  - New banned phrases: "coaches should", "based on current projections", "reliable option"
  - Stronger SELL enforcement with broader sell-signal vocabulary
  - Variation rules added to prevent repeated sentence structure
  - Post-run verification step added to pipeline

  ## Changes
  - Clears input_hash on all ai.player_ai_analysis rows (triggers needs_regen = true)
  - All 687 players will be picked up by next pipeline run or manual trigger
*/

UPDATE ai.player_ai_analysis
SET input_hash = NULL,
    generated_at = NULL;
