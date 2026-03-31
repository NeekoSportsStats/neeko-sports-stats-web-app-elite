/*
  # Fix analytics events ingestion via public RPC

  ## Problem
  The frontend calls `.schema("analytics").from("events").insert(...)` via the Supabase JS client.
  The `analytics` schema is not exposed via PostgREST (only `public` is exposed by default),
  so all inserts silently fail with a schema-not-found error — resulting in 0 rows in analytics.events.

  ## Solution
  Create a SECURITY DEFINER RPC in the public schema that accepts event data and writes to
  analytics.events. The frontend calls this RPC instead of direct schema access.

  ## Changes
  - New function: `public.log_analytics_event(p_event_name, p_session_id, p_page, p_metadata, p_user_id)`
  - Grants EXECUTE to anon and authenticated roles
  - No schema exposure needed — RPC runs as definer with access to analytics schema
*/

CREATE OR REPLACE FUNCTION public.log_analytics_event(
  p_event_name  text,
  p_session_id  text DEFAULT NULL,
  p_page        text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_user_id     uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = analytics, public
AS $$
BEGIN
  INSERT INTO analytics.events (event_name, session_id, page, metadata, user_id, created_at)
  VALUES (
    p_event_name,
    p_session_id,
    p_page,
    COALESCE(p_metadata, '{}'::jsonb),
    p_user_id,
    now()
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_analytics_event(text, text, text, jsonb, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.log_analytics_event(text, text, text, jsonb, uuid) TO authenticated;
