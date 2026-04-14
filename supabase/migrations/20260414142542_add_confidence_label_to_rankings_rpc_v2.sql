/*
  # Add confidence_label to v_rankings_unified and get_rankings_safe RPC

  ## Summary
  The confidence_label column (HIGH/MEDIUM/LOW) exists in afl.player_rankings_cache
  but was missing from the canonical view and RPC that feeds the frontend.

  ## Changes
  1. Drop and recreate afl.v_rankings_unified to include confidence_label
  2. Drop and recreate get_rankings_safe to include confidence_label in return type and SELECT

  ## Security
  No RLS changes. confidence_label is gated same as confidence_score_100 (premium or free-tier).
*/

-- Step 1: Drop and recreate v_rankings_unified with confidence_label included
DROP VIEW IF EXISTS afl.v_rankings_unified CASCADE;

CREATE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,
  price::numeric AS price,
  prev_price::numeric AS prev_price,
  price_change::numeric AS price_change,
  price_change_pct,
  projection_final,
  projection_final AS projection,
  projection_confidence::numeric AS projection_confidence,
  confidence_tier,
  confidence_label,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate::numeric AS ceiling_estimate,
  floor_estimate::numeric AS floor_estimate,
  breakeven_canonical,
  breakeven_canonical AS breakeven,
  edge_canonical,
  edge_canonical AS edge,
  edge_canonical AS value_score,
  signal_canonical,
  signal_canonical AS signal,
  signal_canonical AS signal_tag,
  signal_display,
  category_canonical,
  category_canonical AS category,
  action_canonical,
  action_canonical AS action,
  action_display,
  trend_score,
  trend_signal,
  form_score::numeric AS form_score,
  form_delta,
  form_label,
  neeko_rating::numeric AS neeko_rating,
  neeko_rating::numeric AS neeko_rating_scaled,
  consistency::numeric AS consistency,
  consistency_tier,
  upside_rating::numeric AS upside_rating,
  upside_pct::numeric AS upside_pct,
  risk_rating::numeric AS risk_rating,
  captain_score::numeric AS captain_score,
  captain_rating,
  matchup_label,
  matchup_multiplier,
  summary_short,
  summary_short AS why,
  summary_long,
  summary_long AS why_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round::numeric AS bye_round,
  bye_next_round,
  games_played::numeric AS games_played,
  upper(COALESCE(manual_status, status, '')) = ANY (ARRAY['INJURED', 'OUT', 'OMITTED']) AS is_injured,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  total_count::bigint AS total_count,
  decision_score,
  confidence_score_100,
  confidence_percentile,
  value_band,
  action_reason_1,
  action_reason_2,
  confidence_reason_1,
  confidence_reason_2
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL AND projection_final > 30;

GRANT SELECT ON afl.v_rankings_unified TO authenticated, anon, service_role;

-- Step 2: Drop and recreate get_rankings_safe with confidence_label in return type and SELECT
DROP FUNCTION IF EXISTS get_rankings_safe(uuid, boolean, integer);

CREATE FUNCTION get_rankings_safe(
  p_user_id  uuid,
  p_is_bot   boolean,
  p_limit    integer DEFAULT 100
)
RETURNS TABLE (
  player_id              text,
  player_name            text,
  team                   text,
  team_name              text,
  "position"             text,
  position_group         text,
  projection             double precision,
  ceiling_estimate       double precision,
  floor_estimate         double precision,
  consistency            double precision,
  form_score             double precision,
  neeko_rating           double precision,
  neeko_rating_scaled    double precision,
  upside_rating          double precision,
  upside_pct             double precision,
  risk_rating            double precision,
  captain_score          double precision,
  captain_rating         text,
  price                  integer,
  prev_price             integer,
  price_change           integer,
  price_change_pct       numeric,
  breakeven              numeric,
  value_score            double precision,
  edge                   double precision,
  projection_confidence  double precision,
  matchup_label          text,
  matchup_multiplier     double precision,
  recommendation_strength text,
  recommendation_color   text,
  why                    text,
  why_long               text,
  summary_short          text,
  summary_long           text,
  consistency_tier       text,
  access_tier            text,
  total_count            integer,
  cached_at              text,
  ai_updated_at          text,
  games_played           integer,
  rank_position          integer,
  signal                 text,
  signal_display         text,
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
  bye_round              integer,
  is_bye                 boolean,
  bye_next_round         boolean,
  is_injured             boolean,
  category               text,
  action                 text,
  action_display         text,
  decision_score         numeric,
  confidence_score_100   numeric,
  confidence_percentile  numeric,
  value_band             text,
  action_reason_1        text,
  action_reason_2        text,
  confidence_reason_1    text,
  confidence_reason_2    text,
  confidence_label       text
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
    c."position"::text,
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
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven              ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score            ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge                  ELSE NULL END,
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
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long               ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_short          ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.summary_long           ELSE NULL END,
    c.consistency_tier::text,
    CASE
      WHEN v_is_premium                        THEN 'premium'::text
      WHEN c.player_id::int = ANY(v_free_ids)  THEN 'free'::text
      ELSE                                          'locked'::text
    END,
    c.total_count,
    c.cached_at::text,
    c.ai_updated_at::text,
    c.games_played,
    ROW_NUMBER() OVER (ORDER BY c.projection DESC NULLS LAST)::int,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.signal::text           ELSE NULL END,
    c.signal_display::text,
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
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text           ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action_display::text   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.decision_score         ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_score_100   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_percentile  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_band::text       ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_1::text  ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_2::text  ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.confidence_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.confidence_reason_2::text ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_label::text ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_rankings_safe(uuid, boolean, integer) TO anon, authenticated;
