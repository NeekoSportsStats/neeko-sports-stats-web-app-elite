/*
  # Step 6 — Rebuild get_rankings_premium and get_position_players_safe

  Removes ai_recommendation from both RPCs.
  Replaces with summary_short / why fields.
*/

-- ============================================================
-- get_rankings_premium  (drop all overloads first)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  position_filter text DEFAULT 'ALL',
  sort_key        text DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  player_team           text,
  player_position       text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      numeric,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
  ceiling_estimate      double precision,
  consistency           double precision,
  form_score            double precision,
  price                 integer,
  value_score           double precision,
  best_value_score      double precision,
  projection_confidence double precision,
  risk_rating           double precision,
  matchup_rating        text,
  upside_rating         double precision,
  captain_score         double precision,
  captain_rating        text,
  why                   text,
  recommendation_why    text,
  recommendation_short  text,
  recommendation_color  text,
  ai_summary            text,
  ai_updated_at         timestamp with time zone,
  value_tag             text,
  value_tier            text,
  consistency_tier      text,
  total_count           integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
SELECT
  c.player_id,
  c.player_name,
  c.team            AS player_team,
  c.position        AS player_position,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling_estimate,
  c.consistency,
  c.form_score,
  c.price,
  c.value_score,
  c.best_value_score,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  COALESCE(c.summary_short, c.recommendation_short) AS why,
  c.recommendation_why,
  c.recommendation_short,
  c.recommendation_color,
  c.ai_summary,
  c.ai_updated_at,
  c.value_tag,
  c.value_tier,
  c.consistency_tier,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (position_filter = 'ALL' OR c.position = position_filter)
ORDER BY
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision END DESC NULLS LAST,
  CASE WHEN sort_key = 'value_score'           THEN c.value_score                        END DESC NULLS LAST,
  CASE WHEN sort_key = 'best_value_score'      THEN c.best_value_score                   END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence               END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating                        END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(text, text, integer) TO authenticated, service_role;


-- ============================================================
-- get_position_players_safe
-- ============================================================
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_position_players_safe(
  p_position_code text,
  p_user_id       uuid DEFAULT NULL,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  player_position       text,
  neeko_rating          numeric,
  projection_final      numeric,
  projection_confidence numeric,
  value_score           numeric,
  price                 integer,
  why                   text,
  upside_pct            numeric,
  is_locked             boolean,
  signal                text,
  edge                  numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean := false;
  v_free_ids   int[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN is_manual_premium = true THEN true
        WHEN subscription_status IN ('active', 'trialing') THEN true
        ELSE false
      END INTO v_is_premium
    FROM public.profiles
    WHERE id = p_user_id;
  END IF;

  SELECT get_free_player_ids() INTO v_free_ids;

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.neeko_rating::numeric,
    c.projection_final,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.value_score ELSE NULL END::numeric,
    c.price,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.summary_short, c.recommendation_short) ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.upside_pct ELSE NULL END::numeric,
    CASE WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN false ELSE true END,
    c.signal,
    c.edge
  FROM afl.player_rankings_cache c
  WHERE c."position" = p_position_code
    AND c.player_id IS NOT NULL
    AND c.projection_final IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_position_players_safe(text, uuid, integer) TO anon, authenticated, service_role;
