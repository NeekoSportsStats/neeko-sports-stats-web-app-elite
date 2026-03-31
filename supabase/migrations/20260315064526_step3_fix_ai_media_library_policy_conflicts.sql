/*
  # Step 3 — Fix ai_media_library policy conflicts

  ## Problem
  The audit found a chaotic mix of policies on ai_media_library:
  - Conflicting UPDATE policies: some restricted to a hardcoded email, others USING(true)
  - Duplicate policies with the same command
  - Unrestricted INSERT allowed for any authenticated user
  - Multiple overlapping read policies (anon + authenticated + email-scoped)
  - One policy hardcoded to a specific email address (brittle and not admin-role-based)

  ## Changes
  1. Drop ALL existing policies on ai_media_library
  2. Replace with a clean, consistent set:
     - Anon: read active items only (existing product behaviour preserved)
     - Authenticated admin: full CRUD (using is_admin = true check)
     - Service role: full access (for pipeline/edge function writes)

  ## Notes
  - The "Anyone can read active media library items" policy is kept conceptually
    but the anon read policy is now explicit and scoped to is_active = true
  - Email-hardcoded policies are removed; admin access uses the canonical is_admin flag
  - Non-admin authenticated users lose access — this is correct, it's admin content
*/

-- Drop all existing policies on ai_media_library
DROP POLICY IF EXISTS "Admin read media library" ON public.ai_media_library;
DROP POLICY IF EXISTS "Admin update media" ON public.ai_media_library;
DROP POLICY IF EXISTS "Admin update media library" ON public.ai_media_library;
DROP POLICY IF EXISTS "Allow admins to update media library" ON public.ai_media_library;
DROP POLICY IF EXISTS "Allow authenticated update ai_media_library" ON public.ai_media_library;
DROP POLICY IF EXISTS "Anyone can read active media library items" ON public.ai_media_library;
DROP POLICY IF EXISTS "Authenticated users can insert media library items" ON public.ai_media_library;
DROP POLICY IF EXISTS "Authenticated users can update their own media library items" ON public.ai_media_library;
DROP POLICY IF EXISTS "admin_insert_media" ON public.ai_media_library;
DROP POLICY IF EXISTS "admin_read_media" ON public.ai_media_library;
DROP POLICY IF EXISTS "admin_update_media" ON public.ai_media_library;

-- Clean consolidated set of policies

-- Anon: read only active items (product display)
CREATE POLICY "Anon can read active media library items"
  ON public.ai_media_library FOR SELECT
  TO anon
  USING (is_active = true);

-- Admin: full CRUD
CREATE POLICY "Admins can read ai_media_library"
  ON public.ai_media_library FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert ai_media_library"
  ON public.ai_media_library FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update ai_media_library"
  ON public.ai_media_library FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete ai_media_library"
  ON public.ai_media_library FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Service role: full access (edge function writes)
CREATE POLICY "Service role full access to ai_media_library"
  ON public.ai_media_library FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- Also fix media_deleted_files — same pattern of conflicting policies
-- ============================================================
DROP POLICY IF EXISTS "Admin insert deleted files" ON public.media_deleted_files;
DROP POLICY IF EXISTS "Allow admins to insert deleted files" ON public.media_deleted_files;
DROP POLICY IF EXISTS "Allow authenticated insert media_deleted_files" ON public.media_deleted_files;
DROP POLICY IF EXISTS "Authenticated users can insert deleted file records" ON public.media_deleted_files;
DROP POLICY IF EXISTS "Authenticated users can read deleted file records" ON public.media_deleted_files;
DROP POLICY IF EXISTS "admin_insert_deleted_files" ON public.media_deleted_files;
DROP POLICY IF EXISTS "admin_read_deleted_files" ON public.media_deleted_files;

CREATE POLICY "Admins can read media_deleted_files"
  ON public.media_deleted_files FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can insert media_deleted_files"
  ON public.media_deleted_files FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Service role full access to media_deleted_files"
  ON public.media_deleted_files FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
