/*
  # Create weekly_content_plans table

  1. New Tables
    - `marketing.weekly_content_plans`
      - `id` (uuid, primary key)
      - `week_key` (text) — e.g. "2026-W13", unique identifier for the week
      - `generated_at` (timestamptz)
      - `plan_json` (jsonb) — full 7-day / 21-post plan from AI
      - `player_snapshot` (jsonb) — top 50 player data used for generation
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled, admin-only access via profiles.is_admin
*/

CREATE TABLE IF NOT EXISTS marketing.weekly_content_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key         text NOT NULL,
  generated_at     timestamptz DEFAULT now(),
  plan_json        jsonb NOT NULL DEFAULT '[]',
  player_snapshot  jsonb NOT NULL DEFAULT '[]',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_content_plans_week_key_idx
  ON marketing.weekly_content_plans (week_key);

ALTER TABLE marketing.weekly_content_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select weekly content plans"
  ON marketing.weekly_content_plans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert weekly content plans"
  ON marketing.weekly_content_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update weekly content plans"
  ON marketing.weekly_content_plans FOR UPDATE
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

CREATE OR REPLACE FUNCTION marketing.set_weekly_content_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_weekly_content_plans_updated_at
  BEFORE UPDATE ON marketing.weekly_content_plans
  FOR EACH ROW EXECUTE FUNCTION marketing.set_weekly_content_plans_updated_at();
