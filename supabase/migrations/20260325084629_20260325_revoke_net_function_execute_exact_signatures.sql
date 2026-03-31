/*
  # Revoke net.http_get and net.http_post EXECUTE using exact catalog signatures

  ## Summary
  Previous migration used mismatched signatures. This uses the exact signatures
  confirmed from pg_proc catalog (OIDs 17528 and 17529).
*/

REVOKE EXECUTE ON FUNCTION net.http_get(
  url text,
  params jsonb,
  headers jsonb,
  timeout_milliseconds integer
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION net.http_post(
  url text,
  body jsonb,
  params jsonb,
  headers jsonb,
  timeout_milliseconds integer
) FROM anon, authenticated;
