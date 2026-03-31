/*
  # Clear stale AI summary fields for regeneration (v2)

  ## Purpose
  Clear text AI output fields so the pipeline regenerates fresh summaries on next run.
  No rows dropped. No schema changed.

  ## Fields cleared

  public.ai_rankings_player_recos:
  - recommendation_short → NULL
  - recommendation_long  → NULL
  - recommendation_label → NULL (will be re-assigned by pipeline)
  - recommendation_color → NULL
  - input_hash           → NULL (forces re-evaluation even if input data unchanged)

  public.ai_player_analysis:
  - analysis               → NULL
  - captain_recommendation → NULL
  - input_hash             → NULL
*/

UPDATE public.ai_rankings_player_recos
SET
  recommendation_short  = NULL,
  recommendation_long   = NULL,
  recommendation_label  = NULL,
  recommendation_color  = NULL,
  input_hash            = NULL;

UPDATE public.ai_player_analysis
SET
  analysis               = NULL,
  captain_recommendation = NULL,
  input_hash             = NULL;
