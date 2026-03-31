
/*
  # Fix AI Pipeline: Source View + Input View

  ## Problems Fixed

  1. v_neeko_intel_features_source_2026 is missing breakout_probability and
     role_change_score columns (they live on mv_player_projection but were
     not exposed in the last Phase 9 rebuild).

  2. v_ai_player_analysis_input does not exist. The edge function
     generate-player-ai reads from this view but it was never created.
     We wire it to ai.player_prompt_inputs which already has 724 rows.

  ## Changes
  - Rebuilds public.v_neeko_intel_features_source_2026 to add the two
    missing columns from mv_player_projection.
  - Creates public.v_ai_player_analysis_input as a stable bridge view
    that maps ai.player_prompt_inputs + mv_player_projection extras.
    Also joins ai.player_ai_analysis to expose analysis (null = needs gen).

  ## Notes
  - No tables dropped or modified.
  - Safe to rerun: views are replaced with CREATE OR REPLACE.
*/

-- -----------------------------------------------------------------------
-- Fix 1: Add breakout_probability + role_change_score to source view
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv."position"                                    AS position_group,
  mv.opponent_name,
  mv.is_home,
  mv.price,
  mv.game_date,
  mv.venue,
  mv.projection                                    AS projection_final,
  mv.ceiling                                       AS ceiling_estimate,
  mv.floor                                         AS floor_estimate,
  mv.consistency                                   AS consistency_score,
  mv.form_score                                    AS form_rating,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_momentum,
  ROUND(mv.matchup_rating * 100.0, 1)              AS matchup_rating,
  mv.venue_multiplier,
  mv.rest_days,
  mv.risk                                          AS risk_tier,
  mv.confidence                                    AS projection_confidence,
  mv.base_confidence_score,
  mv.confidence_tier                               AS calibrated_confidence_tier,
  COALESCE(mv.neeko_rating, 50.0)                  AS upside_rating,
  mv.value_score,
  mv.games_played,
  mv.volatility_score,
  mv.stability_score,
  mv.ceiling_hit_rate,
  mv.floor_bust_rate,
  mv.breakout_probability,
  rs.role_change_score
FROM afl.mv_player_projection mv
LEFT JOIN afl.player_role_signals rs ON rs.player_id = mv.player_id;

GRANT SELECT ON public.v_neeko_intel_features_source_2026 TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------
-- Fix 2: Create v_ai_player_analysis_input (what generate-player-ai reads)
-- Maps ai.player_prompt_inputs → enriched with extra source columns.
-- Joins ai.player_ai_analysis so we can filter WHERE analysis IS NULL.
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  pip.player_id,
  pip.player_name,
  pip.team_name                               AS team,
  pip.position,
  pip.price,
  pip.projection                              AS projection_final,
  pip.ceiling,
  pip.floor,
  pip.risk,
  pip.confidence,
  pip.consistency,
  pip.value_score,
  pip.matchup_rating,
  pip.venue_multiplier,
  pip.rest_days,
  pip.form_score,
  pip.form_momentum,
  pip.neeko_rating,
  -- extra context from source view
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
  src.risk_tier,
  pip.input_hash,
  -- existing AI output (NULL = needs generation)
  ana.recommendation                          AS recommendation,
  ana.summary_short,
  ana.summary_long,
  ana.confidence                              AS ai_confidence,
  ana.generated_at,
  -- convenience: combined "analysis" field the edge fn checks for null
  ana.summary_long                            AS analysis
FROM ai.player_prompt_inputs pip
LEFT JOIN public.v_neeko_intel_features_source_2026 src
       ON src.player_id = pip.player_id
LEFT JOIN ai.player_ai_analysis ana
       ON ana.player_id = pip.player_id;

GRANT SELECT ON public.v_ai_player_analysis_input TO anon, authenticated, service_role;
