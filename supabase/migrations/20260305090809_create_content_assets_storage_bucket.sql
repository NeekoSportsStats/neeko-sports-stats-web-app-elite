/*
  # Create content-assets Storage Bucket

  ## Summary
  Creates the `content-assets` public storage bucket used by the
  `generate-ai-image` edge function to store AI-generated images.
  The bucket was previously missing, causing StorageApiError: Bucket not found.

  ## Changes
  - Creates bucket: `content-assets` (public read)
  - Adds INSERT policy for service_role (AI image uploads)
  - Adds SELECT policy for public read access (serving images to UI)
  - Adds UPDATE policy for service_role (upsert support)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-assets',
  'content-assets',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760;

CREATE POLICY "allow service_role ai uploads"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'content-assets');

CREATE POLICY "allow public read content-assets"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'content-assets');

CREATE POLICY "allow service_role upsert content-assets"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'content-assets')
  WITH CHECK (bucket_id = 'content-assets');
