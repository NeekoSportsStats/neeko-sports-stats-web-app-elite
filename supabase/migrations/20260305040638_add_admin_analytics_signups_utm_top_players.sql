/*
  # Admin Analytics Extensions — Signups, UTM Traffic Sources, Top Viewed Players, Revenue Estimate

  ## New Views

  1. `admin.v_signups_7d` — new user registrations in the last 7 days, also day-by-day breakdown
  2. `admin.v_signups_daily` — per-day signups for the last 30 days
  3. `admin.v_utm_traffic_sources_7d` — visitor and signup counts grouped by utm_source (last 7 days)
  4. `admin.v_top_viewed_players_7d` — top player_page_view events by player name (last 7 days)
  5. `admin.v_revenue_estimate` — estimated MRR/ARR from active/trial subscriber counts × price tiers

  ## Security
  All views use SECURITY DEFINER so they can read from auth.users and analytics_events regardless of caller RLS.
  GRANT SELECT to authenticated only (admin-gated at application layer).

  ## Notes
  - utm_source is extracted from analytics_events.properties JSONB field
  - player name is extracted from analytics_events.properties->>'player_name'
  - Revenue estimate uses $9.99 AUD monthly and $89 AUD yearly pricing
  - Signup counts query auth.users directly using SECURITY DEFINER
*/

-- ─── New Signups (7d) ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_signups_7d
WITH (security_invoker = false)
AS
SELECT
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS signups_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS signups_24h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS signups_30d,
  COUNT(*) AS total_signups
FROM auth.users;

ALTER VIEW admin.v_signups_7d OWNER TO postgres;
GRANT SELECT ON admin.v_signups_7d TO authenticated;

-- ─── Signups Per Day (30d) ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_signups_daily
WITH (security_invoker = false)
AS
SELECT
  DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS signups
FROM auth.users
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;

ALTER VIEW admin.v_signups_daily OWNER TO postgres;
GRANT SELECT ON admin.v_signups_daily TO authenticated;

-- ─── UTM Traffic Sources (7d) ────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_utm_traffic_sources_7d
WITH (security_invoker = false)
AS
WITH page_views AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(properties->>'utm_source'), ''),
      'direct'
    ) AS source,
    COALESCE(
      NULLIF(TRIM(properties->>'session_id'), ''),
      NULLIF(TRIM(properties->>'visitor_id'), ''),
      id::text
    ) AS visitor_token,
    user_id
  FROM analytics_events
  WHERE
    created_at >= NOW() - INTERVAL '7 days'
    AND event_name IN ('page_view', 'session_start')
),
signup_sources AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(properties->>'utm_source'), ''),
      'direct'
    ) AS source,
    user_id
  FROM analytics_events
  WHERE
    created_at >= NOW() - INTERVAL '7 days'
    AND event_name = 'signup'
    AND user_id IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  pv.source,
  COUNT(DISTINCT pv.visitor_token) AS visitors,
  COUNT(DISTINCT ss.user_id)       AS signups
FROM page_views pv
LEFT JOIN signup_sources ss ON ss.source = pv.source
GROUP BY pv.source
ORDER BY visitors DESC;

ALTER VIEW admin.v_utm_traffic_sources_7d OWNER TO postgres;
GRANT SELECT ON admin.v_utm_traffic_sources_7d TO authenticated;

-- ─── Top Viewed Players (7d) ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW admin.v_top_viewed_players_7d
WITH (security_invoker = false)
AS
SELECT
  COALESCE(
    NULLIF(TRIM(properties->>'player_name'), ''),
    NULLIF(TRIM(properties->>'name'), ''),
    'Unknown'
  ) AS player_name,
  COUNT(*) AS views,
  COUNT(DISTINCT COALESCE(
    NULLIF(TRIM(properties->>'visitor_id'), ''),
    user_id::text,
    id::text
  )) AS unique_viewers
FROM analytics_events
WHERE
  created_at >= NOW() - INTERVAL '7 days'
  AND event_name IN ('player_page_view', 'player_view', 'player_profile_view')
  AND COALESCE(
    NULLIF(TRIM(properties->>'player_name'), ''),
    NULLIF(TRIM(properties->>'name'), '')
  ) IS NOT NULL
GROUP BY 1
ORDER BY views DESC
LIMIT 20;

ALTER VIEW admin.v_top_viewed_players_7d OWNER TO postgres;
GRANT SELECT ON admin.v_top_viewed_players_7d TO authenticated;

-- ─── Revenue Estimate ────────────────────────────────────────────────────────
-- Estimates MRR/ARR from subscription counts stored in profiles table.
-- Monthly price: $9.99 AUD, Yearly price: $89 AUD (amortised to $7.42/mo).
-- We can't distinguish monthly vs yearly from profiles alone,
-- so we present a range (all monthly vs all yearly).

CREATE OR REPLACE VIEW admin.v_revenue_estimate
WITH (security_invoker = false)
AS
SELECT
  active_subs,
  trial_subs,
  -- Conservative estimate: all yearly
  ROUND((active_subs * 7.42)::numeric, 2)   AS mrr_if_all_yearly,
  -- Optimistic estimate: all monthly
  ROUND((active_subs * 9.99)::numeric, 2)   AS mrr_if_all_monthly,
  -- ARR conservative
  ROUND((active_subs * 89.00)::numeric, 2)  AS arr_if_all_yearly,
  -- ARR optimistic
  ROUND((active_subs * 119.88)::numeric, 2) AS arr_if_all_monthly
FROM (
  SELECT
    COUNT(*) FILTER (WHERE subscription_status = 'active')  AS active_subs,
    COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS trial_subs
  FROM profiles
) sub;

ALTER VIEW admin.v_revenue_estimate OWNER TO postgres;
GRANT SELECT ON admin.v_revenue_estimate TO authenticated;
