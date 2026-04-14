/*
  # Phase 7: Expose new canonical fields via v_rankings_unified and get_rankings_safe

  ## New fields added
  - decision_score       — composite z-score (5-factor weighted)
  - confidence_score_100 — 6-component confidence 0–100
  - confidence_percentile — percentile rank of confidence
  - action_display       — human label (Strong Start / Start / Hold / Sit / Hard Sit)
  - value_band           — percentile tier (Elite/Strong/Fair/Thin/Poor Value)
  - action_reason_1/2    — deterministic reason strings for action
  - confidence_reason_1/2 — deterministic reason strings for confidence

  ## Gating
  - decision_score, action_display, value_band: premium or free-tier players
  - reason fields: premium only
  - confidence fields: premium or free-tier players
*/

-- ─── Step 1: Rebuild v_rankings_unified ──────────────────────────────────────
DROP VIEW IF EXISTS afl.v_rankings_unified;

CREATE VIEW afl.v_rankings_unified AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  team_id,
  "position",
  position_group,
  price,
  prev_price,
  price_change,
  price_change_pct,
  projection_final,
  projection_final                        AS projection,
  projection_confidence,
  confidence_tier,
  season_avg,
  last_3_avg,
  last_5_avg,
  ceiling_estimate,
  floor_estimate,
  breakeven_canonical,
  breakeven_canonical                     AS breakeven,
  edge_canonical,
  edge_canonical                          AS edge,
  edge_canonical                          AS value_score,
  signal_canonical,
  signal_canonical                        AS signal,
  signal_canonical                        AS signal_tag,
  signal_display,
  category_canonical,
  category_canonical                      AS category,
  action_canonical,
  action_canonical                        AS action,
  action_display,
  trend_score,
  trend_signal,
  form_score,
  form_delta,
  form_label,
  neeko_rating,
  neeko_rating                            AS neeko_rating_scaled,
  consistency,
  consistency_tier,
  upside_rating,
  upside_pct,
  risk_rating,
  captain_score,
  captain_rating,
  matchup_label,
  matchup_multiplier,
  summary_short,
  summary_short                           AS why,
  summary_long,
  summary_long                            AS why_long,
  recommendation_short,
  recommendation_color,
  recommendation_strength,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  games_played,
  UPPER(COALESCE(manual_status, status, '')) = ANY(ARRAY['INJURED','OUT','OMITTED']) AS is_injured,
  cached_at,
  ai_updated_at,
  ai_validation_passed,
  total_count,
  -- New elite signal fields
  decision_score,
  confidence_score_100,
  confidence_percentile,
  value_band,
  action_reason_1,
  action_reason_2,
  confidence_reason_1,
  confidence_reason_2
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL
  AND projection_final > 30;

GRANT SELECT ON afl.v_rankings_unified TO authenticated, anon;

-- ─── Step 2: Rebuild get_rankings_safe RPC ───────────────────────────────────
DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   integer DEFAULT 200
)
RETURNS TABLE(
  player_id              text,
  player_name            text,
  team                   text,
  team_name              text,
  "position"             text,
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
  action                 text,
  -- New elite signal fields
  action_display         text,
  decision_score         numeric,
  confidence_score_100   numeric,
  confidence_percentile  numeric,
  value_band             text,
  action_reason_1        text,
  action_reason_2        text,
  confidence_reason_1    text,
  confidence_reason_2    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    -- New elite signal fields (premium or free-tier gated)
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action_display::text   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.decision_score         ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_score_100   ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.confidence_percentile  ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_band::text       ELSE NULL END,
    -- Reason fields: premium only
    CASE WHEN v_is_premium                                        THEN c.action_reason_1::text  ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.action_reason_2::text  ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.confidence_reason_1::text ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.confidence_reason_2::text ELSE NULL END
  FROM afl.v_rankings_unified c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, integer) TO authenticated, anon;
