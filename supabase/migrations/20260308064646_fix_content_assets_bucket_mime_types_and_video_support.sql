/*
  # Fix content-assets bucket MIME types and video upload support

  ## Problem
  The `content-assets` storage bucket only allows image MIME types, which prevents
  video files from being uploaded. This breaks the AI Video Library feature.

  ## Changes
  - Updates the `content-assets` bucket to allow video MIME types:
    - video/mp4
    - video/webm
    - video/quicktime
    - video/ogg
  - Increases file size limit to 100MB to support video files (was 10MB)
*/

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/ogg'
  ],
  file_size_limit = 104857600
WHERE name = 'content-assets';
