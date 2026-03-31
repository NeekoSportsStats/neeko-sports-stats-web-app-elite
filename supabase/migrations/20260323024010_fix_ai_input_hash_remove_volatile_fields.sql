
/*
  # Fix AI Input Hash — Remove Volatile / Non-Analytic Fields

  ## Problem
  The current `input_hash` in `v_ai_player_analysis_input` includes fields that
  change frequently but should NOT trigger AI regeneration:
    - `ai_recommendation`  — this is an AI OUTPUT, including it creates regen loops
    - `signal_count`       — changes when injury/availability signals update
    - `is_bye`             — bye flag changes every round but does not change player analysis

  ## Fix
  Rebuild `public.v_ai_player_analysis_input` with a hardened hash that ONLY
  includes core analytic signals:
    - price
    - projection_final
    - projection_confidence (confidence)
    - value_score
    - games_played
    - risk_rating
    - neeko_rating_scaled

  The `needs_regen` CASE expression is also updated to use the new hash, and
  the bye/signal fields are retained as display columns (no longer part of hash).

  ## Safety
  - No schema changes
  - No prompt changes
  - No AI output structure changes
  - View-only replacement (DROP + CREATE OR REPLACE)
*/

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c."position",
  c.price,
  c.projection_final,
  c.ceiling,
  c.floor,
  c.risk_rating                            AS risk,
  c.projection_confidence                  AS confidence,
  c.confidence_label,
  c.consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier                     AS venue_multiplier,
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
  COALESCE(s.signal_count, 0)              AS signal_count,
  COALESCE(s.top_signals, '{}'::text[])    AS top_signals,
  CASE
    WHEN c.form_score > 65 AND c.consistency > 0.55 THEN 'UP'
    WHEN c.form_score < 40 OR  c.consistency < 0.40 THEN 'DOWN'
    ELSE 'FLAT'
  END AS trend_direction,

  -- HARDENED HASH: only core analytic signals that genuinely change AI analysis
  -- EXCLUDED: ai_recommendation (output field — causes regen loops)
  -- EXCLUDED: signal_count (changes with injury flags — not an AI signal)
  -- EXCLUDED: is_bye (round-level flag — not an AI signal)
  md5(
    COALESCE(c.price::text,                  '') ||
    COALESCE(c.projection_final::text,       '') ||
    COALESCE(c.projection_confidence::text,  '') ||
    COALESCE(c.value_score::text,            '') ||
    COALESCE(c.games_played::text,           '') ||
    COALESCE(c.risk_rating::text,            '') ||
    COALESCE(c.neeko_rating_scaled::text,    '')
  ) AS input_hash,

  -- needs_regen: TRUE when hash differs OR significant projection/price drift
  CASE
    WHEN a.player_id  IS NULL  THEN true
    WHEN a.input_hash IS NULL  THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.price::text,                  '') ||
      COALESCE(c.projection_final::text,       '') ||
      COALESCE(c.projection_confidence::text,  '') ||
      COALESCE(c.value_score::text,            '') ||
      COALESCE(c.games_played::text,           '') ||
      COALESCE(c.risk_rating::text,            '') ||
      COALESCE(c.neeko_rating_scaled::text,    '')
    ) THEN true
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2 THEN true
    WHEN a.stored_price IS NOT NULL
      AND c.price IS NOT NULL
      AND abs(c.price::numeric - a.stored_price) > 5000 THEN true
    ELSE false
  END AS needs_regen

FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
LEFT JOIN public.v_player_signals_master s ON s.player_id = c.player_id
WHERE c.player_id IS NOT NULL;
