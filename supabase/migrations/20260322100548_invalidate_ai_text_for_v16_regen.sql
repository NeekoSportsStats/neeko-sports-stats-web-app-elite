/*
  # Invalidate AI text for v16 prompt regen

  Clears summary_short, summary_long, and input_hash so the generate-player-ai
  edge function (now v16) regenerates all player analyses with the new prompt
  that injects value_gap_signal and sharpened CONTEXT_TONE guides.

  Only text fields are cleared — all pricing, projection, and recommendation
  data is preserved intact.
*/

UPDATE ai.player_ai_analysis
SET
  summary_short = NULL,
  summary_long  = NULL,
  input_hash    = NULL,
  generated_at  = NULL;
