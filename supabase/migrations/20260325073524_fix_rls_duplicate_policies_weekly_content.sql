/*
  # Clean up duplicate RLS policies on weekly content tables

  ## Problem
  weekly_content_plans and weekly_content_posts have multiple duplicate policies
  for the same operations (e.g., two INSERT policies for admins with slightly
  different names), creating ambiguity and policy evaluation overhead.

  ## Changes
  - Drop all existing policies on both tables
  - Recreate clean, canonical policy set: service_role full access, admin read/write

  ## Security Impact: LOW (cleanup / correctness fix)
*/

DROP POLICY IF EXISTS "Admins can insert weekly content plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can insert weekly_content_plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can read weekly content plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can read weekly_content_plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can update weekly content plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can update weekly_content_plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Admins can delete weekly content plans" ON public.weekly_content_plans;
DROP POLICY IF EXISTS "Service role can manage weekly content plans" ON public.weekly_content_plans;

DROP POLICY IF EXISTS "Admins can insert weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can insert weekly_content_posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can read weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can read weekly_content_posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can update weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can update weekly_content_posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Admins can delete weekly content posts" ON public.weekly_content_posts;
DROP POLICY IF EXISTS "Service role can manage weekly content posts" ON public.weekly_content_posts;

CREATE POLICY "Service role manages weekly content plans"
  ON public.weekly_content_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read weekly content plans"
  ON public.weekly_content_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert weekly content plans"
  ON public.weekly_content_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update weekly content plans"
  ON public.weekly_content_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete weekly content plans"
  ON public.weekly_content_plans
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role manages weekly content posts"
  ON public.weekly_content_posts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read weekly content posts"
  ON public.weekly_content_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert weekly content posts"
  ON public.weekly_content_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update weekly content posts"
  ON public.weekly_content_posts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete weekly content posts"
  ON public.weekly_content_posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
