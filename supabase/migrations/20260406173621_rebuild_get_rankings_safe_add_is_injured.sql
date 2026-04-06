/*
  # Rebuild get_rankings_safe — add is_injured field

  ## Changes
  - Adds is_injured boolean to the return type
  - Rankings page receives all players (no is_injured filter at DB level)
  - Market Watch / Edge Board / Current Round apply their own filters

  ## Security
  - SECURITY DEFINER with get_access_context for auth
*/

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
  is_injured             boolean,
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
    c.projection,
    c.ceiling_estimate,
    c.floor_estimate,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.upside_rating,
    c.upside_pct,
    c.risk_rating,
    c.captain_score,
    c.captain_rating::text,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven    ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score  ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge         ELSE NULL END,
    c.projection_confidence,
    c.matchup_label::text,
    c.matchup_multiplier,
    c.recommendation_strength::text,
    c.recommendation_color::text,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long     ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_short ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_long  ELSE NULL END,
    c.consistency_tier::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                         'locked'::text
    END,
    c.total_count,
    c.cached_at::text,
    c.ai_updated_at::text,
    c.games_played,
    ROW_NUMBER() OVER (ORDER BY c.projection DESC NULLS LAST)::int,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text ELSE NULL END,
    c.signal_display::text,
    c.signal_tag::text,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    c.form_delta,
    c.form_label::text,
    c.trend_score,
    c.trend_signal::text,
    c.status::text,
    c.manual_status::text,
    c.is_available,
    c.bye_round,
    c.is_bye,
    c.bye_next_round,
    c.is_injured,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text ELSE NULL END
  FROM afl.v_rankings_core c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, integer) TO anon, authenticated;
