/*
  # Rebuild v_ai_player_analysis_input with live hash comparison (v2)

  ## Problem
  The view currently sources input_hash from ai.player_prompt_inputs (a legacy
  staging table with a static hash). This means the hash never changes when
  projections update, so the AI pipeline cannot detect stale analyses.

  ## Fix
  Drop and recreate the view to:
  1. Source input_hash from v_neeko_intel_features_source_2026 (live computed hash)
  2. Join ai.player_ai_analysis to expose the stored hash
  3. Add a needs_regen boolean: true when stored hash is NULL or differs from live hash
  4. Keep all existing columns for backward compatibility

  ## Result
  The edge function can now filter WHERE needs_regen = true to only process
  players whose inputs have actually changed since last generation.
*/

DROP VIEW IF EXISTS public.v_ai_player_analysis_input;

CREATE VIEW public.v_ai_player_analysis_input AS
SELECT
  src.player_id,
  src.player_name,
  src.team_name                                AS team,
  src.position_group                           AS position,
  src.price,
  src.projection_final,
  src.ceiling_estimate                         AS ceiling,
  src.floor_estimate                           AS floor,
  src.risk_tier                                AS risk,
  src.projection_confidence                    AS confidence,
  src.consistency_score                        AS consistency,
  src.value_score,
  src.matchup_rating,
  src.venue_multiplier,
  src.rest_days,
  src.form_rating                              AS form_score,
  src.form_momentum,
  src.upside_rating                            AS neeko_rating,
  src.season_avg,
  src.last3_avg,
  src.last5_avg,
  src.last10_avg,
  src.opponent_name,
  src.is_home,
  src.venue,
  src.game_date,
  src.volatility_score,
  src.stability_score,
  src.ceiling_hit_rate,
  src.floor_bust_rate,
  src.breakout_probability,
  src.role_change_score,
  src.input_hash,
  ana.recommendation,
  ana.summary_short,
  ana.summary_long,
  ana.confidence                               AS ai_confidence,
  ana.generated_at,
  ana.summary_long                             AS analysis,
  ana.input_hash                               AS stored_hash,
  (
    ana.player_id IS NULL
    OR ana.input_hash IS NULL
    OR ana.input_hash != src.input_hash
  )                                            AS needs_regen
FROM public.v_neeko_intel_features_source_2026 src
LEFT JOIN ai.player_ai_analysis ana ON ana.player_id = src.player_id;

GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated;
GRANT SELECT ON public.v_ai_player_analysis_input TO anon;
