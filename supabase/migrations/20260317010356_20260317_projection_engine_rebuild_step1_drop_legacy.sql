
/*
  # Projection Engine Rebuild — Step 1: Drop Legacy Views

  ## Summary
  Drops the legacy stacked-view projection architecture to clear the path
  for the new feature-table-based engine.

  ## Objects Dropped (CASCADE)
  - afl.v_captain_scores          (depended on v_projection_engine)
  - afl.v_score_probabilities     (depended on v_projection_engine)
  - afl.v_player_risk_model       (depended on v_projection_engine)
  - public.v_neeko_intel_features_source_2026 (depended on v_projection_engine)
  - afl.v_projection_engine       (legacy root view)
  - afl.v_projection_venue        (legacy intermediate view)
  - afl.v_projection_final        (legacy intermediate view)

  ## Notes
  All dropped views will be rebuilt in step 2 reading from afl.mv_player_projection.
*/

DROP VIEW IF EXISTS afl.v_captain_scores CASCADE;
DROP VIEW IF EXISTS afl.v_score_probabilities CASCADE;
DROP VIEW IF EXISTS afl.v_player_risk_model CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_features_source_2026 CASCADE;
DROP VIEW IF EXISTS afl.v_projection_engine CASCADE;
DROP VIEW IF EXISTS afl.v_projection_venue CASCADE;
DROP VIEW IF EXISTS afl.v_projection_final CASCADE;
