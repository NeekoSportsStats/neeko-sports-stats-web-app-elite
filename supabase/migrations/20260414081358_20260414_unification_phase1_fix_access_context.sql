/*
  # Unification Phase 1 — Fix get_access_context() Cancellation Bug

  ## Problem
  get_access_context() only grants premium access for 'active' and 'trialing' subscription
  statuses. is_premium_user() ALSO grants access for 'canceled'/'cancelled' statuses when
  the current_period_end is still in the future (i.e., user cancelled but is still within
  their paid billing period).

  This caused cross-page access inconsistency:
  - Rankings (uses is_premium_user()) → correctly grants access to cancelled-in-period users
  - Market Watch, Player Detail, Teams, Positions (use get_access_context()) → incorrectly denied

  ## Fix
  Drop and recreate get_access_context() to match is_premium_user() exactly:
  - Allow statuses: 'active', 'trialing', 'canceled', 'cancelled'
  - AND current_period_end > now()
  - Also apply manual_premium expiry check matching is_premium_user()

  ## Impact
  All RPCs using get_access_context() will now correctly grant premium access to users
  who cancelled but are still within their paid billing period. Same behavior as Rankings.
*/

DROP FUNCTION IF EXISTS public.get_access_context(uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_access_context(
  p_user_id uuid,
  p_is_bot  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium       boolean := false;
  v_is_admin         boolean := false;
  v_free_player_ids  int[];
  v_manual_premium   boolean := false;
  v_manual_expires   timestamptz;
  v_subscription_status text;
BEGIN
  -- Bots are ALWAYS free users (no premium access)
  IF p_is_bot THEN
    SELECT get_free_player_ids() INTO v_free_player_ids;

    RETURN jsonb_build_object(
      'is_premium',      false,
      'is_admin',        false,
      'is_bot',          true,
      'free_player_ids', v_free_player_ids,
      'user_id',         NULL
    );
  END IF;

  -- Check authenticated user premium status
  IF p_user_id IS NOT NULL THEN
    -- Check manual premium override (with optional expiry — matches is_premium_user())
    SELECT
      COALESCE(p.is_manual_premium, false),
      p.manual_premium_expires_at
    INTO v_manual_premium, v_manual_expires
    FROM public.profiles p
    WHERE p.id = p_user_id
    LIMIT 1;

    -- Manual premium grants access if flag is true AND not expired
    IF v_manual_premium AND (v_manual_expires IS NULL OR v_manual_expires > now()) THEN
      v_is_premium := true;
    END IF;

    -- Check subscription status — matches is_premium_user() logic exactly:
    -- Grant access if current_period_end is in the future AND status is one of:
    --   A) active / trialing (normal active subscription)
    --   B) canceled / cancelled (user cancelled but still within paid period)
    IF NOT v_is_premium THEN
      SELECT s.status
      INTO v_subscription_status
      FROM public.subscriptions s
      WHERE (s.profile_id = p_user_id OR s.user_id = p_user_id)
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end > now()
        AND s.status IN ('active', 'trialing', 'canceled', 'cancelled')
      ORDER BY s.updated_at DESC
      LIMIT 1;

      v_is_premium := v_subscription_status IS NOT NULL;
    END IF;

    -- Check admin status
    v_is_admin := is_admin_user();
  END IF;

  -- Get free player IDs
  SELECT get_free_player_ids() INTO v_free_player_ids;

  RETURN jsonb_build_object(
    'is_premium',      v_is_premium,
    'is_admin',        v_is_admin,
    'is_bot',          false,
    'free_player_ids', v_free_player_ids,
    'user_id',         p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_context(uuid, boolean) TO anon, authenticated;
