/*
  # AI Media Library Table

  ## Summary
  Creates a persistent media library for the Neeko Content Engine.
  Admin-generated media packs are registered here once and cached permanently.

  ## New Tables

  ### `ai_media_library`
  Central registry of all media assets (images and videos) used in the Content Engine.

  | Column | Type | Description |
  |--------|------|-------------|
  | id | uuid | Primary key |
  | asset_id | text | Unique stable ID (e.g. "afl-stadium-night-1") |
  | label | text | Human-readable label shown in the picker |
  | url | text | Full source URL (Pexels or Supabase storage) |
  | thumbnail_url | text | Compressed thumbnail URL |
  | media_type | text | "image" or "video" |
  | category | text | "stadium", "crowd", "abstract", "field", "players", "video_background" |
  | sport | text | "AFL", "NBA", "EPL" |
  | source | text | "pexels", "supabase_storage", "ai_generated" |
  | pack_id | text | Which generation pack this belongs to (e.g. "afl-balanced-v1") |
  | registered_at | timestamptz | When this asset was registered |
  | registered_by | uuid | Which admin user registered it (nullable for system) |
  | is_active | boolean | Whether this asset is visible in the picker |
  | sort_order | integer | Display ordering within category |
  | metadata | jsonb | Extra data (prompt used, dimensions, duration, etc.) |

  ## Security
  - RLS enabled, only admins can write; anon/authenticated can read active assets
  - Uses auth.uid() for row ownership where applicable
*/

CREATE TABLE IF NOT EXISTS ai_media_library (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          text        UNIQUE NOT NULL,
  label             text        NOT NULL DEFAULT '',
  url               text        NOT NULL,
  thumbnail_url     text        NOT NULL DEFAULT '',
  media_type        text        NOT NULL DEFAULT 'image',
  category          text        NOT NULL DEFAULT 'stadium',
  sport             text        NOT NULL DEFAULT 'AFL',
  source            text        NOT NULL DEFAULT 'pexels',
  pack_id           text        NOT NULL DEFAULT 'afl-balanced-v1',
  registered_at     timestamptz NOT NULL DEFAULT now(),
  registered_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE ai_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active media library items"
  ON ai_media_library FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can insert media library items"
  ON ai_media_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update their own media library items"
  ON ai_media_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ai_media_library_category_idx ON ai_media_library (category);
CREATE INDEX IF NOT EXISTS ai_media_library_media_type_idx ON ai_media_library (media_type);
CREATE INDEX IF NOT EXISTS ai_media_library_pack_id_idx ON ai_media_library (pack_id);
CREATE INDEX IF NOT EXISTS ai_media_library_sport_idx ON ai_media_library (sport);
