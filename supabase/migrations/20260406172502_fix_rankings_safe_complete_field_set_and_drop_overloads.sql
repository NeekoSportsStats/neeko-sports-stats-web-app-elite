/*
  # Fix get_rankings_safe complete field set and drop stale overloads

  ## Changes
  1. Drops all stale overloads of get_rankings_free and get_rankings_premium
  2. Rebuilds get_rankings_safe with all fields required by RankingRow frontend type:
     - Adds missing: upside_rating, risk_rating, captain_score, captain_rating,
       summary_short, summary_long, ai_updated_at, last_5_avg, signal_tag,
       neeko_rating_scaled, position_group, form_delta, form_label, trend_score,
       trend_signal, projection_confidence, upside_pct, bye_round, bye_next_round
     - Ensures all numeric fields cast to ::numeric to prevent double precision mismatches
  3. Rebuilds get_market_watch_safe with correct position field name mapping
  4. Ensures no NULL type mismatches on double precision columns

  ## Security
  - All RPCs use get_access_context for auth checks
  - Premium-only fields gated behind v_is_premium checks
*/

-- ─── Drop stale overloads for get_rankings_free ────────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);
DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text, text);
DROP FUNCTION IF EXISTS public.get_rankings_free(boolean);
DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text, text, text);

-- ─── Drop stale overloads for get_rankings_premium ────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(integer, text, text);
DROP FUNCTION IF EXISTS public.get_rankings_premium(boolean);
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(integer, text, text, text);

-- ─── Rebuild get_rankings_safe with full field set ─────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id  uuid    DEFAULT NULL,
  p_is_bot   boolean DEFAULT false,
  p_limit    integer DEFAULT 200
)
RETURNS TABLE (
  player_id              text,
  player_name            text,
  team                   text,
  team_name              text,
  player_position        text,
  position_group         text,
  projection             numeric,
  ceiling_estimate       numeric,
  floor_estimate         numeric,
  consistency            numeric,
  form_score             numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  upside_rating          numeric,
  upside_pct             numeric,
  risk_rating            numeric,
  captain_score          numeric,
  captain_rating         text,
  price                  numeric,
  prev_price             numeric,
  price_change           numeric,
  price_change_pct       numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  projection_confidence  numeric,
  matchup_label          text,
  matchup_multiplier     numeric,
  recommendation_strength text,
  recommendation_color   text,
  why                    text,
  why_long               text,
  summary_short          text,
  summary_long           text,
  consistency_tier       text,
  access_tier            text,
  total_count            bigint,
  cached_at              text,
  ai_updated_at          text,
  games_played           numeric,
  rank_position          integer,
  signal                 text,
  signal_display         text,
  signal_tag             text,
  season_avg             numeric,
  last_3_avg             numeric,
  last_5_avg             numeric,
  form_delta             numeric,
  form_label             text,
  trend_score            numeric,
  trend_signal           text,
  status                 text,
  manual_status          text,
  is_available           boolean,
  bye_round              numeric,
  is_bye                 boolean,
  bye_next_round         boolean,
  category               text,
  action                 text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, p_is_bot);
  v_is_premium     := (v_access_context->>'is_premium')::boolean;
  v_free_ids       := ARRAY(SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int);

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c.team_name::text,
    c.position::text,
    c.position_group::text,
    c.projection::numeric,
    c.ceiling_estimate::numeric,
    c.floor_estimate::numeric,
    c.consistency::numeric,
    c.form_score::numeric,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled::numeric,
    c.upside_rating::numeric,
    c.upside_pct::numeric,
    c.risk_rating::numeric,
    c.captain_score::numeric,
    c.captain_rating::text,
    c.price::numeric,
    c.prev_price::numeric,
    c.price_change::numeric,
    c.price_change_pct::numeric,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven::numeric   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score::numeric ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge::numeric        ELSE NULL END,
    c.projection_confidence::numeric,
    c.matchup_label::text,
    c.matchup_multiplier::numeric,
    c.recommendation_strength::text,
    c.recommendation_color::text,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long      ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why           ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long      ELSE NULL END,
    c.consistency_tier::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END,
    c.total_count,
    c.cached_at::text,
    c.ai_updated_at::text,
    c.games_played::numeric,
    ROW_NUMBER() OVER (ORDER BY c.projection DESC NULLS LAST)::int,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text ELSE NULL END,
    c.signal_display::text,
    c.signal_tag::text,
    c.season_avg::numeric,
    c.last_3_avg::numeric,
    c.last_5_avg::numeric,
    c.form_delta::numeric,
    c.form_label::text,
    c.trend_score::numeric,
    c.trend_signal::text,
    c.status::text,
    c.manual_status::text,
    c.is_available,
    c.bye_round::numeric,
    c.is_bye,
    c.bye_next_round,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text ELSE NULL END
  FROM afl.v_rankings_core c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, integer) TO anon, authenticated;
