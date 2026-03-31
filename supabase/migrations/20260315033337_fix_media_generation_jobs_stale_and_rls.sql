/*
  # Fix Media Generation Jobs: Stale Job Reset + RLS Update Policy

  ## Summary
  Two issues fixed in this migration:

  1. **Stale running jobs** — One job has been stuck in "running" status since 2026-03-05
     (over 10 days ago). Any job still "running" after 2 hours is reset to "failed" so
     the admin can retry.

  2. **Missing UPDATE policy** — The `media_generation_jobs` table had no UPDATE policy,
     meaning the edge function (`generate-ai-image`, `generate-category-media`) could not
     write progress back (generated_count, status, completed_at). This caused jobs to
     appear permanently "running" in the UI. Policy added for authenticated users.

  ## Changes
  - Reset all jobs stuck in "running" for >2 hours to "failed"
  - Add UPDATE RLS policy on media_generation_jobs for authenticated users
*/

-- 1. Reset stale running jobs (stuck > 2 hours) to failed
UPDATE media_generation_jobs
SET
  status        = 'failed',
  error_message = 'Job timed out — reset by system. Please retry.',
  completed_at  = now()
WHERE
  status     = 'running'
  AND started_at < now() - INTERVAL '2 hours';

-- 2. Add UPDATE policy so edge functions can write progress back
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'media_generation_jobs'
      AND policyname = 'Authenticated users can update media generation jobs'
      AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Authenticated users can update media generation jobs"
      ON media_generation_jobs
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Service role also needs to update (for edge functions using service key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'media_generation_jobs'
      AND policyname = 'Service role can update media generation jobs'
  ) THEN
    CREATE POLICY "Service role can update media generation jobs"
      ON media_generation_jobs
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Service role SELECT for edge functions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'media_generation_jobs'
      AND policyname = 'Service role can read media generation jobs'
  ) THEN
    CREATE POLICY "Service role can read media generation jobs"
      ON media_generation_jobs
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- 5. Service role INSERT for edge functions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'media_generation_jobs'
      AND policyname = 'Service role can insert media generation jobs'
  ) THEN
    CREATE POLICY "Service role can insert media generation jobs"
      ON media_generation_jobs
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
