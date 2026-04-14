/*
  # Unification Phase 2 — Create afl.v_rankings_unified Canonical View

  ## Purpose
  Creates a single canonical view that exposes ONLY the authoritative column names
  from afl.player_rankings_cache. All downstream RPCs, edge board, market watch,
  and captains must read from this view — never directly from the cache table.

  ## Canonical fields exposed (no aliases, no duplicates):
  - edge_canonical       — the single edge metric (projection - breakeven, capped ±40)
  - signal_canonical     — raw internal signal (STRONG_START/START/HOLD/SIT/STRONG_SIT)
  - signal_display       — human label ("Strong Start", "Start", "Watch", "Avoid", "Hard Avoid")
  - category_canonical   — display category (Target/Watch/Avoid)
  - action_canonical     — action vocab (START/HOLD/SIT)
  - breakeven_canonical  — single breakeven value
  - projection_final     — projection score
  - projection_confidence — confidence score (from calibrated model)

  ## What this eliminates:
  - value_score / value / value_score_canonical (all = edge_canonical — aliased out)
  - signal / signal_tag (= signal_canonical — aliased out)
  - edge / edge_raw (= edge_canonical — aliased out)
  - breakeven / baseline (= breakeven_canonical — aliased out)
  - neeko_rating_scaled (= neeko_rating — aliased out)
  - market_watch_category (= category_canonical — aliased out)

  ## Security
  - SECURITY DEFINER to ensure consistent reads regardless of calling role
  - Grants SELECT to anon and authenticated
*/

DROP VIEW IF EXISTS afl.v_rankings_unified CASCADE;

CREATE OR REPLACE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,
  -- Price
  price,
  prev_price,
  price_change,
  price_change_pct,
  -- Core projection
  projection_final,
  projection_confidence,
  confidence_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate,
  floor_estimate,
  -- CANONICAL METRICS (single names, no aliases)
  breakeven_canonical,
  edge_canonical,
  signal_canonical,
  signal_display,
  category_canonical,
  action_canonical,
  -- Form / trend
  trend_score,
  trend_signal,
  form_score,
  form_delta,
  form_label,
  -- Player quality metrics
  neeko_rating,
  consistency,
  consistency_tier,
  upside_rating,
  upside_pct,
  risk_rating,
  captain_score,
  captain_rating,
  -- Matchup
  matchup_label,
  matchup_multiplier,
  -- AI content
  summary_short,
  summary_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,
  -- Status
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  games_played,
  -- Computed availability flag
  (
    UPPER(COALESCE(manual_status, status, '')) = ANY(ARRAY['INJURED','OUT','OMITTED'])
  ) AS is_injured,
  -- Timestamps
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  -- Count helper
  total_count
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL
  AND projection_final > 30;

-- Grant access
GRANT SELECT ON afl.v_rankings_unified TO anon, authenticated, service_role;
