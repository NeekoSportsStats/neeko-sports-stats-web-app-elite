
/*
  # Canonical System Fix 04 — Validation view + system documentation table

  ## Creates
  - public.v_canonical_system_audit: live diagnostic view showing any remaining contradictions
  - public.canonical_system_register: persisted table documenting all canonical formulas,
    thresholds, and column roles — the SINGLE SOURCE OF TRUTH reference

  ## Canonical System Summary
  ┌─────────────────────────────────────────────────────────────────┐
  │ NEEKO CANONICAL SYSTEM v3  (2026-04-14)                         │
  ├──────────────────┬──────────────────────────────────────────────┤
  │ projection_final │ Output of afl.mv_player_projection           │
  │ breakeven        │ games=0: COALESCE(last5,last3,last10,proj)   │
  │                  │ games 1-2: 0.4*season+0.6*COALESCE(recent)  │
  │                  │ games 3+: season_avg                         │
  │ edge / value_score│ projection_final - breakeven                │
  │ trend_score      │ projection_final - COALESCE(season,last5,l3) │
  │ form_delta       │ last_3_avg - season_avg                      │
  ├──────────────────┬──────────────────────────────────────────────┤
  │ SIGNAL_CANONICAL │ STRONG_START: edge >= 15                     │
  │ (edge-based)     │ START:        edge >= 8                      │
  │                  │ HOLD:         -8 < edge < 8                  │
  │                  │ SIT:          -15 < edge <= -8               │
  │                  │ STRONG_SIT:   edge <= -15                    │
  ├──────────────────┬──────────────────────────────────────────────┤
  │ TREND_SIGNAL     │ STRONG_UP:   trend >= 18                     │
  │ (trend-based,    │ UP:          trend >= 8                      │
  │  SEPARATE metric)│ STABLE:      -5 < trend < 8                  │
  │                  │ DOWN:        -15 < trend <= -5               │
  │                  │ STRONG_DOWN: trend <= -15                    │
  └──────────────────┴──────────────────────────────────────────────┘

  NOTE: signal_canonical/signal/signal_tag all store the edge-based signal.
        trend_signal stores the trend-based signal.
        These are DIFFERENT metrics with DIFFERENT vocabularies.
        Do NOT mix them in the same filter.
*/

-- Drop old version if exists
DROP TABLE IF EXISTS public.canonical_system_register CASCADE;

CREATE TABLE public.canonical_system_register (
  id            serial PRIMARY KEY,
  metric        text NOT NULL,
  formula       text NOT NULL,
  source_fields text NOT NULL,
  column_in_cache text NOT NULL,
  notes         text,
  version       text DEFAULT 'v3',
  updated_at    timestamptz DEFAULT now()
);

INSERT INTO public.canonical_system_register (metric, formula, source_fields, column_in_cache, notes) VALUES
('projection_final',
 'output of afl.mv_player_projection (multi-factor model)',
 'mv.projection',
 'projection_final (numeric), projection (double precision)',
 'Both store the same value in different types for legacy compatibility'),
('breakeven',
 'CASE games=0: COALESCE(last5_avg,last3_avg,last10_avg,projection) | games=1-2: 0.4*season+0.6*COALESCE(last5,last3,last10,season) | games>=3: season_avg',
 'mv.games_played, mv.season_avg, mv.last5_avg, mv.last3_avg, mv.last10_avg, mv.projection',
 'breakeven = breakeven_canonical = baseline (all three identical)',
 'Three aliases exist for legacy compatibility. All are the same value.'),
('edge / value_score',
 'projection_final - breakeven',
 'projection_final, breakeven_canonical',
 'edge = edge_canonical = value_score = value_score_canonical = value (all five identical)',
 'Five aliases exist for legacy compatibility. All are the same value. Capped at ±40 for signal calculation only.'),
('signal_canonical',
 'STRONG_START>=15 | START>=8 | HOLD>-8 | SIT>-15 | STRONG_SIT<=-15 (applied to edge capped at ±40)',
 'edge_canonical',
 'signal_canonical = signal = signal_tag (all three identical)',
 'EDGE-BASED signal. Do NOT confuse with trend_signal which uses a different vocabulary.'),
('signal_display',
 'STRONG_START->Strong Start | START->Start | HOLD->Watch | SIT->Avoid | STRONG_SIT->Hard Avoid',
 'signal_canonical',
 'signal_display',
 'Human-readable label for UI display'),
('category_canonical',
 'STRONG_START|START -> Target | HOLD -> Watch | SIT|STRONG_SIT -> Avoid',
 'signal_canonical',
 'category_canonical = market_watch_category (both identical)',
 'Three-value grouping for Market Watch UI'),
('action_canonical',
 'STRONG_START|START -> START | HOLD -> HOLD | SIT|STRONG_SIT -> SIT',
 'signal_canonical',
 'action_canonical',
 'Three-value action for use in buy/sell/hold UI contexts'),
('trend_score',
 'projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)',
 'projection_final, season_avg, last_5_avg, last_3_avg',
 'trend_score',
 'Measures how much projection exceeds historical baseline. SEPARATE from edge.'),
('trend_signal',
 'STRONG_UP>=18 | UP>=8 | STABLE>-5 | DOWN>-15 | STRONG_DOWN<=-15 (applied to trend_score)',
 'trend_score',
 'trend_signal',
 'TREND-BASED signal. Uses DIFFERENT vocabulary than signal_canonical. Do NOT mix filters.'),
('form_delta',
 'last_3_avg - season_avg',
 'last_3_avg, season_avg',
 'form_delta',
 'Pure momentum indicator. Positive = trending up vs season average. NULL when season_avg is NULL (early season).');

-- Validation view: shows any remaining contradictions in live data
CREATE OR REPLACE VIEW public.v_canonical_system_audit
WITH (security_invoker = false)
AS
SELECT
  player_name,
  projection_final,
  breakeven_canonical,
  edge_canonical,
  signal_canonical,
  trend_score,
  trend_signal,
  form_delta,
  -- Contradiction checks
  CASE WHEN ROUND(edge_canonical, 1) != ROUND(value_score_canonical, 1)      THEN 'edge != value_score' END AS contradiction_1,
  CASE WHEN ROUND(edge_canonical, 1) != ROUND(value_score::numeric, 1)        THEN 'edge != value_score_dp' END AS contradiction_2,
  CASE WHEN signal_canonical != signal                                          THEN 'signal != signal_canonical' END AS contradiction_3,
  CASE WHEN signal_canonical != signal_tag                                      THEN 'signal_tag != signal_canonical' END AS contradiction_4,
  CASE WHEN category_canonical != market_watch_category                         THEN 'category != market_watch_category' END AS contradiction_5,
  -- Signal threshold correctness checks
  CASE WHEN edge_canonical >= 15 AND signal_canonical != 'STRONG_START'        THEN 'edge>=15 but not STRONG_START' END AS threshold_1,
  CASE WHEN edge_canonical >= 8  AND edge_canonical < 15 AND signal_canonical NOT IN ('STRONG_START','START') THEN 'edge 8-14 but not START' END AS threshold_2,
  CASE WHEN edge_canonical > -8  AND edge_canonical < 8  AND signal_canonical != 'HOLD'                       THEN 'edge -7.9 to 7.9 but not HOLD' END AS threshold_3,
  CASE WHEN edge_canonical <= -8 AND edge_canonical > -15 AND signal_canonical NOT IN ('SIT','STRONG_SIT')    THEN 'edge -8 to -14 but not SIT' END AS threshold_4,
  CASE WHEN edge_canonical <= -15 AND signal_canonical != 'STRONG_SIT'         THEN 'edge<=-15 but not STRONG_SIT' END AS threshold_5
FROM afl.player_rankings_cache
WHERE status NOT IN ('delisted','retired')
  AND projection_final > 0;

GRANT SELECT ON public.v_canonical_system_audit TO authenticated;
GRANT SELECT ON public.canonical_system_register TO anon, authenticated;
