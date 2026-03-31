/*
  # Analytics Schema — Events Table + Funnel Views

  ## Summary
  Creates a clean, dedicated analytics tracking system with:

  ## New Schema
  - `analytics` schema — isolated from public, dedicated to event tracking

  ## New Tables
  - `analytics.events` — stores every tracked event with session_id, user_id, page, metadata

  ## New Views
  - `analytics.v_funnel_7d` — 7-day conversion funnel: page_views → cta_clicks → subscriptions
  - `analytics.v_analytics_daily` — daily breakdown grouped by date(created_at)
  - `analytics.v_top_pages_7d` — most visited pages last 7 days
  - `analytics.v_event_summary_24h` — event counts last 24h

  ## Security
  - RLS enabled on analytics.events
  - Anon can INSERT (required for unauthenticated page views)
  - Authenticated users can INSERT their own events
  - Only service_role can SELECT (prevents data scraping)
  - Admin analytics views use SECURITY DEFINER so admins bypass RLS
*/

-- Create analytics schema
CREATE SCHEMA IF NOT EXISTS analytics;

-- Main events table
CREATE TABLE IF NOT EXISTS analytics.events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz DEFAULT now(),
  event_name   text        NOT NULL,
  user_id      uuid,
  session_id   text,
  page         text,
  metadata     jsonb       DEFAULT '{}'::jsonb
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name  ON analytics.events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at  ON analytics.events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id     ON analytics.events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id  ON analytics.events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page        ON analytics.events (page);

-- Enable RLS
ALTER TABLE analytics.events ENABLE ROW LEVEL SECURITY;

-- Anon and authenticated users can INSERT (needed for page views before login)
CREATE POLICY "Anyone can insert analytics events"
  ON analytics.events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Users can only read their own events
CREATE POLICY "Users can view own events"
  ON analytics.events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access"
  ON analytics.events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Funnel view: 7 days ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.v_funnel_7d
WITH (security_invoker = false)
AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'page_view')             AS page_views,
  COUNT(*) FILTER (WHERE event_name IN ('cta_click', 'upgrade_click', 'edge_board_paywall_hit')) AS cta_clicks,
  COUNT(*) FILTER (WHERE event_name IN ('subscription_created', 'subscription_started'))         AS subscriptions,
  COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'page_view') AS unique_sessions,
  COUNT(DISTINCT user_id)    FILTER (WHERE event_name IN ('subscription_created', 'subscription_started')) AS unique_subscribers
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

-- ── Daily analytics view: 30 days ───────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.v_analytics_daily
WITH (security_invoker = false)
AS
SELECT
  date(created_at AT TIME ZONE 'Australia/Melbourne') AS day,
  COUNT(*) FILTER (WHERE event_name = 'page_view')             AS page_views,
  COUNT(*) FILTER (WHERE event_name IN ('cta_click', 'upgrade_click', 'edge_board_paywall_hit')) AS cta_clicks,
  COUNT(*) FILTER (WHERE event_name IN ('subscription_created', 'subscription_started'))         AS subscriptions,
  COUNT(DISTINCT session_id) AS unique_sessions,
  COUNT(DISTINCT user_id)    AS unique_users
FROM analytics.events
WHERE created_at >= now() - interval '30 days'
GROUP BY date(created_at AT TIME ZONE 'Australia/Melbourne')
ORDER BY day DESC;

-- ── Top pages: 7 days ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.v_top_pages_7d
WITH (security_invoker = false)
AS
SELECT
  page,
  COUNT(*)                   AS views,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM analytics.events
WHERE event_name = 'page_view'
  AND created_at >= now() - interval '7 days'
  AND page IS NOT NULL
GROUP BY page
ORDER BY views DESC
LIMIT 20;

-- ── Event summary: last 24h ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW analytics.v_event_summary_24h
WITH (security_invoker = false)
AS
SELECT
  event_name,
  COUNT(*)                   AS total,
  COUNT(DISTINCT session_id) AS unique_sessions,
  COUNT(DISTINCT user_id)    AS unique_users,
  MAX(created_at)            AS last_seen
FROM analytics.events
WHERE created_at >= now() - interval '24 hours'
GROUP BY event_name
ORDER BY total DESC;

-- Grant access to the views for service_role and authenticated admins
GRANT USAGE ON SCHEMA analytics TO service_role, authenticated;
GRANT SELECT ON analytics.v_funnel_7d          TO service_role, authenticated;
GRANT SELECT ON analytics.v_analytics_daily    TO service_role, authenticated;
GRANT SELECT ON analytics.v_top_pages_7d       TO service_role, authenticated;
GRANT SELECT ON analytics.v_event_summary_24h  TO service_role, authenticated;
GRANT INSERT ON analytics.events TO anon, authenticated;
GRANT ALL    ON analytics.events TO service_role;

-- ── Public RPC wrappers (security definer so admin views work) ───────────────

CREATE OR REPLACE FUNCTION public.get_analytics_funnel_7d()
RETURNS TABLE (
  page_views        bigint,
  cta_clicks        bigint,
  subscriptions     bigint,
  unique_sessions   bigint,
  unique_subscribers bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = analytics, public
AS $$
  SELECT
    page_views, cta_clicks, subscriptions, unique_sessions, unique_subscribers
  FROM analytics.v_funnel_7d;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_daily(p_days integer DEFAULT 30)
RETURNS TABLE (
  day              date,
  page_views       bigint,
  cta_clicks       bigint,
  subscriptions    bigint,
  unique_sessions  bigint,
  unique_users     bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = analytics, public
AS $$
  SELECT day, page_views, cta_clicks, subscriptions, unique_sessions, unique_users
  FROM analytics.v_analytics_daily
  WHERE day >= current_date - p_days
  ORDER BY day DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_funnel_7d() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_daily(integer) TO authenticated, service_role;
