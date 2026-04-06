/*
  # Revoke anon EXECUTE on process_price_ingest_public
  
  CREATE OR REPLACE FUNCTION resets grants to defaults in some Postgres versions.
  This migration explicitly revokes anon after the function was rebuilt.
*/
REVOKE ALL ON FUNCTION public.process_price_ingest_public(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_price_ingest_public(jsonb) TO authenticated, service_role;
