/*
  # Fix: Create public.v_ai_player_analysis_input view

  ## Problem
  Both `generate-player-ai` edge function and `run_neeko_ai_enqueue()` read from
  `public.v_ai_player_analysis_input` — which does not exist in any schema.
  This is the PRIMARY root cause of zero AI generation since 2026-04-02.

  The worker silently returns "All player analyses are up to date" because it
  queries a non-existent view and gets 0 rows (PostgREST returns an empty result
  for a missing relation in some contexts, or the error is swallowed).

  ## Fix
  Create `public.v_ai_player_analysis_input` by joining:
  - `afl.player_rankings_cache` — canonical projection/price/signal/form data
  - `ai.player_ai_analysis` — stored input_hash, needs_regen flag
  
  Exposes all columns the worker reads + `needs_regen` + `input_hash` for
  stale-detection logic in `run_neeko_ai_enqueue()`.

  ## Security
  - SECURITY DEFINER so anon/service role can read through RLS
  - No security policies modified
*/

DROP VIEW IF EXISTS public.v_ai_player_analysis_input;

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.position,

  -- Price & value
  rc.price,
  rc.projection_final,
  rc.ceiling,
  rc.floor,
  rc.breakeven,
  rc.edge,
  rc.value_score,
  rc.value_signal,
  rc.best_value_score,

  -- Risk / confidence
  rc.risk_rating                                        AS risk,
  rc.projection_confidence                              AS confidence,
  rc.confidence_label,
  rc.consistency,

  -- Matchup
  rc.matchup_rating,
  rc.matchup_label,
  rc.matchup_multiplier                                 AS venue_multiplier,

  -- Form
  rc.form_score,
  rc.form_label,
  rc.form_delta,
  rc.trend_score,
  rc.trend_signal                                       AS trend_direction,

  -- Neeko rating
  rc.neeko_rating,
  rc.neeko_rating_scaled,

  -- Games
  rc.games_played,
  rc.season_avg,
  rc.last_3_avg,
  rc.last_5_avg,

  -- Rankings
  rc.upside_rating,
  rc.upside_pct,
  rc.captain_score,
  rc.captain_rating,

  -- Recommendation / signal
  rc.signal,
  rc.signal_tag,
  rc.signal_tag                                         AS ai_recommendation,
  rc.recommendation_strength,

  -- Price movement
  rc.price_change,
  rc.price_change_pct,

  -- Status
  rc.status,
  rc.manual_status,
  rc.is_available,
  rc.is_bye,
  rc.bye_round,

  -- Signals (top signals as JSON array built from signal_tag)
  jsonb_build_array(rc.signal_tag)                      AS top_signals,
  CAST(1 AS integer)                                    AS signal_count,

  -- AI staleness tracking (from ai.player_ai_analysis)
  COALESCE(aa.input_hash, NULL)                         AS input_hash,
  COALESCE(aa.needs_regen, true)                        AS needs_regen,
  aa.generated_at                                       AS ai_generated_at,
  aa.summary_short                                      AS existing_summary_short,
  aa.recommendation                                     AS existing_recommendation,

  -- Computed input_hash for change detection
  -- Hash the key projection/price fields so stale detection works
  md5(
    COALESCE(rc.projection_final::text, '') ||
    COALESCE(rc.price::text, '') ||
    COALESCE(rc.signal_tag, '') ||
    COALESCE(rc.value_score::text, '') ||
    COALESCE(rc.form_score::text, '') ||
    COALESCE(rc.season_avg::text, '')
  )                                                     AS current_input_hash

FROM afl.player_rankings_cache rc
LEFT JOIN ai.player_ai_analysis aa ON aa.player_id = rc.player_id
WHERE rc.player_id IS NOT NULL
  AND rc.player_name IS NOT NULL
  AND COALESCE(rc.status, 'AVAILABLE') NOT IN ('INACTIVE', 'DELISTED')
  AND rc.games_played > 0;

GRANT SELECT ON public.v_ai_player_analysis_input TO service_role;
GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated;
