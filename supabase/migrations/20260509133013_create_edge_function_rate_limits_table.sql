/*
  # Create edge_function_rate_limits table

  Provides a durable, Supabase-backed rate limiting store for edge functions
  that trigger expensive external API calls (e.g. OpenAI). In-memory rate
  limiting resets on cold start and is trivially bypassed by concurrent
  invocations — this table solves both problems.

  ## New Tables
  - `public.edge_function_rate_limits`
    - `id`          — surrogate PK (uuid)
    - `user_id`     — the authenticated user's UUID
    - `function_name` — slug of the edge function (e.g. 'generate-content-post')
    - `window_start` — timestamp rounded to the current rate-limit window
    - `call_count`  — number of calls within this window
    - `updated_at`  — last update timestamp

  ## Unique constraint
  One row per (user_id, function_name, window_start). The upsert pattern
  increments call_count atomically via an RPC.

  ## Security
  - RLS enabled — no direct public read/write
  - Only the service role (used by edge functions) may write
  - Authenticated users may read only their own rows (for debugging)

  ## Notes
  - Windows are 1-minute buckets: date_trunc('minute', now())
  - Edge function logic: if call_count >= limit after increment, reject the request
  - Rows older than 24 hours can be pruned by a cron job (not required for correctness)
*/

CREATE TABLE IF NOT EXISTS public.edge_function_rate_limits (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text        NOT NULL,
  window_start  timestamptz NOT NULL,
  call_count    integer     NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS edge_function_rate_limits_unique
  ON public.edge_function_rate_limits (user_id, function_name, window_start);

CREATE INDEX IF NOT EXISTS edge_function_rate_limits_cleanup_idx
  ON public.edge_function_rate_limits (window_start);

ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by edge functions)
CREATE POLICY "Service role full access to rate limits"
  ON public.edge_function_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users may only read their own rows
CREATE POLICY "Users can read own rate limit rows"
  ON public.edge_function_rate_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

/*
  RPC: increment_rate_limit
  Atomically upserts (user_id, function_name, window_start) and returns the
  new call_count. The edge function compares this against its allowed limit.
*/
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_user_id       uuid,
  p_function_name text,
  p_window_start  timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.edge_function_rate_limits
    (user_id, function_name, window_start, call_count, updated_at)
  VALUES
    (p_user_id, p_function_name, p_window_start, 1, now())
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE SET
    call_count = edge_function_rate_limits.call_count + 1,
    updated_at = now()
  RETURNING call_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit FROM public, anon;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit TO service_role;
