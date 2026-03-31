/*
  # Sanitize system_logs to ASCII-only characters

  ## Purpose
  The Bolt UI renders log messages via btoa() which only supports Latin-1.
  Non-ASCII characters (smart quotes, long dashes, arrows, emojis, check marks)
  cause an InvalidCharacterError crash in the Bolt renderer.

  ## Changes

  1. Rebuild `public.log_system_event()` to strip non-ASCII characters from
     message, source, and event_type before inserting.
     - Uses regexp_replace(text, '[^\x00-\x7F]', '', 'g') to remove any character
       outside the 7-bit ASCII range.
     - Also normalises common unicode replacements before stripping:
         em dash (U+2014)       -> " - "
         en dash (U+2013)       -> " - "
         right arrow (U+2192)   -> "->"
         check mark (U+2713)    -> "OK"
         heavy check (U+2714)   -> "OK"
         warning sign (U+26A0)  -> "WARNING"
         left/right double quotes -> straight double quotes
         left/right single quotes -> straight single quotes

  2. Sanitize existing rows in system_logs that contain non-ASCII characters.

  ## Security
  No RLS changes. This is a safe data hygiene migration.
*/

-- Step 1: Rebuild the helper function to sanitize at write time
CREATE OR REPLACE FUNCTION public.log_system_event(
  p_level      text,
  p_source     text,
  p_event_type text,
  p_message    text,
  p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message    text;
  v_source     text;
  v_event_type text;
BEGIN
  -- Normalise common unicode characters to safe ASCII equivalents before stripping
  v_message := p_message;
  v_message := replace(v_message, E'\u2014', ' - ');   -- em dash
  v_message := replace(v_message, E'\u2013', ' - ');   -- en dash
  v_message := replace(v_message, E'\u2192', '->');    -- right arrow
  v_message := replace(v_message, E'\u2713', 'OK');    -- check mark
  v_message := replace(v_message, E'\u2714', 'OK');    -- heavy check
  v_message := replace(v_message, E'\u26A0', 'WARNING'); -- warning sign
  v_message := replace(v_message, E'\u201C', '"');     -- left double quote
  v_message := replace(v_message, E'\u201D', '"');     -- right double quote
  v_message := replace(v_message, E'\u2018', '''');    -- left single quote
  v_message := replace(v_message, E'\u2019', '''');    -- right single quote
  v_message := replace(v_message, E'\u2022', '*');     -- bullet
  v_message := replace(v_message, E'\u2026', '...');   -- ellipsis
  -- Strip any remaining non-ASCII characters
  v_message := regexp_replace(v_message, '[^\x00-\x7F]', '', 'g');

  v_source := regexp_replace(p_source, '[^\x00-\x7F]', '', 'g');
  v_event_type := regexp_replace(p_event_type, '[^\x00-\x7F]', '', 'g');

  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
  VALUES (p_level, v_source, v_event_type, v_message, p_metadata);
END;
$$;


-- Step 2: Sanitize any existing rows that contain non-ASCII characters
UPDATE public.system_logs
SET
  message = regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      message,
      E'\u2014', ' - '),
      E'\u2013', ' - '),
      E'\u2192', '->'),
      E'\u2713', 'OK'),
      E'\u2714', 'OK'),
      E'\u26A0', 'WARNING'),
      E'\u201C', '"'),
      E'\u201D', '"'),
      E'\u2018', ''''),
      E'\u2019', ''''),
      E'\u2022', '*'),
      E'\u2026', '...'),
    '[^\x00-\x7F]', '', 'g'
  ),
  source = regexp_replace(source, '[^\x00-\x7F]', '', 'g'),
  event_type = regexp_replace(event_type, '[^\x00-\x7F]', '', 'g')
WHERE
  message  ~ '[^\x00-\x7F]'
  OR source ~ '[^\x00-\x7F]'
  OR event_type ~ '[^\x00-\x7F]';
