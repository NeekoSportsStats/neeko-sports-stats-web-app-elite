/*
  # Create afl.should_regenerate_summary Safety Function

  ## Purpose
  Provides a single, consistent staleness check for all AI pipeline edge functions.
  Returns true when a summary is missing or older than 6 hours.

  ## Usage in Edge Functions
  WHERE afl.should_regenerate_summary(updated_at)

  ## Logic
  - NULL updated_at → always regenerate (never been written)
  - updated_at older than 6 hours → regenerate
  - updated_at within last 6 hours → skip (fresh)
*/

CREATE OR REPLACE FUNCTION afl.should_regenerate_summary(
  updated_at timestamp
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    updated_at IS NULL
    OR updated_at < now() - interval '6 hours'
$$;
