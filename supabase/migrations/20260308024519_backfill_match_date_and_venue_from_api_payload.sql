/*
  # Backfill match_date and venue from api_payload in raw_2026_matches

  ## Problem
  The `match_date` and `venue` columns in `afl.raw_2026_matches` are NULL
  for all 5 rows. The actual values exist in the `api_payload` jsonb column
  under keys "date" and "venue".

  ## Fix
  UPDATE the existing rows to extract and cast these values from api_payload.
  This is a safe data backfill — no schema changes, no drops.

  ## Expected Result
  5 rows updated: match_date and venue populated for all raw_2026_matches rows.
*/

UPDATE afl.raw_2026_matches
SET
  match_date = (api_payload->>'date')::timestamptz,
  venue      = api_payload->>'venue'
WHERE match_date IS NULL
  AND api_payload IS NOT NULL
  AND api_payload->>'date' IS NOT NULL;
