/*
  # Fix get_rankings_safe RPC — Complete Column Schema

  ## Problem
  The existing get_rankings_safe RPC only returns 15 columns, but the Rankings
  page frontend expects the full column set from player_rankings_cache (60+ columns).

  This causes the Rankings page to bypass the RPC and query views directly,
  defeating the Phase 3 freemium access control system.

  ## Solution
  Rebuild get_rankings_safe to return the complete column set that matches
  what the frontend FREE_COLUMNS expects, with proper AI truncation for
  free users.

  ## Security
  - Uses get_access_context for auth
  - Server-side AI truncation (no data leak)
  - Bot-aware access control
  - RLS maintained
*/

-- ============================================================================
-- Drop old incomplete RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, int);

-- ============================================================================
-- Create complete get_rankings_safe RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false,
  p_limit int DEFAULT 500
)
RETURNS TABLE (
  -- Core identification
  player_id int,
  player_name text,
  team text,
  team_name text,
  "position" text,
  position_group text,

  -- Projections & scoring
  projection_final numeric,
  ceiling numeric,
  floor numeric,

  -- Performance metrics
  consistency numeric,
  form_score numeric,
  neeko_rating numeric,
  neeko_rating_scaled numeric,

  -- Pricing & value
  price int,
  prev_price int,
  price_change int,
  price_change_pct numeric,
  breakeven numeric,
  value_score numeric,
  best_value_score numeric,
  value_tag text,
  value_tier text,

  -- Confidence & risk
  projection_confidence numeric,
  risk_rating numeric,
  matchup_rating text,
  matchup_label text,
  matchup_multiplier numeric,

  -- AI fields (tiered exposure)
  ai_recommendation text,
  recommendation_strength text,
  recommendation_color text,
  summary_short text,
  summary_long text,
  recommendation_short text,
  recommendation_why text,
  ai_summary text,

  -- Additional metrics
  consistency_tier text,
  access_tier text,
  total_count int,
  cached_at timestamptz,
  games_played int,
  row_rank int,

  -- Game context
  start_sit_decision text,
  edge_score numeric,
  edge_tier text,
  market_watch_category text,

  -- Availability
  status text,
  manual_status text,
  is_available boolean,
  bye_round int,
  is_bye boolean,
  bye_next_round boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium boolean;
  v_free_ids int[];
BEGIN
  -- Get unified access context (bot-aware)
  v_access_context := get_access_context(p_user_id, p_is_bot);

  v_is_premium := (v_access_context->>'is_premium')::boolean;
  v_free_ids := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  -- Return rankings with tiered AI exposure
  RETURN QUERY
  SELECT
    -- Core identification
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.position_group,

    -- Projections & scoring
    c.projection_final,
    c.ceiling,
    c.floor,

    -- Performance metrics
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,

    -- Pricing & value
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.breakeven,
    c.value_score,
    c.best_value_score,
    c.value_tag,
    c.value_tier,

    -- Confidence & risk
    c.projection_confidence,
    c.risk_rating,
    c.matchup_rating,
    c.matchup_label,
    c.matchup_multiplier,

    -- AI fields with tiered exposure
    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN
        c.ai_recommendation  -- Full recommendation
      WHEN c.ai_recommendation IS NOT NULL THEN
        truncate_ai_text(c.ai_recommendation, 'category_only')  -- Category only (BUY/HOLD/SELL)
      ELSE NULL
    END,

    c.recommendation_strength,  -- Show for all (metadata)
    c.recommendation_color,     -- Show for all (visual cue)

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN
        c.summary_short  -- Full summary
      WHEN c.summary_short IS NOT NULL THEN
        truncate_ai_text(c.summary_short, 'first_sentence')  -- Teaser only
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.summary_long
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_short
      WHEN c.recommendation_short IS NOT NULL THEN
        truncate_ai_text(c.recommendation_short, 'first_sentence')
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.recommendation_why
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_summary
      ELSE NULL
    END,

    -- Additional metrics
    c.consistency_tier,

    CASE
      WHEN v_is_premium THEN 'premium'::text
      WHEN c.player_id = ANY(v_free_ids) THEN 'free'::text
      ELSE 'locked'::text
    END,

    c.total_count,
    c.cached_at,
    c.games_played,

    ROW_NUMBER() OVER (ORDER BY c.neeko_rating_scaled DESC NULLS LAST)::int,

    -- Game context
    c.start_sit_decision,
    c.edge_score,
    c.edge_tier,
    c.market_watch_category,

    -- Availability
    c.status,
    c.manual_status,
    c.is_available,
    c.bye_round,
    c.is_bye,
    c.bye_next_round

  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.neeko_rating_scaled DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_rankings_safe(uuid, boolean, int) IS
'Returns complete player rankings with tiered AI exposure - free users see teasers only, premium gets full content. Matches frontend column expectations.';

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO anon, authenticated, service_role;
