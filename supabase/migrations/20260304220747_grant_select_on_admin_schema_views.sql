/*
  # Grant SELECT on admin schema analytics views

  ## Problem
  The admin dashboard queries views in the `admin` schema via
  `supabase.schema("admin").from("v_...")` but the `authenticated` role
  has no SELECT privilege on those views, causing 406 Not Acceptable errors.

  ## Changes
  - Grant USAGE on the `admin` schema to `authenticated`
  - Grant SELECT on all 8 analytics views to `authenticated`

  ## Affected views
  - v_unique_visitors_24h
  - v_live_users
  - v_mau
  - v_conversion_funnel_30d
  - v_market_watch_usage_7d
  - v_top_pages_7d
  - v_unique_visitors_daily
  - v_analytics_daily
*/

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
