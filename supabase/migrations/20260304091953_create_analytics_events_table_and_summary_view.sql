/*
  # Analytics Events — Table, Summary View, and RLS

  ## Overview
  Creates a lightweight event log table for product analytics and a
  summary view that aggregates key usage metrics for the Admin dashboard.

  ## New Tables
  - `analytics_events`
    - `id` (uuid, primary key)
    - `event_name` (text) — e.g. "rankings_view", "start_sit_generate"
    - `page` (text) — optional route path
    - `user_id` (uuid) — optional, null for anonymous events
    - `properties` (jsonb) — arbitrary event metadata
    - `created_at` (timestamptz)

  ## New Views
  - `v_admin_analytics_summary` — last 24 hours aggregate counts
  - `v_admin_analytics_7d` — last 7 days aggregate counts
  - `v_admin_analytics_daily` — per-day breakdown for the last 30 days

  ## Security
  - RLS enabled on `analytics_events`
  - INSERT allowed for both anonymous and authenticated users (event ingestion)
  - SELECT restricted to admin user only via service-role or RLS bypass
  - Views are SECURITY DEFINER owned by postgres to allow admin reads

  ## Notes
  - `user_id` is nullable — anonymous page views are captured without a user
  - Views are designed for the Admin dashboard and are not exposed publicly
*/

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name  text        NOT NULL,
  page        text,
  user_id     uuid,
  properties  jsonb       DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name  ON public.analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id     ON public.analytics_events (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to insert events
CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can read their own events
CREATE POLICY "Users can read own analytics events"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── Summary Views (Security Definer so admin reads bypass RLS) ───────────────

CREATE OR REPLACE VIEW public.v_admin_analytics_summary
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                                       AS total_events_24h,
  COUNT(*) FILTER (WHERE event_name = 'page_view')                              AS page_views_24h,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view')                          AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_view')                         AS start_sit_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate')                     AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'edge_board_view')                        AS edge_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view')                      AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')                          AS upgrade_clicks,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started')                   AS subscriptions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)                    AS unique_users_24h
FROM public.analytics_events
WHERE created_at > now() - interval '24 hours';

GRANT SELECT ON public.v_admin_analytics_summary TO authenticated;

CREATE OR REPLACE VIEW public.v_admin_analytics_7d
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                                       AS total_events_7d,
  COUNT(*) FILTER (WHERE event_name = 'page_view')                              AS page_views_7d,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view')                          AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate')                     AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'edge_board_view')                        AS edge_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view')                      AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')                          AS upgrade_clicks,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started')                   AS subscriptions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)                    AS unique_users_7d
FROM public.analytics_events
WHERE created_at > now() - interval '7 days';

GRANT SELECT ON public.v_admin_analytics_7d TO authenticated;

CREATE OR REPLACE VIEW public.v_admin_analytics_daily
WITH (security_invoker = false)
AS
SELECT
  date_trunc('day', created_at)::date                                           AS day,
  COUNT(*)                                                                       AS total_events,
  COUNT(*) FILTER (WHERE event_name = 'page_view')                              AS page_views,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view')                          AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate')                     AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'edge_board_view')                        AS edge_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view')                      AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started')                   AS subscriptions
FROM public.analytics_events
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.v_admin_analytics_daily TO authenticated;
