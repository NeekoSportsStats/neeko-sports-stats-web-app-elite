/*
  # Create public.v_projection_accuracy_homepage

  ## Problem
  Index.tsx queries `v_projection_accuracy_homepage` without schema prefix.
  Supabase PostgREST resolves this to `public` schema, but the view lives at
  `afl.v_projection_accuracy_homepage`.

  ## Fix
  Create a public schema wrapper view that proxies to the afl schema view.
*/

CREATE OR REPLACE VIEW public.v_projection_accuracy_homepage AS
SELECT * FROM afl.v_projection_accuracy_homepage;

GRANT SELECT ON public.v_projection_accuracy_homepage TO authenticated;
GRANT SELECT ON public.v_projection_accuracy_homepage TO anon;
