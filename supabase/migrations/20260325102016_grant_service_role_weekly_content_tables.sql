/*
  # Grant service_role access to weekly_content tables

  ## Problem
  The edge function generate-weekly-content uses the Supabase service role key but
  receives "permission denied for table weekly_content_plans". Investigation confirmed:

  - RLS is enabled but NOT forced (rls_forced=false) — service_role should bypass RLS
  - However, service_role has ZERO PostgreSQL-level GRANT on these tables
  - Only `postgres` and `authenticated` roles have grants
  - PostgREST still requires the role to have table-level SQL privileges even when bypassing RLS

  ## Fix
  Grant ALL privileges on both tables to service_role so the edge function can
  read and write freely. The service_role still bypasses RLS (no policy checks needed)
  but now has the underlying SQL permission to do so.

  ## Security
  This does NOT loosen RLS. Authenticated users (frontend) still go through the
  admin-only RLS policies. Only service_role (edge functions) gets direct access.
*/

GRANT ALL ON public.weekly_content_plans TO service_role;
GRANT ALL ON public.weekly_content_posts TO service_role;
