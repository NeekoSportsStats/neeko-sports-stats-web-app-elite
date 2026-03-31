/*
  # Step 7b — Enable RLS on app_config

  app_config already had a deny-all policy but RLS was not enabled on the table itself.
  This migration enables it so the deny-all policy is enforced.
  The service_role bypass policy is already in place from step 5.
*/
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
