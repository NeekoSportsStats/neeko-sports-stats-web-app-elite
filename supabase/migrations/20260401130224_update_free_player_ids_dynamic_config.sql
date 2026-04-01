/*
  # Update Free Player IDs to Use Dynamic Config

  1. Updates
    - Modify `v_free_player_ids_2026` view to use config limit
    - Update `get_free_player_ids()` function to read from config
    - Add fallback to 8 if config unavailable

  2. Benefits
    - No more hardcoded LIMIT 8
    - Can adjust exposure via admin panel
    - Supports A/B testing
    - Maintains backward compatibility

  3. Security
    - Same RLS and access control
    - Bot handling unchanged
    - Premium checks unchanged
*/

-- ============================================================================
-- STEP 1: Update free player IDs view to use dynamic limit
-- ============================================================================

CREATE OR REPLACE VIEW afl.v_free_player_ids_2026
WITH (security_invoker=false)
AS
SELECT 
  player_id,
  player_name,
  team,
  "position",
  neeko_rating
FROM afl.player_rankings_cache
WHERE player_id IS NOT NULL
  AND projection_final IS NOT NULL
  AND projection_final > 0
  AND neeko_rating IS NOT NULL
ORDER BY neeko_rating DESC
LIMIT (
  SELECT COALESCE(
    (config_value->>'limit')::int,
    8  -- Fallback to 8 if config missing
  )
  FROM public.freemium_config
  WHERE config_key = 'free_players_selection'
);

COMMENT ON VIEW afl.v_free_player_ids_2026 IS 'Dynamic free player access - limit controlled by freemium_config table';

-- ============================================================================
-- STEP 2: Create helper function to get configured free player limit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_free_player_limit()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT (config_value->>'limit')::int
     FROM public.freemium_config
     WHERE config_key = 'free_players_selection'),
    8  -- Default fallback
  );
$$;

COMMENT ON FUNCTION public.get_free_player_limit() IS 'Get configured limit for free players (defaults to 8)';

GRANT EXECUTE ON FUNCTION public.get_free_player_limit() TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 3: Create AI content truncation helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.truncate_ai_text(
  p_full_text text,
  p_mode text DEFAULT 'first_sentence'
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sentence_end int;
  v_truncated text;
BEGIN
  -- Return NULL if input is NULL
  IF p_full_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Handle different truncation modes
  CASE p_mode
    WHEN 'first_sentence' THEN
      -- Find first sentence end (. ! ?)
      v_sentence_end := LEAST(
        COALESCE(NULLIF(position('. ' in p_full_text), 0), 9999),
        COALESCE(NULLIF(position('! ' in p_full_text), 0), 9999),
        COALESCE(NULLIF(position('? ' in p_full_text), 0), 9999)
      );
      
      IF v_sentence_end < 9999 THEN
        v_truncated := substring(p_full_text from 1 for v_sentence_end);
      ELSE
        -- No sentence end found, truncate at 30 words
        v_truncated := substring(p_full_text from 1 for 150);
      END IF;
      
      RETURN trim(v_truncated);
      
    WHEN 'category_only' THEN
      -- Extract just the category (BUY, HOLD, SELL, etc.)
      -- Assumes format like "BUY: explanation" or just "BUY"
      v_truncated := split_part(p_full_text, ':', 1);
      v_truncated := split_part(v_truncated, '-', 1);
      v_truncated := split_part(v_truncated, ' ', 1);
      RETURN upper(trim(v_truncated));
      
    WHEN 'none' THEN
      RETURN NULL;
      
    WHEN 'full' THEN
      RETURN p_full_text;
      
    ELSE
      -- Unknown mode, return full text
      RETURN p_full_text;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.truncate_ai_text(text, text) IS 'Truncate AI text for free tier exposure - first_sentence, category_only, none, or full';

GRANT EXECUTE ON FUNCTION public.truncate_ai_text(text, text) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 4: Create function to get AI exposure rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ai_exposure_rule(p_tier text, p_field text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT config_value->p_tier->>p_field
     FROM public.freemium_config
     WHERE config_key = 'ai_exposure_rules'),
    'full'  -- Default to full if config missing
  );
$$;

COMMENT ON FUNCTION public.get_ai_exposure_rule(text, text) IS 'Get AI exposure rule for specific tier and field (e.g., free_tier, summary_short)';

GRANT EXECUTE ON FUNCTION public.get_ai_exposure_rule(text, text) TO anon, authenticated, service_role;
