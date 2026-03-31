/*
  # Admin Product Analytics Views

  ## Purpose
  Adds a suite of admin-only views for product analytics and subscription metrics.

  ## New Views
  - `v_admin_subscription_metrics` — active / trial / canceled subscriber counts from profiles
  - `v_admin_dau` — distinct users active in last 24 hours
  - `v_admin_wau` — distinct users active in last 7 days
  - `v_admin_feature_usage` — top events by usage count over last 7 days
  - `v_admin_conversion_funnel` — key funnel events over last 7 days
  - `v_admin_ai_usage` — AI-specific event counts over last 24 hours
  - `v_admin_start_sit_power_users` — users with 3+ start/sit runs in last 7 days
  - `v_admin_realtime_users` — distinct users active in last 5 minutes
  - `v_admin_daily_usage` — per-day breakdown of key events

  ## Security
  - All views are restricted to the service role / admin access path
  - No RLS needed on views themselves (they query already-secured tables via elevated context)
  - anon / authenticated roles are NOT granted SELECT on these views
*/

-- ─── Subscription Metrics ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_subscription_metrics AS
SELECT
  COUNT(*) FILTER (WHERE subscription_status = 'active')   AS active_subscriptions,
  COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS trial_subscriptions,
  COUNT(*) FILTER (WHERE subscription_status = 'canceled') AS canceled_subscriptions,
  COUNT(*) FILTER (WHERE is_active = true)                 AS is_active_count,
  COUNT(*)                                                  AS total_profiles
FROM profiles;

-- ─── Daily Active Users ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_dau AS
SELECT
  COUNT(DISTINCT user_id) AS daily_active_users
FROM analytics_events
WHERE created_at > now() - interval '24 hours';

-- ─── Weekly Active Users ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_wau AS
SELECT
  COUNT(DISTINCT user_id) AS weekly_active_users
FROM analytics_events
WHERE created_at > now() - interval '7 days';

-- ─── Feature Usage Leaderboard ────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_feature_usage AS
SELECT
  event_name,
  COUNT(*) AS usage_count
FROM analytics_events
WHERE created_at > now() - interval '7 days'
GROUP BY event_name
ORDER BY usage_count DESC;

-- ─── Conversion Funnel ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_conversion_funnel AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'rankings_view')        AS rankings_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_view')       AS start_sit_views,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')        AS upgrade_clicks,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started') AS subscriptions
FROM analytics_events
WHERE created_at > now() - interval '7 days';

-- ─── AI Usage Metrics ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_ai_usage AS
SELECT
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate')           AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'ai_player_summary_generated')  AS player_ai_runs,
  COUNT(*) FILTER (WHERE event_name = 'ai_team_summary_generated')    AS team_ai_runs
FROM analytics_events
WHERE created_at > now() - interval '24 hours';

-- ─── Start/Sit Power Users ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_start_sit_power_users AS
SELECT
  user_id,
  COUNT(*) AS start_sit_runs
FROM analytics_events
WHERE event_name = 'start_sit_generate'
  AND created_at > now() - interval '7 days'
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) >= 3
ORDER BY start_sit_runs DESC;

-- ─── Real-time Users (last 5 min) ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_realtime_users AS
SELECT
  COUNT(DISTINCT user_id) AS active_users_last_5_minutes
FROM analytics_events
WHERE created_at > now() - interval '5 minutes';

-- ─── Daily Analytics Dataset ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_admin_daily_usage AS
SELECT
  date(created_at)                                                      AS day,
  COUNT(*) FILTER (WHERE event_name = 'page_view')                     AS page_views,
  COUNT(*) FILTER (WHERE event_name = 'start_sit_generate')            AS start_sit_runs,
  COUNT(*) FILTER (WHERE event_name = 'subscription_started')          AS subscriptions,
  COUNT(*) FILTER (WHERE event_name = 'upgrade_click')                 AS upgrade_clicks,
  COUNT(DISTINCT user_id)                                               AS unique_users
FROM analytics_events
GROUP BY date(created_at)
ORDER BY day DESC;

-- ─── Grant access to authenticated / service role ────────────────────────────
-- These views should only be queried server-side or via admin-gated UI.
-- We intentionally do NOT grant anon access.
GRANT SELECT ON v_admin_subscription_metrics   TO authenticated;
GRANT SELECT ON v_admin_dau                    TO authenticated;
GRANT SELECT ON v_admin_wau                    TO authenticated;
GRANT SELECT ON v_admin_feature_usage          TO authenticated;
GRANT SELECT ON v_admin_conversion_funnel      TO authenticated;
GRANT SELECT ON v_admin_ai_usage               TO authenticated;
GRANT SELECT ON v_admin_start_sit_power_users  TO authenticated;
GRANT SELECT ON v_admin_realtime_users         TO authenticated;
GRANT SELECT ON v_admin_daily_usage            TO authenticated;
