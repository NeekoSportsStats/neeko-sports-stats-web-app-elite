
/*
  # Create admin schema with Visitor Intelligence views

  ## Summary
  The Admin panel's "Visitor Intelligence" section queries a separate `admin` schema
  using `supabase.schema("admin")`. This schema did not exist, causing 406 errors
  for all 8 views in the `fetchV2Metrics` function.

  ## Changes

  ### New Schema
  - `admin` — dedicated schema for admin-only analytics views

  ### New Views (in admin schema)
  1. `v_unique_visitors_24h` — unique visitor + logged-in user counts for last 24h
  2. `v_live_users` — active sessions in the last 5 minutes
  3. `v_mau` — monthly active users (30 day window)
  4. `v_top_pages_7d` — top pages by unique visitor count, last 7 days
  5. `v_conversion_funnel_30d` — upgrade click → subscription conversion rate, last 30 days
  6. `v_market_watch_usage_7d` — market watch feature usage breakdown, last 7 days
  7. `v_unique_visitors_daily` — daily unique visitor breakdown for last 30 days
  8. `v_analytics_daily` — full daily analytics rollup for last 30 days

  ### Security
  - All views are SECURITY DEFINER owned by postgres to allow anon/authenticated access
  - Explicit GRANT SELECT given to anon and authenticated roles on the admin schema
*/

CREATE SCHEMA IF NOT EXISTS admin;

-- 1. Unique Visitors 24h
CREATE OR REPLACE VIEW admin.v_unique_visitors_24h
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS unique_visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users
FROM public.analytics_events
WHERE created_at > now() - interval '24 hours';

-- 2. Live Users (last 5 minutes)
CREATE OR REPLACE VIEW admin.v_live_users
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS live_users
FROM public.analytics_events
WHERE created_at > now() - interval '5 minutes';

-- 3. MAU (Monthly Active Users - 30 days)
CREATE OR REPLACE VIEW admin.v_mau
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS mau
FROM public.analytics_events
WHERE created_at > now() - interval '30 days';

-- 4. Top Pages (7 days)
CREATE OR REPLACE VIEW admin.v_top_pages_7d
WITH (security_invoker = false)
AS
SELECT
  COALESCE(page, '/') AS path,
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS visitors
FROM public.analytics_events
WHERE created_at > now() - interval '7 days'
  AND event_name = 'page_view'
GROUP BY COALESCE(page, '/')
ORDER BY visitors DESC;

-- 5. Conversion Funnel 30 days
CREATE OR REPLACE VIEW admin.v_conversion_funnel_30d
WITH (security_invoker = false)
AS
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click') AS upgrade_click_users,
  COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started') AS subscription_started_users,
  ROUND(
    CASE
      WHEN COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click') = 0 THEN 0
      ELSE (
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started')::numeric
        / COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'upgrade_click')::numeric
        * 100
      )
    END,
    1
  ) AS conversion_rate
FROM public.analytics_events
WHERE created_at > now() - interval '30 days';

-- 6. Market Watch Usage 7 days
CREATE OR REPLACE VIEW admin.v_market_watch_usage_7d
WITH (security_invoker = false)
AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'compare_open') AS compare_runs,
  COUNT(*) FILTER (WHERE event_name = 'best_trade_click') AS best_trade_clicks,
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text))
    FILTER (WHERE event_name IN ('market_watch_view', 'compare_open', 'best_trade_click')) AS unique_users
FROM public.analytics_events
WHERE created_at > now() - interval '7 days';

-- 7. Unique Visitors Daily (last 30 days)
CREATE OR REPLACE VIEW admin.v_unique_visitors_daily
WITH (security_invoker = false)
AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in
FROM public.analytics_events
WHERE created_at > now() - interval '30 days'
GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- 8. Full Analytics Daily (last 30 days)
CREATE OR REPLACE VIEW admin.v_analytics_daily
WITH (security_invoker = false)
AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(DISTINCT COALESCE(user_id::text, properties->>'session_id', id::text)) AS visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS dau,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view') AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click') AS upgrade_clicks,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started') AS subscriptions_started
FROM public.analytics_events
WHERE created_at > now() - interval '30 days'
GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Grant usage on the admin schema to API roles
GRANT USAGE ON SCHEMA admin TO anon;
GRANT USAGE ON SCHEMA admin TO authenticated;

-- Grant select on all views in admin schema
GRANT SELECT ON ALL TABLES IN SCHEMA admin TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA admin TO authenticated;

-- Also ensure public analytics views have proper grants
GRANT SELECT ON public.v_admin_analytics_summary TO anon;
GRANT SELECT ON public.v_admin_analytics_summary TO authenticated;
GRANT SELECT ON public.v_admin_analytics_7d TO anon;
GRANT SELECT ON public.v_admin_analytics_7d TO authenticated;
GRANT SELECT ON public.v_admin_dau TO anon;
GRANT SELECT ON public.v_admin_dau TO authenticated;
GRANT SELECT ON public.v_admin_wau TO anon;
GRANT SELECT ON public.v_admin_wau TO authenticated;
GRANT SELECT ON public.v_admin_realtime_users TO anon;
GRANT SELECT ON public.v_admin_realtime_users TO authenticated;
GRANT SELECT ON public.v_admin_subscription_metrics TO anon;
GRANT SELECT ON public.v_admin_subscription_metrics TO authenticated;
GRANT SELECT ON public.v_admin_feature_usage TO anon;
GRANT SELECT ON public.v_admin_feature_usage TO authenticated;
GRANT SELECT ON public.v_admin_conversion_funnel TO anon;
GRANT SELECT ON public.v_admin_conversion_funnel TO authenticated;
GRANT SELECT ON public.v_admin_ai_usage TO anon;
GRANT SELECT ON public.v_admin_ai_usage TO authenticated;
GRANT SELECT ON public.v_admin_start_sit_power_users TO anon;
GRANT SELECT ON public.v_admin_start_sit_power_users TO authenticated;
GRANT SELECT ON public.v_admin_daily_usage TO anon;
GRANT SELECT ON public.v_admin_daily_usage TO authenticated;
GRANT SELECT ON public.v_data_integrity_checks TO anon;
GRANT SELECT ON public.v_data_integrity_checks TO authenticated;
GRANT SELECT ON public.v_model_performance TO anon;
GRANT SELECT ON public.v_model_performance TO authenticated;
GRANT SELECT ON public.v_start_sit_calibration TO anon;
GRANT SELECT ON public.v_start_sit_calibration TO authenticated;
GRANT SELECT ON public.v_pipeline_health TO anon;
GRANT SELECT ON public.v_pipeline_health TO authenticated;
GRANT SELECT ON public.v_ingest_health TO anon;
GRANT SELECT ON public.v_ingest_health TO authenticated;
GRANT SELECT ON public.v_canonical_health TO anon;
GRANT SELECT ON public.v_canonical_health TO authenticated;
GRANT SELECT ON public.v_ai_generation_health TO anon;
GRANT SELECT ON public.v_ai_generation_health TO authenticated;
GRANT SELECT ON public.v_start_sit_cache_health TO anon;
GRANT SELECT ON public.v_start_sit_cache_health TO authenticated;
GRANT SELECT ON public.v_pipeline_job_history TO anon;
GRANT SELECT ON public.v_pipeline_job_history TO authenticated;
