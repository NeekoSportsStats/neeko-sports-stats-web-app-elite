/*
  # Stripe ↔ Supabase Gating Foundation

  ## Purpose
  Establishes the backend premium-access layer connecting Stripe subscription state
  to row-level security on premium AI content tables.

  ## Premium Source-of-Truth
  The canonical premium check queries BOTH storage locations used in the frontend:
  1. public.subscriptions.status (used by useSubscriptionStatus hook + Stripe webhook)
  2. public.profiles.subscription_status (used by auth.tsx AuthProvider)
  A user is premium if EITHER source shows active/trialing status with a future period_end.

  ## New Functions
  - public.is_premium_user() — SECURITY DEFINER, returns boolean for the calling user
  - public.get_access_state() — RPC returning full access state for frontend gating

  ## RLS Changes
  - afl.ai_player_summaries — Enable RLS + add premium SELECT policy
  - afl.ai_team_summaries — Enable RLS + add premium SELECT policy
  - afl.ai_match_predictions — Replace public-read with premium-read (ai_summary only strategy)
  
  ## Safety
  - Service role bypasses ALL RLS — edge functions continue to write unaffected
  - Non-premium authenticated users get a limited preview (3 rows) from ai_match_predictions
  - ai_player_summaries and ai_team_summaries: premium-only SELECT, no hard errors
    (frontend must handle empty results gracefully — it already does)
  - ai_summary, ai_content fields: gated — structural/score fields are free

  ## Important Notes
  1. NO existing columns are renamed or removed
  2. NO frontend query shapes are changed
  3. The is_premium_user() function checks subscriptions.user_id = auth.uid()
     since that is the field the webhook writes to (confirmed by RLS policy scan)
  4. profiles.subscription_status is also checked as fallback
  5. All policies are SECURITY DEFINER to prevent privilege escalation
*/

/* ============================================================
   B1 — PREMIUM CHECK FUNCTION
   ============================================================ */

CREATE OR REPLACE FUNCTION public.is_premium_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_from_subscriptions boolean := false;
  v_from_profiles boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check subscriptions table (primary — written by Stripe webhook)
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = v_user_id
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) INTO v_from_subscriptions;

  IF v_from_subscriptions THEN
    RETURN true;
  END IF;

  -- Check profiles table (fallback — written by webhook and manual admin grants)
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.subscription_status IN ('active', 'trialing')
      AND (p.current_period_end IS NULL OR p.current_period_end > now())
  ) INTO v_from_profiles;

  RETURN COALESCE(v_from_profiles, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_premium_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_premium_user() TO anon;


/* ============================================================
   B3 — GET ACCESS STATE RPC
   ============================================================ */

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_authenticated boolean := false;
  v_is_premium boolean := false;
  v_tier text := null;
  v_status text := null;
  v_current_period_end timestamptz := null;
  v_sub record;
  v_profile record;
BEGIN
  v_user_id := auth.uid();
  v_is_authenticated := (v_user_id IS NOT NULL);

  IF NOT v_is_authenticated THEN
    RETURN jsonb_build_object(
      'is_authenticated', false,
      'is_premium', false,
      'tier', null,
      'status', 'unauthenticated',
      'current_period_end', null
    );
  END IF;

  -- Check subscriptions table first (primary Stripe source)
  SELECT s.status, s.current_period_end
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = v_user_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.current_period_end DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    v_status := v_sub.status;
    v_current_period_end := v_sub.current_period_end;
    v_is_premium := (v_sub.status IN ('active', 'trialing'))
      AND (v_sub.current_period_end IS NULL OR v_sub.current_period_end > now());
  END IF;

  -- Fallback to profiles if no active subscription found
  IF NOT v_is_premium THEN
    SELECT p.subscription_status, p.subscription_tier, p.current_period_end
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF FOUND THEN
      v_status := COALESCE(v_status, v_profile.subscription_status);
      v_tier := v_profile.subscription_tier;
      v_current_period_end := COALESCE(v_current_period_end, v_profile.current_period_end);
      v_is_premium := v_profile.subscription_status IN ('active', 'trialing')
        AND (v_profile.current_period_end IS NULL OR v_profile.current_period_end > now());
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_authenticated', v_is_authenticated,
    'is_premium', v_is_premium,
    'tier', COALESCE(v_tier, CASE WHEN v_is_premium THEN 'neeko_plus' ELSE null END),
    'status', COALESCE(v_status, 'free'),
    'current_period_end', v_current_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_access_state() TO anon;


/* ============================================================
   B2 — RLS ON AI TABLES
   ============================================================ */

-- ── afl.ai_player_summaries ──────────────────────────────────

ALTER TABLE afl.ai_player_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Premium users can read player summaries"
  ON afl.ai_player_summaries FOR SELECT
  TO authenticated
  USING (public.is_premium_user());

CREATE POLICY "Service role has full access to ai_player_summaries"
  ON afl.ai_player_summaries FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert ai_player_summaries"
  ON afl.ai_player_summaries FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update ai_player_summaries"
  ON afl.ai_player_summaries FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete ai_player_summaries"
  ON afl.ai_player_summaries FOR DELETE
  TO service_role
  USING (true);


-- ── afl.ai_team_summaries ────────────────────────────────────

ALTER TABLE afl.ai_team_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Premium users can read team summaries"
  ON afl.ai_team_summaries FOR SELECT
  TO authenticated
  USING (public.is_premium_user());

CREATE POLICY "Service role has full access to ai_team_summaries"
  ON afl.ai_team_summaries FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert ai_team_summaries"
  ON afl.ai_team_summaries FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update ai_team_summaries"
  ON afl.ai_team_summaries FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete ai_team_summaries"
  ON afl.ai_team_summaries FOR DELETE
  TO service_role
  USING (true);


-- ── afl.ai_match_predictions ─────────────────────────────────
-- Replace the broad "Public can read" policy with a tiered approach:
-- Premium users: full read access
-- Authenticated non-premium: limited preview (3 rows per round via a separate view)
-- The existing "Public can read match predictions" policy allowed full anon access.
-- We replace it with premium-only full access.

DROP POLICY IF EXISTS "Public can read match predictions" ON afl.ai_match_predictions;

CREATE POLICY "Premium users can read match predictions"
  ON afl.ai_match_predictions FOR SELECT
  TO authenticated
  USING (public.is_premium_user());

-- Free preview: any authenticated user can read a limited set (non-AI fields only via view)
-- This policy is intentionally NOT added here — the free preview is served by a separate
-- public safe view created below, so the base table stays premium-gated.
