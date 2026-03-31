/*
  # Add Bye Fields to Rankings Views and AI Input View

  ## Summary
  Propagates bye_round, is_bye, bye_next_round into the three key public views.
  Must DROP + recreate views due to Postgres column-order constraints.
*/

-- ── Drop and recreate v_rankings_master ─────────────────────────────────────

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, ceiling_estimate, floor_estimate,
  consistency, form_score, neeko_rating, price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  signal, summary, analysis,
  projection_confidence, risk_rating, matchup_rating, upside_rating, upside_pct,
  captain_score, captain_rating,
  ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
  recommendation_strength, ai_summary, ai_updated_at,
  consistency_tier, games_played, matchup_multiplier, matchup_label,
  neeko_rating_raw, neeko_rating_scaled,
  start_sit_decision, edge_score, edge_tier, market_watch_category,
  confidence_label, status, is_available,
  total_count, cached_at,
  bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c;

-- ── Drop and recreate v_rankings_free ────────────────────────────────────────

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_free AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, ceiling, floor,
  consistency, form_score, neeko_rating, neeko_rating_scaled,
  price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
  ai_recommendation, recommendation_strength, recommendation_color,
  recommendation_short, recommendation_why, ai_summary,
  consistency_tier,
  'free'::text AS access_tier,
  total_count, cached_at, games_played,
  row_number() OVER (
    ORDER BY COALESCE(neeko_rating_scaled, neeko_rating, 0::double precision) DESC NULLS LAST
  )::integer AS row_rank,
  start_sit_decision, edge_score, edge_tier, market_watch_category,
  status, is_available,
  bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c
WHERE player_name IS NOT NULL AND player_id IS NOT NULL;

-- ── Drop and recreate v_ai_player_analysis_input ─────────────────────────────

DROP VIEW IF EXISTS public.v_ai_player_analysis_input CASCADE;

CREATE VIEW public.v_ai_player_analysis_input AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  c.ceiling,
  c.floor,
  c.risk_rating            AS risk,
  c.projection_confidence  AS confidence,
  c.confidence_label,
  c.consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier     AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.upside_pct,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_strength,
  c.price_change,
  c.price_change_pct,
  c.bye_round,
  c.is_bye,
  c.bye_next_round,
  COALESCE(s.signal_count, 0)         AS signal_count,
  COALESCE(s.top_signals, '{}')       AS top_signals,
  CASE
    WHEN c.form_score > 65 AND c.consistency > 0.55 THEN 'UP'
    WHEN c.form_score < 40 OR c.consistency < 0.40  THEN 'DOWN'
    ELSE 'FLAT'
  END                                 AS trend_direction,
  md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '') ||
    COALESCE(c.ai_recommendation, '') ||
    COALESCE(s.signal_count::text, '0') ||
    COALESCE(c.is_bye::text, 'false')
  )                                   AS input_hash,
  CASE
    WHEN a.player_id IS NULL THEN true
    WHEN a.input_hash IS NULL THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.projection_confidence::text, '') ||
      COALESCE(c.value_score::text, '') ||
      COALESCE(c.games_played::text, '') ||
      COALESCE(c.risk_rating::text, '') ||
      COALESCE(c.neeko_rating_scaled::text, '') ||
      COALESCE(c.ai_recommendation, '') ||
      COALESCE(s.signal_count::text, '0') ||
      COALESCE(c.is_bye::text, 'false')
    ) THEN true
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2 THEN true
    ELSE false
  END                                 AS needs_regen
FROM afl.player_rankings_cache        c
LEFT JOIN ai.player_ai_analysis       a ON a.player_id  = c.player_id
LEFT JOIN public.v_player_signals_master s ON s.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

-- Restore grants
GRANT SELECT ON public.v_rankings_master TO authenticated, anon;
GRANT SELECT ON public.v_rankings_free   TO authenticated, anon;
GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated, anon;
