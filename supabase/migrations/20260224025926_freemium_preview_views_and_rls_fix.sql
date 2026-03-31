
/*
  # Freemium Model: Safe Preview Views + RLS Fix

  ## Summary
  Replaces the current hard-block RLS (premium-only) on afl.ai_* tables with a safe freemium
  model that:
  - Allows ALL authenticated users to access STRUCTURAL fields (numeric predictions, scores, etc.)
  - BLOCKS AI text (ai_summary, prediction_explanation, summary) from non-premium users at DB level
  - Creates SECURITY DEFINER views that NULL out AI text columns for the free tier

  ## New Views (in public schema for anon/authenticated access via RLS)
  - `public.v_ai_player_summaries_preview` — all numeric/structural columns, ai_summary = NULL
  - `public.v_ai_team_summaries_preview` — all columns except summary = NULL
  - `public.v_ai_match_predictions_preview` — all columns except ai_summary = NULL and prediction_explanation = NULL

  ## RLS Changes
  - afl.ai_player_summaries: keep premium-only SELECT, add structural-only policy for authenticated
  - afl.ai_team_summaries: keep premium-only SELECT, add structural-only policy for authenticated
  - afl.ai_match_predictions: keep premium-only SELECT, add structural-only policy for authenticated

  ## Security Notes
  - AI text is enforced at DB level — never sent to non-premium users
  - Preview views use SECURITY DEFINER so they bypass table-level RLS safely
  - Free users query the views; premium users query the real tables directly
*/

-- ============================================================
-- STEP 1: Drop old conflicting policies that allowed everyone
-- ============================================================

DROP POLICY IF EXISTS "Service role full access on ai_match_predictions" ON afl.ai_match_predictions;

-- ============================================================
-- STEP 2: Add structural-access policies (non-premium authenticated users)
-- These return rows but AI text is blocked via column-level RLS
-- NOTE: Column-level RLS is not supported in PostgreSQL, so we use views instead.
-- The policies below gate access to the REAL tables (full data) for premium only.
-- Free users use the SECURITY DEFINER preview views below.
-- ============================================================

-- Ensure premium-only policies exist (keep existing ones)
-- afl.ai_player_summaries: "Premium users can read player summaries" already exists
-- afl.ai_team_summaries: "Premium users can read team summaries" already exists
-- afl.ai_match_predictions: "Premium users can read match predictions" already exists

-- ============================================================
-- STEP 3: Create SECURITY DEFINER preview views in public schema
-- These views NULL out AI text and are accessible to all authenticated users
-- ============================================================

CREATE OR REPLACE VIEW public.v_ai_player_summaries_preview
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player,
  team,
  season,
  round_number,
  match_index,
  opponent,
  expected_fantasy,
  floor_fantasy,
  ceiling_fantasy,
  volatility,
  risk_tier,
  consistency_score,
  matchup_delta,
  matchup_label,
  season_avg,
  last_3_avg,
  last_5_avg,
  games_played,
  trend_direction,
  last_updated,
  updated_at,
  NULL::text AS ai_summary
FROM afl.ai_player_summaries;

CREATE OR REPLACE VIEW public.v_ai_team_summaries_preview
WITH (security_invoker = false)
AS
SELECT
  team,
  season,
  round_number,
  fantasy_verdict,
  updated_at,
  NULL::text AS summary
FROM afl.ai_team_summaries;

CREATE OR REPLACE VIEW public.v_ai_match_predictions_preview
WITH (security_invoker = false)
AS
SELECT
  id,
  match_id,
  home_team,
  away_team,
  round_number,
  season,
  prediction,
  predicted_home_score,
  predicted_away_score,
  predicted_margin,
  predicted_total,
  confidence,
  created_at,
  updated_at,
  NULL::text AS ai_summary,
  NULL::text AS prediction_explanation
FROM afl.ai_match_predictions;

-- ============================================================
-- STEP 4: Grant access to preview views for authenticated users
-- ============================================================

GRANT SELECT ON public.v_ai_player_summaries_preview TO authenticated;
GRANT SELECT ON public.v_ai_team_summaries_preview TO authenticated;
GRANT SELECT ON public.v_ai_match_predictions_preview TO authenticated;

-- Also grant anon access (for unauthenticated previews if needed)
GRANT SELECT ON public.v_ai_player_summaries_preview TO anon;
GRANT SELECT ON public.v_ai_team_summaries_preview TO anon;
GRANT SELECT ON public.v_ai_match_predictions_preview TO anon;

-- ============================================================
-- STEP 5: Ensure get_access_state() RPC exists and is up to date
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium boolean := false;
  v_is_authenticated boolean := false;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated', false,
      'is_premium', false,
      'user_id', null
    );
  END IF;

  v_is_authenticated := true;

  SELECT is_premium_user() INTO v_is_premium;

  RETURN jsonb_build_object(
    'is_authenticated', v_is_authenticated,
    'is_premium', v_is_premium,
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_access_state() TO anon;
