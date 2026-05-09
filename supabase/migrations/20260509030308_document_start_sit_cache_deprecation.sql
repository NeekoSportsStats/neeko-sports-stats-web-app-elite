/*
  # Document start_sit_cache Table Deprecation

  ## Summary
  The Start/Sit AI feature has been removed from the active application.
  All frontend routes, components and admin UI for Start/Sit have been archived.

  ## What changed in this session
  - Removed /fantasy/start-sit route from the React app
  - Moved start-sit components to src/features/afl/_archived/start-sit/
  - Removed "Clear Start/Sit Cache" button from Admin Command Center
  - Removed Start/Sit rows from Admin Analytics and Health dashboards
  - Removed generate-start-sit edge function calls from all user-facing pages

  ## Tables NOT dropped (yet)
  - `public.start_sit_cache` — still present; safe to drop once confirmed no active
    sessions are using it and the table shows no recent writes in production.
    TODO: run `SELECT max(updated_at) FROM public.start_sit_cache;` before dropping.
    Drop command when ready: DROP TABLE IF EXISTS public.start_sit_cache;

  ## Edge Functions NOT undeployed (yet)
  - `generate-start-sit` — still deployed but has zero active callers after this
    session. Safe to undeploy via Supabase dashboard once the confirmation period
    (one sprint / one week) has passed with no errors.

  ## No data changes. No table mutations. Documentation only.
*/

-- Add a comment to the table so its status is visible in the DB schema
COMMENT ON TABLE public.start_sit_cache IS
  'DEPRECATED 2026-05-09: Start/Sit AI feature removed from active app. '
  'This table is retained for one confirmation period. Safe to drop after '
  'verifying max(updated_at) shows no recent writes. See migration '
  'document_start_sit_cache_deprecation for context.';
