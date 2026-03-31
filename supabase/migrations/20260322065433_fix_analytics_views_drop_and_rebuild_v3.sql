/*
  # Fix Analytics Views — Drop and Rebuild from analytics.events

  ## Problem
  All admin/public analytics views contain hardcoded zeros or stub data.
  The analytics schema views already correctly query analytics.events.
  The admin and public schema views need to be dropped and rebuilt.

  ## Strategy
  DROP each view individually then recreate, since CREATE OR REPLACE
  cannot change column counts or names on existing views.

  ## Views Rebuilt
  ### Admin schema (drop + recreate)
  - v_analytics_daily, v_unique_visitors_24h, v_live_users, v_mau
  - v_top_pages_7d, v_conversion_funnel_30d, v_market_watch_usage_7d
  - v_signups_7d (keep querying auth.users, just keep existing column order)
  - v_top_viewed_players_7d, v_utm_traffic_sources_7d

  ### Public schema (drop + recreate)
  - v_admin_analytics_summary, v_admin_analytics_7d, v_admin_daily_usage
  - v_admin_feature_usage, v_admin_conversion_funnel, v_admin_ai_usage
  - v_admin_start_sit_power_users, v_admin_dau, v_admin_wau, v_admin_realtime_users
*/

-- ============================================================
-- ADMIN SCHEMA: DROP THEN RECREATE
-- ============================================================

DROP VIEW IF EXISTS admin.v_analytics_daily;
CREATE VIEW admin.v_analytics_daily AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(DISTINCT session_id) AS visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS dau,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view')     AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')     AS upgrade_clicks,
  0::bigint AS subscriptions_started
FROM analytics.events
GROUP BY date_trunc('day', created_at)::date
ORDER BY day DESC;

DROP VIEW IF EXISTS admin.v_unique_visitors_24h;
CREATE VIEW admin.v_unique_visitors_24h AS
SELECT
  COUNT(DISTINCT session_id) AS unique_visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users
FROM analytics.events
WHERE created_at >= now() - interval '24 hours';

DROP VIEW IF EXISTS admin.v_live_users;
CREATE VIEW admin.v_live_users AS
SELECT
  COUNT(DISTINCT session_id) AS live_users
FROM analytics.events
WHERE created_at >= now() - interval '5 minutes';

DROP VIEW IF EXISTS admin.v_mau;
CREATE VIEW admin.v_mau AS
SELECT
  COUNT(DISTINCT user_id) AS mau
FROM analytics.events
WHERE created_at >= now() - interval '30 days'
  AND user_id IS NOT NULL;

DROP VIEW IF EXISTS admin.v_top_pages_7d;
CREATE VIEW admin.v_top_pages_7d AS
SELECT
  page AS path,
  COUNT(*) AS visitors
FROM analytics.events
WHERE event_name = 'page_view'
  AND created_at >= now() - interval '7 days'
GROUP BY page
ORDER BY visitors DESC
LIMIT 20;

DROP VIEW IF EXISTS admin.v_conversion_funnel_30d;
CREATE VIEW admin.v_conversion_funnel_30d AS
SELECT
  COUNT(DISTINCT CASE WHEN event_name = 'upgrade_click' THEN user_id END) AS upgrade_click_users,
  (SELECT COUNT(*) FROM stripe_subscriptions
   WHERE status = 'active'
     AND created_at >= now() - interval '30 days') AS subscription_started_users,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN event_name = 'upgrade_click' THEN user_id END) = 0 THEN 0.0
    ELSE ROUND(
      (SELECT COUNT(*)::numeric FROM stripe_subscriptions WHERE status = 'active' AND created_at >= now() - interval '30 days')
      / NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'upgrade_click' THEN user_id END), 0)::numeric * 100,
      1
    )
  END AS conversion_rate
FROM analytics.events
WHERE created_at >= now() - interval '30 days';

DROP VIEW IF EXISTS admin.v_market_watch_usage_7d;
CREATE VIEW admin.v_market_watch_usage_7d AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view')             AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_compare_run')      AS compare_runs,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_best_trade_click') AS best_trade_clicks,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)           AS unique_users
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

DROP VIEW IF EXISTS admin.v_signups_7d;
CREATE VIEW admin.v_signups_7d AS
SELECT
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')   AS signups_7d,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS signups_24h,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')  AS signups_30d,
  COUNT(*)                                                           AS total_signups
FROM auth.users;

DROP VIEW IF EXISTS admin.v_top_viewed_players_7d;
CREATE VIEW admin.v_top_viewed_players_7d AS
SELECT
  COALESCE(metadata->>'player_name', 'Unknown') AS player_name,
  COUNT(DISTINCT user_id) AS unique_viewers,
  COUNT(*) AS views
FROM analytics.events
WHERE event_name IN ('player_view', 'rankings_view', 'start_sit_view')
  AND created_at >= now() - interval '7 days'
  AND metadata->>'player_name' IS NOT NULL
GROUP BY metadata->>'player_name'
ORDER BY views DESC
LIMIT 10;

DROP VIEW IF EXISTS admin.v_utm_traffic_sources_7d;
CREATE VIEW admin.v_utm_traffic_sources_7d AS
SELECT
  COALESCE(metadata->>'utm_source', 'direct') AS source,
  COUNT(DISTINCT session_id) AS visitors,
  0::bigint AS signups
FROM analytics.events
WHERE event_name = 'page_view'
  AND created_at >= now() - interval '7 days'
GROUP BY COALESCE(metadata->>'utm_source', 'direct')
ORDER BY visitors DESC;

-- ============================================================
-- PUBLIC SCHEMA: DROP THEN RECREATE
-- ============================================================

DROP VIEW IF EXISTS public.v_admin_analytics_summary;
CREATE VIEW public.v_admin_analytics_summary AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'page_view' AND created_at >= now() - interval '24 hours') AS page_views_24h,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view' AND created_at >= now() - interval '24 hours') AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_view' AND created_at >= now() - interval '24 hours') AS start_sit_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate' AND created_at >= now() - interval '24 hours') AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'edge_board_view' AND created_at >= now() - interval '24 hours') AS edge_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view' AND created_at >= now() - interval '24 hours') AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click' AND created_at >= now() - interval '24 hours') AS upgrade_clicks,
  (SELECT COUNT(*) FROM stripe_subscriptions WHERE status = 'active') AS subscriptions,
  COUNT(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '24 hours') AS unique_users_24h
FROM analytics.events;

DROP VIEW IF EXISTS public.v_admin_analytics_7d;
CREATE VIEW public.v_admin_analytics_7d AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views_7d,
  COUNT(*) FILTER (WHERE event_name = 'rankings_view') AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'edge_board_view') AS edge_views,
  COUNT(*) FILTER (WHERE event_name = 'market_watch_view') AS market_watch_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click') AS upgrade_clicks,
  (SELECT COUNT(*) FROM stripe_subscriptions WHERE status = 'active') AS subscriptions,
  COUNT(DISTINCT session_id) AS unique_users_7d
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

DROP VIEW IF EXISTS public.v_admin_daily_usage;
CREATE VIEW public.v_admin_daily_usage AS
SELECT
  d.day,
  COUNT(e.*) FILTER (WHERE e.event_name = 'page_view')        AS page_views,
  COUNT(e.*) FILTER (WHERE e.event_name = 'start_sit_generate') AS start_sit_runs,
  COUNT(e.*) FILTER (WHERE e.event_name = 'upgrade_click')    AS upgrade_clicks,
  (SELECT COUNT(*) FROM stripe_subscriptions s
   WHERE s.status = 'active' AND s.created_at::date = d.day) AS subscriptions,
  COUNT(DISTINCT e.session_id) AS unique_users
FROM (
  SELECT (generate_series(
    (CURRENT_DATE - interval '29 days')::timestamp,
    CURRENT_DATE::timestamp,
    '1 day'::interval
  ))::date AS day
) d
LEFT JOIN analytics.events e ON e.created_at::date = d.day
GROUP BY d.day
ORDER BY d.day;

DROP VIEW IF EXISTS public.v_admin_feature_usage;
CREATE VIEW public.v_admin_feature_usage AS
SELECT
  event_name,
  COUNT(*) AS usage_count
FROM analytics.events
WHERE created_at >= now() - interval '7 days'
  AND event_name IN (
    'rankings_view','start_sit_generate','edge_board_view',
    'market_watch_view','upgrade_click','start_sit_view',
    'edge_board_paywall_hit','market_watch_best_trade_click',
    'cta_click','page_view'
  )
GROUP BY event_name
ORDER BY usage_count DESC;

DROP VIEW IF EXISTS public.v_admin_conversion_funnel;
CREATE VIEW public.v_admin_conversion_funnel AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'rankings_view') AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_view') AS start_sit_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')  AS upgrade_clicks,
  (SELECT COUNT(*) FROM stripe_subscriptions WHERE status = 'active') AS subscriptions
FROM analytics.events
WHERE created_at >= now() - interval '30 days';

DROP VIEW IF EXISTS public.v_admin_ai_usage;
CREATE VIEW public.v_admin_ai_usage AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  (SELECT COUNT(*) FROM ai.player_ai_analysis) AS player_ai_runs,
  0::bigint AS team_ai_runs
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

DROP VIEW IF EXISTS public.v_admin_start_sit_power_users;
CREATE VIEW public.v_admin_start_sit_power_users AS
SELECT
  user_id::text AS user_id,
  COUNT(*) AS start_sit_runs
FROM analytics.events
WHERE event_name = 'start_sit_generate'
  AND user_id IS NOT NULL
  AND created_at >= now() - interval '30 days'
GROUP BY user_id
ORDER BY start_sit_runs DESC
LIMIT 20;

DROP VIEW IF EXISTS public.v_admin_dau;
CREATE VIEW public.v_admin_dau AS
SELECT
  COUNT(DISTINCT session_id) AS daily_active_users
FROM analytics.events
WHERE created_at >= now() - interval '24 hours';

DROP VIEW IF EXISTS public.v_admin_wau;
CREATE VIEW public.v_admin_wau AS
SELECT
  COUNT(DISTINCT session_id) AS weekly_active_users
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

DROP VIEW IF EXISTS public.v_admin_realtime_users;
CREATE VIEW public.v_admin_realtime_users AS
SELECT
  COUNT(DISTINCT session_id) AS active_users_last_5_minutes
FROM analytics.events
WHERE created_at >= now() - interval '5 minutes';

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT ON admin.v_analytics_daily           TO service_role, authenticated;
GRANT SELECT ON admin.v_unique_visitors_24h        TO service_role, authenticated;
GRANT SELECT ON admin.v_live_users                 TO service_role, authenticated;
GRANT SELECT ON admin.v_mau                        TO service_role, authenticated;
GRANT SELECT ON admin.v_top_pages_7d               TO service_role, authenticated;
GRANT SELECT ON admin.v_conversion_funnel_30d      TO service_role, authenticated;
GRANT SELECT ON admin.v_market_watch_usage_7d      TO service_role, authenticated;
GRANT SELECT ON admin.v_signups_7d                 TO service_role, authenticated;
GRANT SELECT ON admin.v_top_viewed_players_7d      TO service_role, authenticated;
GRANT SELECT ON admin.v_utm_traffic_sources_7d     TO service_role, authenticated;
GRANT SELECT ON public.v_admin_analytics_summary   TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_analytics_7d        TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_daily_usage         TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_feature_usage       TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_conversion_funnel   TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_ai_usage            TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_start_sit_power_users TO service_role, authenticated;
GRANT SELECT ON public.v_admin_dau                 TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_wau                 TO service_role, authenticated, anon;
GRANT SELECT ON public.v_admin_realtime_users      TO service_role, authenticated, anon;
