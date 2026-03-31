/*
  Fix AI Generation Window — AEDT to UTC Correction

  Problem:
  Previous function used UTC 03:45–04:45 which is wrong timezone.
  Data ingestion runs at 03:00 Melbourne (AEDT = UTC+11).

  Correct Conversion:
  Melbourne AEDT = UTC + 11
  03:45 AEDT = 16:45 UTC
  04:45 AEDT = 17:45 UTC

  Change:
  Replace time condition: hour 3/4 UTC -> hour 16/17 UTC
  Cron schedule unchanged.
*/

CREATE OR REPLACE FUNCTION public.run_ai_generation_if_window()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hour   int;
  current_minute int;
BEGIN
  current_hour   := EXTRACT(HOUR   FROM NOW() AT TIME ZONE 'UTC')::int;
  current_minute := EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'UTC')::int;

  IF (current_hour = 16 AND current_minute >= 45)
  OR (current_hour = 17 AND current_minute <= 45)
  THEN
    PERFORM net.http_post(
      url     := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/generate-ranking-ai',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || vault.decrypted_secrets.decrypted_secret
      ),
      body    := '{}'::jsonb
    )
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    RAISE NOTICE 'AI generation triggered — UTC %:% (Melbourne 03:45-04:45 window)', current_hour, current_minute;
  ELSE
    RAISE NOTICE 'AI generation skipped — outside allowed window (current UTC %:%)', current_hour, current_minute;
  END IF;
END;
$$;
