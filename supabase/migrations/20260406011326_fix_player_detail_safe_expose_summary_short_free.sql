/*
  # Fix get_player_detail_safe: expose summary_short to free users

  ## Summary
  summary_short is a single-sentence AI snippet (the only AI content in the DB).
  Previously it was premium-gated, meaning free users saw no AI content at all.
  This fix exposes summary_short to all users and keeps summary_long gated.

  Also fixes value_score_canonical being aliased incorrectly in the SELECT list.

  ## Changes
  - summary_short: now returned for ALL users (free and premium)
  - summary_long, recommendation_short, ai_summary: remain premium-only
  - No structural changes to table or access control logic
*/

DROP FUNCTION IF EXISTS public.get_player_detail_safe(text, uuid);

CREATE OR REPLACE FUNCTION public.get_player_detail_safe(
  p_player_name text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  player_id                integer,
  player_name              text,
  team                     text,
  team_name                text,
  player_position          text,
  position_group           text,
  price                    integer,
  prev_price               integer,
  price_change             integer,
  price_change_pct         numeric,
  projection_final         numeric,
  projection_confidence    double precision,
  ceiling                  double precision,
  floor                    double precision,
  ceiling_estimate         double precision,
  floor_estimate           double precision,
  consistency              double precision,
  consistency_score        double precision,
  form_score               double precision,
  neeko_rating             double precision,
  neeko_rating_scaled      double precision,
  value_score              double precision,
  best_value_score         double precision,
  value_tag                text,
  value_tier               text,
  signal                   text,
  signal_tag               text,
  edge_canonical           numeric,
  breakeven_canonical      numeric,
  value_score_canonical    numeric,
  signal_canonical         text,
  category_canonical       text,
  action_canonical         text,
  breakeven                numeric,
  trend_signal             text,
  form_label               text,
  form_delta               numeric,
  season_avg               numeric,
  last_3_avg               numeric,
  matchup_rating           text,
  matchup_label            text,
  matchup_multiplier       numeric,
  captain_rating           text,
  captain_score            double precision,
  risk_rating              double precision,
  upside_pct               double precision,
  upside_rating            double precision,
  summary_short            text,
  summary_long             text,
  recommendation_short     text,
  recommendation_color     text,
  ai_recommendation        text,
  ai_summary               text,
  games_played             integer,
  bye_round                integer,
  is_bye                   boolean,
  manual_status            text,
  status                   text,
  is_available             boolean,
  is_locked                boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_is_premium boolean := false;
  v_is_admin   boolean := false;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT
      COALESCE(
        EXISTS (
          SELECT 1 FROM public.stripe_subscriptions ss
          WHERE ss.user_id = p_user_id
            AND ss.status IN ('active', 'trialing')
        ),
        false
      ) OR COALESCE(
        EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.id = p_user_id
            AND pr.manual_premium = true
        ),
        false
      )
    INTO v_is_premium;

    SELECT COALESCE(
      EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = p_user_id
          AND pr.is_admin = true
      ),
      false
    ) INTO v_is_admin;
  END IF;

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c.position                                         AS player_position,
    c.position_group,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.projection_final,
    CASE WHEN v_is_premium OR v_is_admin THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ceiling              ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.floor                ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ceiling_estimate     ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.floor_estimate       ELSE NULL END,
    c.consistency,
    c.consistency                                      AS consistency_score,
    CASE WHEN v_is_premium OR v_is_admin THEN c.form_score           ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_score          ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.best_value_score     ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_tag            ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.value_tier           ELSE NULL END,
    c.signal,
    c.signal_tag,
    c.edge_canonical,
    c.breakeven_canonical,
    c.value_score_canonical,
    c.signal_canonical,
    c.category_canonical,
    c.action_canonical,
    CASE WHEN v_is_premium OR v_is_admin THEN c.breakeven_canonical  ELSE NULL END AS breakeven,
    c.trend_signal,
    c.form_label,
    c.form_delta,
    c.season_avg,
    c.last_3_avg,
    c.matchup_rating,
    c.matchup_label,
    c.matchup_multiplier,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_rating       ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.captain_score        ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.risk_rating          ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.upside_pct           ELSE NULL END,
    c.upside_rating,
    -- summary_short exposed to all users (it is the hook, not the full analysis)
    c.summary_short,
    -- deep AI content remains premium-gated
    CASE WHEN v_is_premium OR v_is_admin THEN c.summary_long         ELSE NULL END,
    CASE WHEN v_is_premium OR v_is_admin THEN c.recommendation_short ELSE NULL END,
    c.recommendation_color,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ai_summary           ELSE NULL END AS ai_recommendation,
    CASE WHEN v_is_premium OR v_is_admin THEN c.ai_summary           ELSE NULL END AS ai_summary,
    c.games_played,
    c.bye_round,
    c.is_bye,
    c.manual_status,
    c.status,
    c.is_available,
    NOT (v_is_premium OR v_is_admin)                   AS is_locked
  FROM afl.player_rankings_cache c
  WHERE c.player_name ILIKE p_player_name
  ORDER BY c.projection_final DESC NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO authenticated, anon;
