/*
  # Rebuild analytics views and RPCs

  All views here read from analytics.events (now populated by logEvent) and
  from stripe_subscriptions / profiles for subscription truth.

  Event names in use (from analytics.ts track() calls):
    page_view, rankings_view, rankings_refresh_click,
    start_sit_view, start_sit_generate,
    edge_board_view, edge_board_paywall_hit, edge_board_modal_open,
    edge_board_share, edge_board_share_whatsapp, edge_board_share_twitter,
    market_watch_view, market_watch_compare_open, market_watch_compare_run,
    market_watch_best_trade_click, market_breakout_click, market_watch_refresh_click,
    upgrade_click, cta_click,
    subscription_started

  Changes:
  1. Drop and recreate public analytics views
  2. Drop and recreate admin schema analytics views
  3. Create get_analytics_funnel_7d RPC
  4. Grant permissions
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1. public.v_admin_analytics_summary  (24h window)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_analytics_summary CASCADE;
CREATE VIEW public.v_admin_analytics_summary
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE event_name = 'page_view'            AND created_at >= now() - interval '24 hours') AS page_views_24h,
  count(*) FILTER (WHERE event_name = 'rankings_view'        AND created_at >= now() - interval '24 hours') AS rankings_views,
  count(*) FILTER (WHERE event_name = 'start_sit_view'       AND created_at >= now() - interval '24 hours') AS start_sit_views,
  count(*) FILTER (WHERE event_name = 'start_sit_generate'   AND created_at >= now() - interval '24 hours') AS start_sit_runs,
  count(*) FILTER (WHERE event_name = 'edge_board_view'      AND created_at >= now() - interval '24 hours') AS edge_views,
  count(*) FILTER (WHERE event_name = 'market_watch_view'    AND created_at >= now() - interval '24 hours') AS market_watch_views,
  count(*) FILTER (WHERE event_name = 'upgrade_click'        AND created_at >= now() - interval '24 hours') AS upgrade_clicks,
  (SELECT count(*) FROM public.stripe_subscriptions WHERE status = 'active') AS subscriptions,
  count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '24 hours') AS unique_users_24h
FROM analytics.events;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. public.v_admin_analytics_7d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_analytics_7d CASCADE;
CREATE VIEW public.v_admin_analytics_7d
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE event_name = 'page_view'            AND created_at >= now() - interval '7 days') AS page_views_7d,
  count(*) FILTER (WHERE event_name = 'rankings_view'        AND created_at >= now() - interval '7 days') AS rankings_views,
  count(*) FILTER (WHERE event_name = 'start_sit_generate'   AND created_at >= now() - interval '7 days') AS start_sit_runs,
  count(*) FILTER (WHERE event_name = 'edge_board_view'      AND created_at >= now() - interval '7 days') AS edge_views,
  count(*) FILTER (WHERE event_name = 'market_watch_view'    AND created_at >= now() - interval '7 days') AS market_watch_views,
  count(*) FILTER (WHERE event_name = 'upgrade_click'        AND created_at >= now() - interval '7 days') AS upgrade_clicks,
  (SELECT count(*) FROM public.stripe_subscriptions WHERE status = 'active') AS subscriptions,
  count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '7 days') AS unique_users_7d
FROM analytics.events;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. get_analytics_funnel_7d RPC  (live funnel card)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_analytics_funnel_7d();
CREATE FUNCTION public.get_analytics_funnel_7d()
RETURNS TABLE (
  page_views          bigint,
  cta_clicks          bigint,
  subscriptions       bigint,
  unique_sessions     bigint,
  unique_subscribers  bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE event_name = 'page_view'  AND created_at >= now() - interval '7 days')                                 AS page_views,
    count(*) FILTER (WHERE event_name IN ('cta_click','upgrade_click','edge_board_paywall_hit') AND created_at >= now() - interval '7 days') AS cta_clicks,
    (SELECT count(*)::bigint FROM public.stripe_subscriptions WHERE status = 'active')                                            AS subscriptions,
    count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '7 days')                                            AS unique_sessions,
    count(DISTINCT user_id)    FILTER (WHERE user_id IS NOT NULL AND created_at >= now() - interval '7 days'
      AND user_id IN (SELECT user_id FROM public.stripe_subscriptions WHERE status = 'active'))                                   AS unique_subscribers
  FROM analytics.events;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_funnel_7d() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_funnel_7d() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. public.v_admin_feature_usage (top events by count, 7d)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_feature_usage CASCADE;
CREATE VIEW public.v_admin_feature_usage
WITH (security_invoker = false)
AS
SELECT
  event_name,
  count(*) AS usage_count
FROM analytics.events
WHERE created_at >= now() - interval '7 days'
GROUP BY event_name
ORDER BY usage_count DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. public.v_admin_conversion_funnel (7d)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_conversion_funnel CASCADE;
CREATE VIEW public.v_admin_conversion_funnel
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE event_name = 'rankings_view'      AND created_at >= now() - interval '7 days') AS rankings_views,
  count(*) FILTER (WHERE event_name = 'start_sit_view'     AND created_at >= now() - interval '7 days') AS start_sit_views,
  count(*) FILTER (WHERE event_name = 'upgrade_click'      AND created_at >= now() - interval '7 days') AS upgrade_clicks,
  (SELECT count(*) FROM public.stripe_subscriptions WHERE status = 'active')                            AS subscriptions
FROM analytics.events;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. public.v_admin_realtime_users (last 5 min)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_realtime_users CASCADE;
CREATE VIEW public.v_admin_realtime_users
WITH (security_invoker = false)
AS
SELECT
  count(DISTINCT session_id) AS active_users_last_5_minutes
FROM analytics.events
WHERE created_at >= now() - interval '5 minutes';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. public.v_admin_dau / v_admin_wau
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_dau CASCADE;
CREATE VIEW public.v_admin_dau
WITH (security_invoker = false)
AS
SELECT count(DISTINCT session_id) AS daily_active_users
FROM analytics.events
WHERE created_at >= now() - interval '24 hours';

DROP VIEW IF EXISTS public.v_admin_wau CASCADE;
CREATE VIEW public.v_admin_wau
WITH (security_invoker = false)
AS
SELECT count(DISTINCT session_id) AS weekly_active_users
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. public.v_admin_daily_usage (14d breakdown)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_daily_usage CASCADE;
CREATE VIEW public.v_admin_daily_usage
WITH (security_invoker = false)
AS
SELECT
  to_char(date(created_at AT TIME ZONE 'Australia/Melbourne'), 'YYYY-MM-DD') AS day,
  count(*) FILTER (WHERE event_name = 'page_view')          AS page_views,
  count(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  count(*) FILTER (WHERE event_name = 'upgrade_click')      AS upgrade_clicks,
  0::bigint                                                  AS subscriptions,
  count(DISTINCT session_id)                                 AS unique_users
FROM analytics.events
WHERE created_at >= now() - interval '14 days'
GROUP BY date(created_at AT TIME ZONE 'Australia/Melbourne')
ORDER BY date(created_at AT TIME ZONE 'Australia/Melbourne') DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. public.v_admin_ai_usage (24h)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_ai_usage CASCADE;
CREATE VIEW public.v_admin_ai_usage
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE event_name = 'start_sit_generate') AS start_sit_runs,
  0::bigint                                                  AS player_ai_runs,
  0::bigint                                                  AS team_ai_runs
FROM analytics.events
WHERE created_at >= now() - interval '24 hours';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. public.v_admin_start_sit_power_users (7d, 3+ runs)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_admin_start_sit_power_users CASCADE;
CREATE VIEW public.v_admin_start_sit_power_users
WITH (security_invoker = false)
AS
SELECT
  user_id::text,
  count(*) AS start_sit_runs
FROM analytics.events
WHERE event_name = 'start_sit_generate'
  AND created_at >= now() - interval '7 days'
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING count(*) >= 3
ORDER BY start_sit_runs DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. admin.v_analytics_daily (30d, Melbourne time)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_analytics_daily CASCADE;
CREATE VIEW admin.v_analytics_daily
WITH (security_invoker = false)
AS
SELECT
  date(created_at AT TIME ZONE 'Australia/Melbourne') AS day,
  count(*) FILTER (WHERE event_name = 'page_view')           AS visitors,
  count(DISTINCT session_id)                                  AS unique_sessions,
  count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users,
  count(DISTINCT session_id)                                  AS dau,
  count(*) FILTER (WHERE event_name = 'rankings_view')        AS rankings_views,
  count(*) FILTER (WHERE event_name = 'market_watch_view')    AS market_watch_views,
  count(*) FILTER (WHERE event_name = 'start_sit_generate')   AS start_sit_runs,
  count(*) FILTER (WHERE event_name = 'upgrade_click')        AS upgrade_clicks,
  0::bigint                                                    AS subscriptions_started
FROM analytics.events
WHERE created_at >= now() - interval '30 days'
GROUP BY date(created_at AT TIME ZONE 'Australia/Melbourne')
ORDER BY day DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. admin.v_unique_visitors_24h
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_unique_visitors_24h CASCADE;
CREATE VIEW admin.v_unique_visitors_24h
WITH (security_invoker = false)
AS
SELECT
  count(DISTINCT session_id)                                  AS unique_visitors,
  count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS logged_in_users
FROM analytics.events
WHERE created_at >= now() - interval '24 hours';

-- ────────────────────────────────────────────────────────────────────────────
-- 13. admin.v_live_users (last 5 min)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_live_users CASCADE;
CREATE VIEW admin.v_live_users
WITH (security_invoker = false)
AS
SELECT count(DISTINCT session_id) AS live_users
FROM analytics.events
WHERE created_at >= now() - interval '5 minutes';

-- ────────────────────────────────────────────────────────────────────────────
-- 14. admin.v_mau (30d)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_mau CASCADE;
CREATE VIEW admin.v_mau
WITH (security_invoker = false)
AS
SELECT count(DISTINCT session_id) AS mau
FROM analytics.events
WHERE created_at >= now() - interval '30 days';

-- ────────────────────────────────────────────────────────────────────────────
-- 15. admin.v_top_pages_7d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_top_pages_7d CASCADE;
CREATE VIEW admin.v_top_pages_7d
WITH (security_invoker = false)
AS
SELECT
  page           AS path,
  count(*)       AS visitors
FROM analytics.events
WHERE event_name = 'page_view'
  AND created_at >= now() - interval '7 days'
  AND page IS NOT NULL
GROUP BY page
ORDER BY visitors DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 16. admin.v_conversion_funnel_30d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_conversion_funnel_30d CASCADE;
CREATE VIEW admin.v_conversion_funnel_30d
WITH (security_invoker = false)
AS
SELECT
  count(DISTINCT session_id) FILTER (WHERE event_name = 'upgrade_click' AND created_at >= now() - interval '30 days') AS upgrade_click_users,
  (SELECT count(*)::bigint FROM public.stripe_subscriptions WHERE status = 'active')                                  AS subscription_started_users,
  CASE
    WHEN count(DISTINCT session_id) FILTER (WHERE event_name = 'upgrade_click' AND created_at >= now() - interval '30 days') > 0
    THEN round(
      (SELECT count(*)::numeric FROM public.stripe_subscriptions WHERE status = 'active') /
      nullif(count(DISTINCT session_id) FILTER (WHERE event_name = 'upgrade_click' AND created_at >= now() - interval '30 days'), 0) * 100,
      1)
    ELSE 0::numeric
  END AS conversion_rate
FROM analytics.events;

-- ────────────────────────────────────────────────────────────────────────────
-- 17. admin.v_market_watch_usage_7d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_market_watch_usage_7d CASCADE;
CREATE VIEW admin.v_market_watch_usage_7d
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE event_name = 'market_watch_view')             AS market_watch_views,
  count(*) FILTER (WHERE event_name = 'market_watch_compare_run')      AS compare_runs,
  count(*) FILTER (WHERE event_name = 'market_watch_best_trade_click') AS best_trade_clicks,
  count(DISTINCT session_id)                                            AS unique_users
FROM analytics.events
WHERE created_at >= now() - interval '7 days';

-- ────────────────────────────────────────────────────────────────────────────
-- 18. admin.v_revenue_estimate  (Stripe as source of truth)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_revenue_estimate CASCADE;
CREATE VIEW admin.v_revenue_estimate
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE status = 'active')   AS active_subs,
  count(*) FILTER (WHERE status = 'trialing') AS trial_subs,
  -- Monthly price: $9.99 AUD/month; Yearly: $79 AUD/year (~$6.58/month)
  round(count(*) FILTER (WHERE status = 'active') * 6.58,  2) AS mrr_if_all_yearly,
  round(count(*) FILTER (WHERE status = 'active') * 9.99,  2) AS mrr_if_all_monthly,
  round(count(*) FILTER (WHERE status = 'active') * 79.00, 2) AS arr_if_all_yearly,
  round(count(*) FILTER (WHERE status = 'active') * 119.88,2) AS arr_if_all_monthly
FROM public.stripe_subscriptions;

-- ────────────────────────────────────────────────────────────────────────────
-- 19. admin.v_signups_7d, v_signups_daily
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_signups_7d CASCADE;
CREATE VIEW admin.v_signups_7d
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS signups_24h,
  count(*) FILTER (WHERE created_at >= now() - interval '7 days')   AS signups_7d,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days')  AS signups_30d,
  count(*)                                                           AS total_signups
FROM auth.users;

DROP VIEW IF EXISTS admin.v_signups_daily CASCADE;
CREATE VIEW admin.v_signups_daily
WITH (security_invoker = false)
AS
SELECT
  date(created_at AT TIME ZONE 'Australia/Melbourne') AS day,
  count(*) AS signups
FROM auth.users
WHERE created_at >= now() - interval '30 days'
GROUP BY date(created_at AT TIME ZONE 'Australia/Melbourne')
ORDER BY day DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 20. admin.v_top_viewed_players_7d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_top_viewed_players_7d CASCADE;
CREATE VIEW admin.v_top_viewed_players_7d
WITH (security_invoker = false)
AS
SELECT
  metadata->>'player_name' AS player_name,
  count(*)                 AS views,
  count(DISTINCT session_id) AS unique_viewers
FROM analytics.events
WHERE event_name IN ('player_ai_view', 'player_ai_expand', 'rankings_player_click')
  AND created_at >= now() - interval '7 days'
  AND metadata->>'player_name' IS NOT NULL
GROUP BY metadata->>'player_name'
ORDER BY views DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 21. admin.v_utm_traffic_sources_7d
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS admin.v_utm_traffic_sources_7d CASCADE;
CREATE VIEW admin.v_utm_traffic_sources_7d
WITH (security_invoker = false)
AS
SELECT
  coalesce(metadata->>'utm_source', 'direct') AS source,
  count(DISTINCT session_id)                  AS visitors,
  count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS signups
FROM analytics.events
WHERE event_name = 'page_view'
  AND created_at >= now() - interval '7 days'
GROUP BY coalesce(metadata->>'utm_source', 'direct')
ORDER BY visitors DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- Grant read access
-- ────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON admin.v_analytics_daily TO service_role;
GRANT SELECT ON admin.v_unique_visitors_24h TO service_role;
GRANT SELECT ON admin.v_live_users TO service_role;
GRANT SELECT ON admin.v_mau TO service_role;
GRANT SELECT ON admin.v_top_pages_7d TO service_role;
GRANT SELECT ON admin.v_conversion_funnel_30d TO service_role;
GRANT SELECT ON admin.v_market_watch_usage_7d TO service_role;
GRANT SELECT ON admin.v_revenue_estimate TO service_role;
GRANT SELECT ON admin.v_signups_7d TO service_role;
GRANT SELECT ON admin.v_signups_daily TO service_role;
GRANT SELECT ON admin.v_top_viewed_players_7d TO service_role;
GRANT SELECT ON admin.v_utm_traffic_sources_7d TO service_role;

GRANT SELECT ON public.v_admin_analytics_summary TO service_role;
GRANT SELECT ON public.v_admin_analytics_7d TO service_role;
GRANT SELECT ON public.v_admin_feature_usage TO service_role;
GRANT SELECT ON public.v_admin_conversion_funnel TO service_role;
GRANT SELECT ON public.v_admin_realtime_users TO service_role;
GRANT SELECT ON public.v_admin_dau TO service_role;
GRANT SELECT ON public.v_admin_wau TO service_role;
GRANT SELECT ON public.v_admin_daily_usage TO service_role;
GRANT SELECT ON public.v_admin_ai_usage TO service_role;
GRANT SELECT ON public.v_admin_start_sit_power_users TO service_role;
GRANT SELECT ON public.v_admin_subscription_metrics TO service_role;
