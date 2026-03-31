/*
  # Fix weekly_content_plans and weekly_content_posts RLS Policies

  ## Summary
  Cleans up duplicate and anti-pattern RLS policies on both weekly content tables.

  ## Problem
  Both tables have:
  1. Many duplicate admin policies (same operation, same condition, different names)
  2. Anti-pattern `auth.role() = 'service_role'` policies on the `public` role — these do NOT work
     correctly and can cause permission denials in edge functions using the service role key
  3. Multiple conflicting service_role ALL policies

  ## Changes
  - DROP all duplicate admin policies (keep one canonical set per table)
  - DROP the broken `auth.role() = 'service_role'` anti-pattern policies
  - ENSURE exactly one clean `TO service_role` ALL policy per table
  - Keep the canonical admin policies (one per operation)

  ## Security
  - service_role retains full access via proper `TO service_role` role targeting
  - Admins retain read/write access via `profiles.is_admin = true` check
  - No change to data access patterns — only cleanup of duplicate/broken policies
*/

-- ============================================================
-- weekly_content_plans: drop duplicates and anti-patterns
-- ============================================================

-- Drop duplicate admin SELECT policies (keep "Admins can read weekly content plans")
DROP POLICY IF EXISTS "Admins can select weekly content plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can select weekly_content_plans" ON public.weekly_content_plans;

-- Drop duplicate admin DELETE policies (keep "Admins can delete weekly content plans")
DROP POLICY IF EXISTS "Admins can delete weekly_content_plans" ON public.weekly_content_plans;

-- Drop broken anti-pattern policy (auth.role() on public role — does not work)
DROP POLICY IF EXISTS "service_role_full_access_plans" ON public.weekly_content_plans;

-- Ensure exactly one clean service_role ALL policy exists
DROP POLICY IF EXISTS "Service role manages weekly content plans" ON public.weekly_content_plans;

CREATE POLICY "Service role full access plans"
  ON public.weekly_content_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- weekly_content_posts: drop duplicates and anti-patterns
-- ============================================================

-- Drop all duplicate admin policies — keep the "Admin can *" set
DROP POLICY IF EXISTS "Admins can delete weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can delete weekly_content_posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admin users can delete weekly content posts" ON public.weekly_content_posts;

DROP POLICY IF EXISTS "Admins can insert weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admin users can insert weekly content posts" ON public.weekly_content_posts;

DROP POLICY IF EXISTS "Admins can read weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admin users can manage weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can select weekly_content_posts" ON public.weekly_content_posts;

DROP POLICY IF EXISTS "Admins can update weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admin users can update weekly content posts" ON public.weekly_content_posts;

-- Drop broken anti-pattern policy
DROP POLICY IF EXISTS "service_role_full_access_posts" ON public.weekly_content_posts;

-- Drop duplicate service_role policies — keep one clean one
DROP POLICY IF EXISTS "Service role bypass weekly_content_posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Service role full access to weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Service role manages weekly content posts" ON public.weekly_content_posts;

CREATE POLICY "Service role full access posts"
  ON public.weekly_content_posts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
