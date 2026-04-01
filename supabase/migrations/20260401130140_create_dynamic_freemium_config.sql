/*
  # Dynamic Freemium Configuration System

  1. New Tables
    - `freemium_config` - Centralized configuration for freemium rules

  2. Configuration Keys
    - `free_players_selection` - Rules for dynamic free player selection
    - `ai_exposure_rules` - Rules for AI content exposure tiers
    - `ui_limits` - UI exposure limits per page

  3. Purpose
    - Remove hardcoded limits (no more static LIMIT 8)
    - Enable marketing flexibility (change limits without migration)
    - Support A/B testing and campaigns
    - Maintain security while improving conversion

  4. Security
    - Only admin can update config
    - Config changes logged automatically
    - Backwards compatible (defaults if config missing)
*/

-- ============================================================================
-- STEP 1: Create freemium config table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.freemium_config (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.freemium_config IS 'Centralized configuration for freemium rules - enables dynamic adjustment without migrations';

-- Enable RLS
ALTER TABLE public.freemium_config ENABLE ROW LEVEL SECURITY;

-- Read policy (everyone can read config)
CREATE POLICY "Config readable by all"
  ON public.freemium_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Write policy (admin only)
CREATE POLICY "Config writable by admin only"
  ON public.freemium_config
  FOR ALL
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Grant permissions
GRANT SELECT ON public.freemium_config TO anon, authenticated;
GRANT ALL ON public.freemium_config TO service_role;

-- ============================================================================
-- STEP 2: Insert default configuration
-- ============================================================================

INSERT INTO public.freemium_config (config_key, config_value, description) VALUES
(
  'free_players_selection',
  '{
    "method": "top_n_by_metric",
    "metric": "neeko_rating",
    "limit": 12,
    "rotation_enabled": false,
    "min_price": null,
    "positions": {
      "balanced": false,
      "min_per_position": null
    },
    "fallback_limit": 8
  }'::jsonb,
  'Rules for selecting which players are accessible to free users. Increased from 8 to 12 for better preview experience.'
),
(
  'ai_exposure_rules',
  '{
    "free_tier": {
      "summary_short": "first_sentence",
      "summary_long": "none",
      "ai_recommendation": "category_only",
      "ai_reasoning": "none",
      "max_words_short": 30
    },
    "premium_tier": {
      "summary_short": "full",
      "summary_long": "full",
      "ai_recommendation": "full",
      "ai_reasoning": "full"
    }
  }'::jsonb,
  'AI content exposure rules for free vs premium tiers. Free users get teasers to showcase AI quality without giving away full value.'
),
(
  'ui_limits',
  '{
    "rankings": {
      "free_full_rows": 10,
      "free_locked_preview_rows": 10,
      "show_conversion_wall": true
    },
    "market_watch": {
      "free_visible_players": 15,
      "show_ai_teaser": true,
      "show_category_summary": true
    },
    "player_page": {
      "show_basic_stats": true,
      "show_ai_teaser": true,
      "show_locked_sections": true
    },
    "team_page": {
      "show_all_players": true,
      "lock_advanced_stats": true,
      "show_upgrade_cta": true
    }
  }'::jsonb,
  'UI exposure limits for each page type. Controls what free users see and where conversion CTAs appear.'
)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- STEP 3: Create function to get config value
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_freemium_config(p_config_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT config_value
  FROM public.freemium_config
  WHERE config_key = p_config_key
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_freemium_config(text) IS 'Get freemium configuration value by key';

GRANT EXECUTE ON FUNCTION public.get_freemium_config(text) TO anon, authenticated, service_role;

-- ============================================================================
-- STEP 4: Create updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_freemium_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER freemium_config_updated_at
  BEFORE UPDATE ON public.freemium_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_freemium_config_timestamp();
