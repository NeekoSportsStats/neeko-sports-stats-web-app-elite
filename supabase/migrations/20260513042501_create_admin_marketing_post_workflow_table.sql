/*
  # Create Admin Marketing Post Workflow Table

  ## Purpose
  Stores admin-managed social media post ideas derived from live Neeko stat data.
  Used exclusively by the Marketing Command Centre (/admin/marketing).

  ## New Tables
  - `afl.admin_marketing_post_workflow`
    - id: uuid primary key
    - round_number: integer (which AFL round this post targets)
    - platform: text (tiktok | instagram | reddit | twitter | facebook)
    - stat_family: text (disposals | goals | tackles | marks | fantasy | general)
    - title: text (post idea title)
    - hook: text (opening hook line)
    - caption: text (main post caption)
    - stat_bullets: jsonb (array of stat-backed bullet points)
    - cta: text (call to action)
    - hashtags: text[] (platform hashtags)
    - quality: text (high | medium)
    - status: text (workflow status — see constraint)
    - source_type: text (content_intel | rankings | market_watch | manual)
    - source_payload: jsonb (raw source data for audit trail)
    - player_ids: integer[] (player IDs referenced in this post)
    - team_names: text[] (teams referenced)
    - angle_tag: text (e.g. "disposal-profile", "goal-trend", "form-tracker")
    - private_note: text (internal notes, never shown publicly)
    - created_at: timestamptz
    - updated_at: timestamptz

  ## Security
  - RLS enabled with admin-only read/write via is_admin_user() guard
  - No public access whatsoever
*/

CREATE TABLE IF NOT EXISTS afl.admin_marketing_post_workflow (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number    integer NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'reddit', 'twitter', 'facebook', 'all')),
  stat_family     text NOT NULL DEFAULT 'general' CHECK (stat_family IN ('disposals', 'goals', 'tackles', 'marks', 'kicks', 'handballs', 'clearances', 'hitouts', 'fantasy', 'general')),
  title           text NOT NULL DEFAULT '',
  hook            text NOT NULL DEFAULT '',
  caption         text NOT NULL DEFAULT '',
  stat_bullets    jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta             text NOT NULL DEFAULT '',
  hashtags        text[] NOT NULL DEFAULT '{}',
  quality         text NOT NULL DEFAULT 'medium' CHECK (quality IN ('high', 'medium')),
  status          text NOT NULL DEFAULT 'not_checked'
                  CHECK (status IN ('not_checked', 'needs_edit', 'approved', 'posted', 'skipped', 'archived')),
  source_type     text NOT NULL DEFAULT 'content_intel'
                  CHECK (source_type IN ('content_intel', 'rankings', 'market_watch', 'manual')),
  source_payload  jsonb,
  player_ids      integer[] NOT NULL DEFAULT '{}',
  team_names      text[] NOT NULL DEFAULT '{}',
  angle_tag       text NOT NULL DEFAULT '',
  private_note    text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION afl.fn_update_marketing_workflow_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_workflow_updated_at ON afl.admin_marketing_post_workflow;
CREATE TRIGGER trg_marketing_workflow_updated_at
  BEFORE UPDATE ON afl.admin_marketing_post_workflow
  FOR EACH ROW EXECUTE FUNCTION afl.fn_update_marketing_workflow_updated_at();

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_mw_round      ON afl.admin_marketing_post_workflow (round_number DESC);
CREATE INDEX IF NOT EXISTS idx_mw_status     ON afl.admin_marketing_post_workflow (status);
CREATE INDEX IF NOT EXISTS idx_mw_platform   ON afl.admin_marketing_post_workflow (platform);
CREATE INDEX IF NOT EXISTS idx_mw_quality    ON afl.admin_marketing_post_workflow (quality);
CREATE INDEX IF NOT EXISTS idx_mw_created_at ON afl.admin_marketing_post_workflow (created_at DESC);

-- RLS
ALTER TABLE afl.admin_marketing_post_workflow ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admin can read marketing workflow"
  ON afl.admin_marketing_post_workflow FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Admin-only insert
CREATE POLICY "Admin can insert marketing workflow"
  ON afl.admin_marketing_post_workflow FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Admin-only update
CREATE POLICY "Admin can update marketing workflow"
  ON afl.admin_marketing_post_workflow FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Service role can do everything (for pipeline writes)
CREATE POLICY "Service role full access marketing workflow"
  ON afl.admin_marketing_post_workflow FOR SELECT
  TO service_role
  USING (true);

-- RPC: upsert a post workflow row (admin only)
CREATE OR REPLACE FUNCTION public.upsert_marketing_post_workflow(
  p_id            uuid DEFAULT NULL,
  p_round_number  integer DEFAULT 0,
  p_platform      text DEFAULT 'all',
  p_stat_family   text DEFAULT 'general',
  p_title         text DEFAULT '',
  p_hook          text DEFAULT '',
  p_caption       text DEFAULT '',
  p_stat_bullets  jsonb DEFAULT '[]'::jsonb,
  p_cta           text DEFAULT '',
  p_hashtags      text[] DEFAULT '{}',
  p_quality       text DEFAULT 'medium',
  p_status        text DEFAULT 'not_checked',
  p_source_type   text DEFAULT 'content_intel',
  p_source_payload jsonb DEFAULT NULL,
  p_player_ids    integer[] DEFAULT '{}',
  p_team_names    text[] DEFAULT '{}',
  p_angle_tag     text DEFAULT '',
  p_private_note  text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_admin boolean;
  v_id       uuid;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  v_id := COALESCE(p_id, gen_random_uuid());

  INSERT INTO afl.admin_marketing_post_workflow (
    id, round_number, platform, stat_family, title, hook, caption,
    stat_bullets, cta, hashtags, quality, status, source_type,
    source_payload, player_ids, team_names, angle_tag, private_note
  ) VALUES (
    v_id, p_round_number, p_platform, p_stat_family, p_title, p_hook, p_caption,
    p_stat_bullets, p_cta, p_hashtags, p_quality, p_status, p_source_type,
    p_source_payload, p_player_ids, p_team_names, p_angle_tag, p_private_note
  )
  ON CONFLICT (id) DO UPDATE SET
    round_number   = EXCLUDED.round_number,
    platform       = EXCLUDED.platform,
    stat_family    = EXCLUDED.stat_family,
    title          = EXCLUDED.title,
    hook           = EXCLUDED.hook,
    caption        = EXCLUDED.caption,
    stat_bullets   = EXCLUDED.stat_bullets,
    cta            = EXCLUDED.cta,
    hashtags       = EXCLUDED.hashtags,
    quality        = EXCLUDED.quality,
    status         = EXCLUDED.status,
    source_type    = EXCLUDED.source_type,
    source_payload = EXCLUDED.source_payload,
    player_ids     = EXCLUDED.player_ids,
    team_names     = EXCLUDED.team_names,
    angle_tag      = EXCLUDED.angle_tag,
    private_note   = EXCLUDED.private_note,
    updated_at     = now();

  RETURN v_id;
END;
$$;

-- RPC: update status only (admin only, lightweight)
CREATE OR REPLACE FUNCTION public.update_marketing_post_status(
  p_id     uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE afl.admin_marketing_post_workflow
  SET status = p_status, updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_marketing_post_workflow FROM anon;
REVOKE ALL ON FUNCTION public.update_marketing_post_status FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_marketing_post_workflow TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_marketing_post_status TO authenticated;
