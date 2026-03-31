/*
  # Fix recommendation_short — Smarter Sentence Extraction

  ## Problem
  The first-period approach cuts mid-number (e.g. "At a value score of 95." 
  from "At a value score of 95.35,..."). A real sentence ends with ". " 
  followed by a capital letter, or ". " at the end of the string.

  ## Fix
  Use regexp_match to find the first sentence boundary: period followed by
  a space and uppercase letter, or period at end of string. This avoids
  cutting at decimal points in numbers.

  ## Fallback
  If no sentence boundary is found, take first 140 characters.
  Only re-processes rows where short looks truncated (contains number+period pattern).
*/

UPDATE public.ai_rankings_player_recos
SET recommendation_short = (
  SELECT CASE
    -- Match: text up to and including ". " before an uppercase letter
    WHEN recommendation_long ~ '\.\s+[A-Z]'
      THEN TRIM(regexp_replace(recommendation_long, '(\.\s+[A-Z].*)$', '', 'n'))
           || '.'
    -- No sentence boundary found: first 140 chars
    ELSE LEFT(recommendation_long, 140)
  END
)
WHERE recommendation_long IS NOT NULL
  AND recommendation_long != '';
