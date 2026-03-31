/*
  # Neeko Phase 4 — Refresh Function + Initial Backfill

  Creates public.refresh_neeko_intel_features_2026():
  - UPSERTs computed Phase 4 features into ai_neeko_intel_features
  - Returns count of rows inserted/updated
  - Safe to re-run at any time

  Then runs it immediately to populate the table.
*/

CREATE OR REPLACE FUNCTION public.refresh_neeko_intel_features_2026()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.ai_neeko_intel_features (
    season,
    player_id,
    projection_final,
    ceiling_estimate,
    floor_estimate,
    consistency_score,
    form_rating,
    matchup_rating,
    upside_rating,
    risk_rating,
    projection_confidence,
    ceiling_probability_pct,
    bust_probability_pct,
    matchup_tier,
    trend_tag,
    role_tag,
    neeko_score,
    generated_at,
    updated_at
  )
  SELECT
    2026,
    player_id,
    projection_final,
    ceiling_estimate,
    floor_estimate,
    consistency_score,
    form_rating,
    matchup_rating,
    upside_rating,
    risk_rating,
    projection_confidence,
    ceiling_probability_pct,
    bust_probability_pct,
    matchup_tier,
    trend_tag,
    role_tag,
    neeko_score,
    now(),
    now()
  FROM public.v_neeko_intel_features_2026
  ON CONFLICT (season, player_id) DO UPDATE SET
    projection_final        = EXCLUDED.projection_final,
    ceiling_estimate        = EXCLUDED.ceiling_estimate,
    floor_estimate          = EXCLUDED.floor_estimate,
    consistency_score       = EXCLUDED.consistency_score,
    form_rating             = EXCLUDED.form_rating,
    matchup_rating          = EXCLUDED.matchup_rating,
    upside_rating           = EXCLUDED.upside_rating,
    risk_rating             = EXCLUDED.risk_rating,
    projection_confidence   = EXCLUDED.projection_confidence,
    ceiling_probability_pct = EXCLUDED.ceiling_probability_pct,
    bust_probability_pct    = EXCLUDED.bust_probability_pct,
    matchup_tier            = EXCLUDED.matchup_tier,
    trend_tag               = EXCLUDED.trend_tag,
    role_tag                = EXCLUDED.role_tag,
    neeko_score             = EXCLUDED.neeko_score,
    updated_at              = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Run initial backfill immediately
SELECT public.refresh_neeko_intel_features_2026();
