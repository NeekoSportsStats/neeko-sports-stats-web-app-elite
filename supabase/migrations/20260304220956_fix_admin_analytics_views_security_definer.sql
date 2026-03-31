/*
  # Fix admin analytics views — SECURITY DEFINER + RLS bypass

  ## Problem
  The `admin` schema views query `public.analytics_events` which has RLS enabled.
  The existing SELECT policy only allows users to read their own rows
  (`auth.uid() = user_id`), so aggregate views return empty results or 406 errors
  because PostgREST filters each row through the caller's RLS context.

  ## Solution
  1. Drop and recreate all 8 admin analytics views as SECURITY DEFINER so they
     run as the postgres (superuser) role and bypass RLS.
  2. Re-grant SELECT on those views to `authenticated` so PostgREST exposes them.

  ## Views recreated
  - admin.v_unique_visitors_24h
  - admin.v_live_users
  - admin.v_mau
  - admin.v_conversion_funnel_30d
  - admin.v_market_watch_usage_7d
  - admin.v_top_pages_7d
  - admin.v_unique_visitors_daily
  - admin.v_analytics_daily

  ## Security note
  These views are in the `admin` schema and the frontend only calls them from the
  hardcoded admin user check (ADMIN_USER_ID). The views themselves expose only
  aggregate counts — no PII rows are ever returned.
*/

-- ── Drop existing views ────────────────────────────────────────────────────────

DROP VIEW IF EXISTS admin.v_unique_visitors_24h;
DROP VIEW IF EXISTS admin.v_live_users;
DROP VIEW IF EXISTS admin.v_mau;
DROP VIEW IF EXISTS admin.v_conversion_funnel_30d;
DROP VIEW IF EXISTS admin.v_market_watch_usage_7d;
DROP VIEW IF EXISTS admin.v_top_pages_7d;
DROP VIEW IF EXISTS admin.v_unique_visitors_daily;
DROP VIEW IF EXISTS admin.v_analytics_daily;

-- ── Recreate as SECURITY DEFINER (owned by postgres, bypasses RLS) ─────────────

CREATE OR REPLACE VIEW admin.v_unique_visitors_24h
WITH (security_invoker = false)
AS
 SELECT count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS unique_visitors,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '24 hours');

ALTER VIEW admin.v_unique_visitors_24h OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_live_users
WITH (security_invoker = false)
AS
 SELECT count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS live_users
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '5 minutes');

ALTER VIEW admin.v_live_users OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_mau
WITH (security_invoker = false)
AS
 SELECT count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS mau
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '30 days');

ALTER VIEW admin.v_mau OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_conversion_funnel_30d
WITH (security_invoker = false)
AS
 SELECT count(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click') AS upgrade_click_users,
    count(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started') AS subscription_started_users,
    round(
        CASE
            WHEN count(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click') = 0 THEN 0::numeric
            ELSE count(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started')::numeric
               / count(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click')::numeric * 100
        END, 1) AS conversion_rate
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '30 days');

ALTER VIEW admin.v_conversion_funnel_30d OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_market_watch_usage_7d
WITH (security_invoker = false)
AS
 SELECT count(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
    count(*) FILTER (WHERE event_name = 'compare_open') AS compare_runs,
    count(*) FILTER (WHERE event_name = 'best_trade_click') AS best_trade_clicks,
    count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text))
        FILTER (WHERE event_name = ANY (ARRAY['market_watch_view','compare_open','best_trade_click'])) AS unique_users
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '7 days');

ALTER VIEW admin.v_market_watch_usage_7d OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_top_pages_7d
WITH (security_invoker = false)
AS
 SELECT COALESCE(page, '/') AS path,
    count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS visitors
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '7 days')
    AND event_name = 'page_view'
  GROUP BY COALESCE(page, '/')
  ORDER BY count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) DESC;

ALTER VIEW admin.v_top_pages_7d OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_unique_visitors_daily
WITH (security_invoker = false)
AS
 SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
    count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS visitors,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '30 days')
  GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date
  ORDER BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date DESC;

ALTER VIEW admin.v_unique_visitors_daily OWNER TO postgres;

-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_analytics_daily
WITH (security_invoker = false)
AS
 SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
    count(DISTINCT COALESCE(user_id::text, properties ->> 'session_id', id::text)) AS visitors,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS dau,
    count(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
    count(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
    count(*) FILTER (WHERE event_name = 'rankings_view') AS rankings_views,
    count(*) FILTER (WHERE event_name = 'upgrade_click') AS upgrade_clicks,
    count(*) FILTER (WHERE event_name = 'subscription_started') AS subscriptions_started
   FROM public.analytics_events
  WHERE created_at > (now() - INTERVAL '30 days')
  GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date
  ORDER BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date DESC;

ALTER VIEW admin.v_analytics_daily OWNER TO postgres;

-- ── Re-grant access ────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA admin TO authenticated;

GRANT SELECT ON
  admin.v_unique_visitors_24h,
  admin.v_live_users,
  admin.v_mau,
  admin.v_conversion_funnel_30d,
  admin.v_market_watch_usage_7d,
  admin.v_top_pages_7d,
  admin.v_unique_visitors_daily,
  admin.v_analytics_daily
TO authenticated;
