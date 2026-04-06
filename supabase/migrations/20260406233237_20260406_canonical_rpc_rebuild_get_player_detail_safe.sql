/*
  # Rebuild get_player_detail_safe on afl.v_rankings_core with canonical field names

  ## Summary
  Replaces the legacy get_player_detail_safe function that read from afl.player_rankings_cache
  directly (returning projection_final, edge_canonical, signal_canonical, summary_short, etc.)
  with a canonical version reading from afl.v_rankings_core.

  ## Changes
  - Drops all overloads of get_player_detail_safe
  - Rebuilds reading from afl.v_rankings_core (the canonical view)
  - RETURNS TABLE uses canonical field names: projection, signal, signal_display,
    breakeven, edge, value_score, why, why_long, avg_last_3, avg_last_5, bye_next_round
  - Removes legacy aliases: projection_final, edge_canonical, signal_canonical,
    category_canonical, action_canonical, value_score_canonical, summary_short, summary_long,
    recommendation_short, value_tag, value_tier, signal_tag, etc.
  - Uses get_access_context() for auth (modernised from direct stripe_subscriptions join)
  - Premium gating: projection, neeko_rating, signal, status free; all analytics premium
  - Adds missing fields: signal_display, avg_last_5, bye_next_round, is_injured

  ## Fields returned
  - player_id (integer), player_name, team, player_position, position_group
  - price, prev_price, price_change, price_change_pct
  - projection, projection_confidence, ceiling_estimate, floor_estimate
  - breakeven, value_score, edge, neeko_rating, neeko_rating_scaled
  - consistency, form_score, season_avg, avg_last_3, avg_last_5
  - matchup_label, captain_rating
  - signal, signal_display, category, action, why, why_long, recommendation_color
  - upside_pct, games_played, bye_round, bye_next_round, is_bye, is_injured
  - manual_status, status, is_locked

  ## Security
  - SECURITY DEFINER with SET search_path = public, afl
  - GRANT anon, authenticated, service_role
*/

DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);
DROP FUNCTION IF EXISTS public.get_player_detail_safe(text);

CREATE OR REPLACE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  team                  text,
  team_name             text,
  player_position       text,
  position_group        text,
  price                 numeric,
  prev_price            numeric,
  price_change          numeric,
  price_change_pct      numeric,
  projection            numeric,
  projection_confidence numeric,
  ceiling_estimate      numeric,
  floor_estimate        numeric,
  breakeven             numeric,
  value_score           numeric,
  edge                  numeric,
  neeko_rating          numeric,
  neeko_rating_scaled   numeric,
  consistency           numeric,
  form_score            numeric,
  season_avg            numeric,
  avg_last_3            numeric,
  avg_last_5            numeric,
  matchup_label         text,
  captain_rating        text,
  signal                text,
  signal_display        text,
  category              text,
  action                text,
  why                   text,
  why_long              text,
  recommendation_color  text,
  upside_pct            numeric,
  games_played          numeric,
  bye_round             numeric,
  bye_next_round        boolean,
  is_bye                boolean,
  is_injured            boolean,
  manual_status         text,
  status                text,
  is_locked             boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_ctx        jsonb;
  v_is_premium boolean := false;
  v_is_admin   boolean := false;
BEGIN
  v_ctx        := get_access_context(p_user_id, false);
  v_is_premium := COALESCE((v_ctx->>'is_premium')::boolean, false);

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = p_user_id AND pr.is_admin = true
    ), false) INTO v_is_admin;
  END IF;

  RETURN QUERY
  SELECT
    c.player_id::integer,
    c.player_name,
    c.team,
    c.team                                                                   AS team_name,
    c."position"::text                                                       AS player_position,
    c.position_group::text,
    c.price::numeric,
    c.prev_price::numeric,
    c.price_change::numeric,
    c.price_change_pct::numeric,
    c.projection::numeric,
    CASE WHEN v_is_premium OR v_is_admin THEN c.projection_confidence::numeric ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ceiling_estimate::numeric      ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.floor_estimate::numeric        ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.breakeven::numeric             ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_score::numeric           ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.edge::numeric                  ELSE NULL END,
    c.neeko_rating::numeric,
    c.neeko_rating_scaled::numeric,
    c.consistency::numeric,
    CASE WHEN v_is_premium OR v_is_admin THEN c.form_score::numeric            ELSE NULL END,
    c.season_avg::numeric,
    c.last_3_avg::numeric                                                    AS avg_last_3,
    CASE WHEN v_is_premium OR v_is_admin THEN c.last_5_avg::numeric            ELSE NULL END AS avg_last_5,
    c.matchup_label,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_rating                 ELSE NULL END,
    c.signal,
    c.signal_display,
    c.category,
    c.action,
    -- why = summary_short exposed to all; why_long = summary_long premium-gated
    c.why,
    CASE WHEN v_is_premium OR v_is_admin THEN c.why_long                       ELSE NULL END,
    c.recommendation_color,
    CASE WHEN v_is_premium OR v_is_admin THEN c.upside_pct::numeric            ELSE NULL END,
    c.games_played::numeric,
    c.bye_round::numeric,
    c.bye_next_round,
    c.is_bye,
    c.is_injured,
    c.manual_status,
    c.status,
    NOT (v_is_premium OR v_is_admin)                                         AS is_locked
  FROM afl.v_rankings_core c
  WHERE c.player_name ILIKE p_player_name
  ORDER BY c.projection DESC NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO anon, authenticated, service_role;
