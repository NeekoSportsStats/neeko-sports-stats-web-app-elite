
/*
  # Store Supabase URL in cron_secrets

  Stores the project URL so pg_net-based DB functions can reference it
  without relying on a GUC that may not be set in cron context.
*/

INSERT INTO internal.cron_secrets (key, value)
VALUES ('supabase_url', 'https://zbomenuickrogthnsozb.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
