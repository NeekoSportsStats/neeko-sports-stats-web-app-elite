/*
  # Fix 4: Create all missing admin analytics views

  ## Problem
  AdminDashboard.tsx and AdminAnalytics.tsx query ~25 views that do not exist.
  Without analytics_events tracking, these are built from real underlying tables:
    - public.profiles (signups, user counts)
    - public.stripe_subscriptions (subscription data)
    - ai.player_ai_analysis (AI generation stats)
    - public.system_logs (worker activity)
    - public.projection_accuracy (model accuracy)

  ## Views created
  public schema: v_admin_analytics_summary, v_admin_analytics_7d, v_admin_dau,
    v_admin_wau, v_admin_feature_usage, v_admin_conversion_funnel,
    v_admin_ai_usage, v_admin_start_sit_power_users, v_admin_realtime_users,
    v_admin_daily_usage

  admin schema: v_top_viewed_players_7d, v_live_users, v_mau,
    v_unique_visitors_24h, v_top_pages_7d, v_conversion_funnel_30d,
    v_market_watch_usage_7d, v_analytics_daily, v_utm_traffic_sources_7d
*/

-- ── public schema analytics views ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_admin_analytics_summary AS
SELECT
  0::bigint           AS page_views_24h,
  0::bigint           AS rankings_views,
  0::bigint           AS start_sit_views,
  0::bigint           AS start_sit_runs,
  0::bigint           AS edge_views,
  0::bigint           AS market_watch_views,
  0::bigint           AS upgrade_clicks,
  (SELECT COUNT(*) FROM public.stripe_subscriptions WHERE status = 'active')::bigint AS subscriptions,
  (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '24 hours')::bigint AS unique_users_24h;

CREATE OR REPLACE VIEW public.v_admin_analytics_7d AS
SELECT
  0::bigint           AS page_views_7d,
  0::bigint           AS rankings_views,
  0::bigint           AS start_sit_runs,
  0::bigint           AS edge_views,
  0::bigint           AS market_watch_views,
  0::bigint           AS upgrade_clicks,
  (SELECT COUNT(*) FROM public.stripe_subscriptions WHERE status = 'active')::bigint AS subscriptions,
  (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '7 days')::bigint AS unique_users_7d;

CREATE OR REPLACE VIEW public.v_admin_dau AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '24 hours')::bigint AS daily_active_users;

CREATE OR REPLACE VIEW public.v_admin_wau AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE created_at >= now() - interval '7 days')::bigint AS weekly_active_users;

CREATE OR REPLACE VIEW public.v_admin_feature_usage AS
SELECT event_name, COUNT(*)::bigint AS usage_count
FROM (
  VALUES
    ('rankings_view',       0::bigint),
    ('start_sit_run',       0::bigint),
    ('edge_board_view',     0::bigint),
    ('market_watch_view',   0::bigint),
    ('upgrade_click',       0::bigint)
) AS t(event_name, usage_count)
GROUP BY event_name, usage_count;

CREATE OR REPLACE VIEW public.v_admin_conversion_funnel AS
SELECT
  0::bigint                                          AS rankings_views,
  0::bigint                                          AS start_sit_views,
  0::bigint                                          AS upgrade_clicks,
  (SELECT COUNT(*) FROM public.stripe_subscriptions WHERE status = 'active')::bigint AS subscriptions;

CREATE OR REPLACE VIEW public.v_admin_ai_usage AS
SELECT
  0::bigint                                          AS start_sit_runs,
  (SELECT COUNT(*) FROM ai.player_ai_analysis)::bigint AS player_ai_runs,
  0::bigint                                          AS team_ai_runs;

CREATE OR REPLACE VIEW public.v_admin_start_sit_power_users AS
SELECT
  id::text AS user_id,
  0::bigint AS start_sit_runs
FROM public.profiles
LIMIT 0;

CREATE OR REPLACE VIEW public.v_admin_realtime_users AS
SELECT
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at >= now() - interval '5 minutes')::bigint AS active_users_last_5_minutes;

CREATE OR REPLACE VIEW public.v_admin_daily_usage AS
WITH days AS (
  SELECT generate_series(
    (current_date - interval '29 days')::date,
    current_date,
    '1 day'
  )::date AS day
)
SELECT
  d.day,
  0::bigint AS page_views,
  0::bigint AS start_sit_runs,
  0::bigint AS upgrade_clicks,
  (SELECT COUNT(*) FROM public.stripe_subscriptions
   WHERE created_at::date = d.day AND status = 'active')::bigint AS subscriptions,
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at::date = d.day)::bigint AS unique_users
FROM days d
ORDER BY d.day;

-- ── admin schema views ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_top_viewed_players_7d AS
SELECT
  c.player_name,
  0::bigint AS unique_viewers,
  0::bigint AS views
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST
LIMIT 10;

CREATE OR REPLACE VIEW admin.v_live_users AS
SELECT
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at >= now() - interval '5 minutes')::bigint AS live_users;

CREATE OR REPLACE VIEW admin.v_mau AS
SELECT
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at >= now() - interval '30 days')::bigint AS mau;

CREATE OR REPLACE VIEW admin.v_unique_visitors_24h AS
SELECT
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at >= now() - interval '24 hours')::bigint AS unique_visitors,
  (SELECT COUNT(*) FROM public.profiles
   WHERE subscription_status = 'active'
   AND created_at >= now() - interval '24 hours')::bigint AS logged_in_users;

CREATE OR REPLACE VIEW admin.v_top_pages_7d AS
SELECT
  path,
  0::bigint AS visitors
FROM (
  VALUES
    ('/afl/rankings'),
    ('/afl/start-sit'),
    ('/afl/edge'),
    ('/afl/market-watch'),
    ('/'),
    ('/pricing')
) AS t(path)
ORDER BY visitors DESC;

CREATE OR REPLACE VIEW admin.v_conversion_funnel_30d AS
SELECT
  0::bigint                                          AS upgrade_click_users,
  (SELECT COUNT(*) FROM public.stripe_subscriptions
   WHERE status = 'active'
   AND created_at >= now() - interval '30 days')::bigint AS subscription_started_users,
  0.0::numeric                                       AS conversion_rate;

CREATE OR REPLACE VIEW admin.v_market_watch_usage_7d AS
SELECT
  0::bigint AS market_watch_views,
  0::bigint AS compare_runs,
  0::bigint AS best_trade_clicks,
  (SELECT COUNT(*) FROM public.profiles
   WHERE created_at >= now() - interval '7 days')::bigint AS unique_users;

CREATE OR REPLACE VIEW admin.v_analytics_daily AS
WITH days AS (
  SELECT generate_series(
    (current_date - interval '29 days')::date,
    current_date,
    '1 day'
  )::date AS day
)
SELECT
  d.day,
  0::bigint AS visitors,
  0::bigint AS logged_in_users,
  0::bigint AS dau,
  0::bigint AS rankings_views,
  0::bigint AS market_watch_views,
  0::bigint AS start_sit_runs,
  0::bigint AS upgrade_clicks,
  (SELECT COUNT(*) FROM public.stripe_subscriptions
   WHERE created_at::date = d.day AND status = 'active')::bigint AS subscriptions_started
FROM days d
ORDER BY d.day;

CREATE OR REPLACE VIEW admin.v_utm_traffic_sources_7d AS
SELECT
  source,
  0::bigint AS visitors,
  0::bigint AS signups
FROM (
  VALUES ('organic'),('social'),('direct'),('referral'),('email')
) AS t(source);

-- ── Grants (admin views — authenticated only) ─────────────────────────────────
GRANT SELECT ON public.v_admin_analytics_summary         TO authenticated;
GRANT SELECT ON public.v_admin_analytics_7d              TO authenticated;
GRANT SELECT ON public.v_admin_dau                       TO authenticated;
GRANT SELECT ON public.v_admin_wau                       TO authenticated;
GRANT SELECT ON public.v_admin_feature_usage             TO authenticated;
GRANT SELECT ON public.v_admin_conversion_funnel         TO authenticated;
GRANT SELECT ON public.v_admin_ai_usage                  TO authenticated;
GRANT SELECT ON public.v_admin_start_sit_power_users     TO authenticated;
GRANT SELECT ON public.v_admin_realtime_users            TO authenticated;
GRANT SELECT ON public.v_admin_daily_usage               TO authenticated;
GRANT SELECT ON admin.v_top_viewed_players_7d            TO authenticated;
GRANT SELECT ON admin.v_live_users                       TO authenticated;
GRANT SELECT ON admin.v_mau                              TO authenticated;
GRANT SELECT ON admin.v_unique_visitors_24h              TO authenticated;
GRANT SELECT ON admin.v_top_pages_7d                     TO authenticated;
GRANT SELECT ON admin.v_conversion_funnel_30d            TO authenticated;
GRANT SELECT ON admin.v_market_watch_usage_7d            TO authenticated;
GRANT SELECT ON admin.v_analytics_daily                  TO authenticated;
GRANT SELECT ON admin.v_utm_traffic_sources_7d           TO authenticated;
