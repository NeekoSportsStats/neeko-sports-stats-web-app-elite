/*
  # Add input_hash to v_neeko_intel_features_source_2026

  ## Problem
  The source view used to feed AI generation is missing an `input_hash` column.
  Without this, the AI pipeline cannot detect when player inputs have changed
  and must regenerate all players every run.

  ## Fix
  Rebuild the view to add a deterministic MD5 hash of the key fantasy-relevant
  columns. When this hash changes, it signals that AI analysis needs regeneration.

  ## Hash inputs
  player_id, projection_final, ceiling_estimate, floor_estimate,
  matchup_rating, venue_multiplier, rest_days, price, value_score,
  volatility_score, stability_score

  These are the columns that meaningfully affect the AI output — changes here
  warrant a new analysis. Static data (name, team) is excluded.
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv."position"                                AS position_group,
  mv.opponent_name,
  mv.is_home,
  mv.price,
  mv.game_date,
  mv.venue,
  mv.projection                                AS projection_final,
  mv.ceiling                                   AS ceiling_estimate,
  mv.floor                                     AS floor_estimate,
  mv.consistency                               AS consistency_score,
  mv.form_score                                AS form_rating,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_momentum,
  ROUND(mv.matchup_rating * 100.0, 1)          AS matchup_rating,
  mv.venue_multiplier,
  mv.rest_days,
  mv.risk                                      AS risk_tier,
  mv.confidence                                AS projection_confidence,
  mv.base_confidence_score,
  mv.confidence_tier                           AS calibrated_confidence_tier,
  COALESCE(mv.neeko_rating, 50.0)              AS upside_rating,
  mv.value_score,
  mv.games_played,
  mv.volatility_score,
  mv.stability_score,
  mv.ceiling_hit_rate,
  mv.floor_bust_rate,
  mv.breakout_probability,
  rs.role_change_score,
  md5(
    COALESCE(mv.player_id::text,       '') ||
    COALESCE(mv.projection::text,      '') ||
    COALESCE(mv.ceiling::text,         '') ||
    COALESCE(mv.floor::text,           '') ||
    COALESCE(ROUND(mv.matchup_rating * 100.0, 1)::text, '') ||
    COALESCE(mv.venue_multiplier::text, '') ||
    COALESCE(mv.rest_days::text,       '') ||
    COALESCE(mv.price::text,           '') ||
    COALESCE(mv.value_score::text,     '') ||
    COALESCE(mv.volatility_score::text,'') ||
    COALESCE(mv.stability_score::text, '')
  )                                            AS input_hash
FROM afl.mv_player_projection mv
LEFT JOIN afl.player_role_signals rs ON rs.player_id = mv.player_id;

GRANT SELECT ON public.v_neeko_intel_features_source_2026 TO authenticated;
GRANT SELECT ON public.v_neeko_intel_features_source_2026 TO anon;
