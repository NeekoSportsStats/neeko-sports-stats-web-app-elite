
/*
  # Audit Fix — Step 1: Rebuild public.v_neeko_intel_features_source_2026

  ## Issues Found
  The current AI prompt source view is missing several key projection fields:
  player_name, team_name, opponent_name, position, price, form averages,
  risk tier, rest_days. The matchup_rating is a raw multiplier (~1.0 scale)
  but needs to be normalised to a 0–100 score for AI prompt readability.

  ## Fix
  Drop and recreate the view with the complete field set required by
  the AI generation pipeline. Correctly scales matchup_rating to 0–100.

  ## Column Changes
  Previous: player_id, projection_final, ceiling_estimate, floor_estimate,
            consistency_score, form_rating, matchup_rating, upside_rating, projection_confidence
  New: adds player_name, team_name, position_group, opponent_name, is_home,
       price, game_date, venue, season_avg, last3_avg, last5_avg, last10_avg,
       form_momentum, venue_multiplier, rest_days, risk_tier, value_score, games_played
*/

DROP VIEW IF EXISTS public.v_neeko_intel_features_source_2026 CASCADE;

CREATE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.position                                       AS position_group,
  mv.opponent_name,
  mv.is_home,
  mv.price,
  mv.game_date,
  mv.venue,
  mv.projection                                     AS projection_final,
  mv.ceiling                                        AS ceiling_estimate,
  mv.floor                                          AS floor_estimate,
  mv.consistency                                    AS consistency_score,
  mv.form_score                                     AS form_rating,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_momentum,
  round(mv.matchup_rating * 100.0, 1)               AS matchup_rating,
  mv.venue_multiplier,
  mv.rest_days,
  mv.risk                                           AS risk_tier,
  mv.confidence                                     AS projection_confidence,
  COALESCE(mv.neeko_rating, 50.0)                   AS upside_rating,
  mv.value_score,
  mv.games_played
FROM afl.mv_player_projection mv;

GRANT SELECT ON public.v_neeko_intel_features_source_2026 TO anon, authenticated, service_role;
