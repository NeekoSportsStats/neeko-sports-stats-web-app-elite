/*
  # Neeko Intel Phase 4.5 Critical Fixes

  ## Summary
  Upgrades the Neeko Intelligence Engine with:

  1. New Columns on ai_neeko_intel_features
     - `neeko_tier` TEXT — classification (Generational/Elite/Strong/Solid/Risky/Avoid)
     - `volatility_tag` TEXT — from bust probability bands (Safe/Normal/Volatile/Extreme)
     - `trend_strength` INTEGER — directional signal = form_rating - consistency_score

  2. Revised Neeko Score Formula (Phase 4.5)
     neeko_score = ROUND(
       projection_final * 0.40
       + form_rating * 0.15
       + matchup_rating * 0.18
       + consistency_score * 0.12
       + upside_rating * 0.10
       - risk_rating * 0.15
     , 0)

  3. Neeko Tier, Volatility Tag, Trend Strength computed in refresh function

  4. v_neeko_intel_master_2026 rebuilt to include all new columns
     Reads from source view (for player_name/team/position) joined with persisted table

  5. Security: GRANT SELECT to anon + authenticated, NOTIFY pgrst reload

  ## Important Notes
  - The persisted table only stores metric columns (keyed by season, player_id)
  - player_name/team/position come from source view via JOIN in master view
  - Refresh function only upserts metric columns (no name/team/position in table)
*/

-- Step 1: Add new columns to persisted features table
ALTER TABLE public.ai_neeko_intel_features
  ADD COLUMN IF NOT EXISTS neeko_tier TEXT,
  ADD COLUMN IF NOT EXISTS volatility_tag TEXT,
  ADD COLUMN IF NOT EXISTS trend_strength INTEGER;

-- Step 2: Replace refresh function with updated Phase 4.5 formula
CREATE OR REPLACE FUNCTION public.refresh_neeko_intel_features_2026()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected integer;
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
    neeko_score,
    neeko_tier,
    volatility_tag,
    trend_strength
  )
  SELECT
    2026 AS season,
    s.player_id,
    COALESCE(s.projection_final, 0)          AS projection_final,
    COALESCE(s.ceiling_estimate, 0)          AS ceiling_estimate,
    COALESCE(s.floor_estimate, 0)            AS floor_estimate,
    COALESCE(s.consistency_score, 50)        AS consistency_score,
    COALESCE(s.form_rating, 50)              AS form_rating,
    COALESCE(s.matchup_rating, 50)           AS matchup_rating,
    COALESCE(s.upside_rating, 50)            AS upside_rating,
    COALESCE(s.risk_rating, 50)              AS risk_rating,
    COALESCE(s.projection_confidence, 50)    AS projection_confidence,

    -- Ceiling probability
    LEAST(100, GREATEST(0, ROUND(
      COALESCE(s.upside_rating, 50) * 0.5
      + COALESCE(s.form_rating, 50) * 0.3
      + COALESCE(s.matchup_rating, 50) * 0.2
    , 0))) AS ceiling_probability_pct,

    -- Bust probability
    LEAST(100, GREATEST(0, ROUND(
      COALESCE(s.risk_rating, 50) * 0.5
      + (100 - COALESCE(s.consistency_score, 50)) * 0.3
      + (100 - COALESCE(s.matchup_rating, 50)) * 0.2
    , 0))) AS bust_probability_pct,

    -- Matchup tier
    CASE
      WHEN COALESCE(s.matchup_rating, 50) >= 75 THEN 'Favourable'
      WHEN COALESCE(s.matchup_rating, 50) >= 55 THEN 'Neutral'
      ELSE 'Tough'
    END AS matchup_tier,

    -- Trend tag
    CASE
      WHEN COALESCE(s.form_rating, 50) > COALESCE(s.consistency_score, 50) + 10 THEN 'Rising'
      WHEN COALESCE(s.form_rating, 50) < COALESCE(s.consistency_score, 50) - 10 THEN 'Falling'
      ELSE 'Stable'
    END AS trend_tag,

    -- Phase 4.5 Neeko Score formula
    LEAST(100, GREATEST(0, ROUND(
      COALESCE(s.projection_final, 0) * 0.40
      + COALESCE(s.form_rating, 50) * 0.15
      + COALESCE(s.matchup_rating, 50) * 0.18
      + COALESCE(s.consistency_score, 50) * 0.12
      + COALESCE(s.upside_rating, 50) * 0.10
      - COALESCE(s.risk_rating, 50) * 0.15
    , 0))) AS neeko_score,

    -- Neeko Tier
    CASE
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.projection_final, 0) * 0.40
        + COALESCE(s.form_rating, 50) * 0.15
        + COALESCE(s.matchup_rating, 50) * 0.18
        + COALESCE(s.consistency_score, 50) * 0.12
        + COALESCE(s.upside_rating, 50) * 0.10
        - COALESCE(s.risk_rating, 50) * 0.15
      , 0))) >= 90 THEN 'Generational'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.projection_final, 0) * 0.40
        + COALESCE(s.form_rating, 50) * 0.15
        + COALESCE(s.matchup_rating, 50) * 0.18
        + COALESCE(s.consistency_score, 50) * 0.12
        + COALESCE(s.upside_rating, 50) * 0.10
        - COALESCE(s.risk_rating, 50) * 0.15
      , 0))) >= 80 THEN 'Elite'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.projection_final, 0) * 0.40
        + COALESCE(s.form_rating, 50) * 0.15
        + COALESCE(s.matchup_rating, 50) * 0.18
        + COALESCE(s.consistency_score, 50) * 0.12
        + COALESCE(s.upside_rating, 50) * 0.10
        - COALESCE(s.risk_rating, 50) * 0.15
      , 0))) >= 70 THEN 'Strong'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.projection_final, 0) * 0.40
        + COALESCE(s.form_rating, 50) * 0.15
        + COALESCE(s.matchup_rating, 50) * 0.18
        + COALESCE(s.consistency_score, 50) * 0.12
        + COALESCE(s.upside_rating, 50) * 0.10
        - COALESCE(s.risk_rating, 50) * 0.15
      , 0))) >= 60 THEN 'Solid'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.projection_final, 0) * 0.40
        + COALESCE(s.form_rating, 50) * 0.15
        + COALESCE(s.matchup_rating, 50) * 0.18
        + COALESCE(s.consistency_score, 50) * 0.12
        + COALESCE(s.upside_rating, 50) * 0.10
        - COALESCE(s.risk_rating, 50) * 0.15
      , 0))) >= 50 THEN 'Risky'
      ELSE 'Avoid'
    END AS neeko_tier,

    -- Volatility Tag
    CASE
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.risk_rating, 50) * 0.5
        + (100 - COALESCE(s.consistency_score, 50)) * 0.3
        + (100 - COALESCE(s.matchup_rating, 50)) * 0.2
      , 0))) < 20 THEN 'Safe'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.risk_rating, 50) * 0.5
        + (100 - COALESCE(s.consistency_score, 50)) * 0.3
        + (100 - COALESCE(s.matchup_rating, 50)) * 0.2
      , 0))) < 40 THEN 'Normal'
      WHEN LEAST(100, GREATEST(0, ROUND(
        COALESCE(s.risk_rating, 50) * 0.5
        + (100 - COALESCE(s.consistency_score, 50)) * 0.3
        + (100 - COALESCE(s.matchup_rating, 50)) * 0.2
      , 0))) < 60 THEN 'Volatile'
      ELSE 'Extreme'
    END AS volatility_tag,

    -- Trend Strength
    ROUND(COALESCE(s.form_rating, 50) - COALESCE(s.consistency_score, 50), 0)::integer AS trend_strength

  FROM public.v_neeko_intel_features_source_2026 s
  ON CONFLICT (season, player_id)
  DO UPDATE SET
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
    neeko_score             = EXCLUDED.neeko_score,
    neeko_tier              = EXCLUDED.neeko_tier,
    volatility_tag          = EXCLUDED.volatility_tag,
    trend_strength          = EXCLUDED.trend_strength,
    updated_at              = now();

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- Step 3: Run immediate backfill
SELECT public.refresh_neeko_intel_features_2026();

-- Step 4: Drop and recreate master view with Phase 4.5 columns
-- Reads from source view (player_name/team/position) + persisted table (metrics)
DROP VIEW IF EXISTS public.v_neeko_intel_master_2026;

CREATE VIEW public.v_neeko_intel_master_2026
WITH (security_invoker = false)
AS
SELECT
  s.player_id,
  s.player_name,
  s.team,
  s.position,
  f.projection_final,
  f.neeko_score,
  f.neeko_tier,
  f.volatility_tag,
  f.trend_strength,
  f.ceiling_probability_pct,
  f.bust_probability_pct,
  f.matchup_rating,
  f.form_rating,
  f.consistency_score,
  f.upside_rating,
  f.risk_rating,
  f.projection_confidence,
  s.ai_recommendation,
  s.recommendation_why,
  f.ceiling_estimate,
  f.floor_estimate,
  s.captain_score,
  s.captain_rating,
  f.trend_tag,
  f.matchup_tier,
  f.role_tag
FROM public.ai_neeko_intel_features f
JOIN public.v_neeko_intel_features_source_2026 s ON s.player_id = f.player_id
WHERE f.season = 2026;

-- Step 5: Grant access
GRANT SELECT ON public.v_neeko_intel_master_2026 TO anon, authenticated;

-- Step 6: Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
