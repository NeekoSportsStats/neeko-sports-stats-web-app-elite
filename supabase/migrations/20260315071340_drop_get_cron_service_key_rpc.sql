/*
  # Drop get_cron_service_key public RPC

  ## Summary
  Removes the public.get_cron_service_key() function entirely.

  ## Reason
  The function was previously restricted to admin-only callers but still
  returned the service_role key to admin browser sessions — creating a path
  where a compromised admin session could retrieve the master key.

  All four edge functions that admin browsers can trigger (generate-ai-image,
  generate-marketing-caption, generate-player-ranking-recos, generate-ranking-ai)
  have been updated to accept admin JWTs directly, verifying is_admin server-side.
  The service_role key is never sent to the browser. Cron and server-to-server
  calls continue to use SUPABASE_SERVICE_ROLE_KEY from Deno environment variables.

  ## Changes
  - DROP FUNCTION public.get_cron_service_key()

  ## Security
  - Service role key can no longer be retrieved through any browser-callable RPC
  - Admin browser flows now use JWT-based admin verification inside edge functions
*/

DROP FUNCTION IF EXISTS public.get_cron_service_key();
