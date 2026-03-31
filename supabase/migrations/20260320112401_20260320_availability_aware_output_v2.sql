/*
  # Availability-Aware Output System — Phase 2

  ## Summary
  Completes availability-aware outputs:
  1. get_rankings_premium() — adds is_available DESC as first sort key (OUT players float to bottom)
  2. get_rankings_free() — same is_available DESC sort priority
  3. search_available_players() — new RPC for Start/Sit player selector that only returns available players

  ## Rules applied
  - Rankings show ALL players but is_available players sort first
  - Start/Sit selector only returns is_available = true players
  - Edge, Market Watch, Signals — already availability-filtered in prior migrations
*/

-- ============================================================
-- 1. Rebuild get_rankings_premium() with is_available priority sort
-- ============================================================
DROP FUNCTION IF EXISTS public.get_rankings_premium(integer, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(integer, text, text, text);
DROP FUNCTION IF EXISTS public.get_rankings_premium();

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  p_limit      integer DEFAULT 200,
  p_pos        text    DEFAULT NULL,
  p_team       text    DEFAULT NULL,
  p_sort_by    text    DEFAULT 'neeko_rating'
)
RETURNS TABLE (
  player_id              uuid,
  player_name            text,
  team                   text,
  team_name              text,
  pos                    text,
  position_group         text,
  projection_final       numeric,
  projection             numeric,
  ceiling                numeric,
  floor_val              numeric,
  consistency            numeric,
  form_score             numeric,
  neeko_rating           numeric,
  price                  integer,
  prev_price             integer,
  price_change           integer,
  price_change_pct       numeric,
  value_score            numeric,
  best_value_score       numeric,
  value_tag              text,
  value_tier             text,
  signal                 text,
  summary                text,
  projection_confidence  numeric,
  risk_rating            text,
  matchup_rating         numeric,
  upside_rating          text,
  upside_pct             numeric,
  captain_score          numeric,
  captain_rating         text,
  ai_recommendation      text,
  recommendation_color   text,
  recommendation_short   text,
  recommendation_why     text,
  recommendation_strength text,
  ai_summary             text,
  ai_updated_at          timestamptz,
  consistency_tier       text,
  games_played           integer,
  matchup_label          text,
  start_sit_decision     text,
  edge_score             numeric,
  edge_tier              text,
  market_watch_category  text,
  confidence_label       text,
  status                 text,
  is_available           boolean,
  total_count            integer,
  cached_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c.position           AS pos,
    c.position_group,
    c.projection_final,
    c.projection,
    c.ceiling,
    c.floor              AS floor_val,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.value_score,
    c.best_value_score,
    c.value_tag,
    c.value_tier,
    c.signal,
    c.summary,
    c.projection_confidence,
    c.risk_rating,
    c.matchup_rating,
    c.upside_rating,
    c.upside_pct,
    c.captain_score,
    c.captain_rating,
    c.ai_recommendation,
    c.recommendation_color,
    c.recommendation_short,
    c.recommendation_why,
    c.recommendation_strength,
    c.ai_summary,
    c.ai_updated_at,
    c.consistency_tier,
    c.games_played,
    c.matchup_label,
    c.start_sit_decision,
    c.edge_score,
    c.edge_tier,
    c.market_watch_category,
    c.confidence_label,
    c.status,
    c.is_available,
    c.total_count,
    c.cached_at
  FROM afl.player_rankings_cache c
  WHERE
    (p_pos  IS NULL OR c.position = p_pos OR c.position_group = p_pos)
    AND (p_team IS NULL OR c.team = p_team OR c.team_name = p_team)
  ORDER BY
    COALESCE(c.is_available, true) DESC,
    CASE p_sort_by
      WHEN 'neeko_rating'    THEN c.neeko_rating
      WHEN 'projection'      THEN c.projection_final
      WHEN 'value_score'     THEN c.best_value_score
      WHEN 'captain_score'   THEN c.captain_score
      WHEN 'form_score'      THEN c.form_score
      WHEN 'consistency'     THEN c.consistency
      WHEN 'edge_score'      THEN c.edge_score
      WHEN 'price'           THEN c.price::numeric
      ELSE                        c.neeko_rating
    END DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(integer, text, text, text) TO anon, authenticated;

-- ============================================================
-- 2. Rebuild get_rankings_free() with is_available priority sort
-- ============================================================
DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text, text, text);
DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text, text);
DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text);
DROP FUNCTION IF EXISTS public.get_rankings_free(integer);
DROP FUNCTION IF EXISTS public.get_rankings_free();

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  p_limit   integer DEFAULT 100,
  p_pos     text    DEFAULT NULL,
  p_sort_by text    DEFAULT 'neeko_rating'
)
RETURNS TABLE (
  player_id              uuid,
  player_name            text,
  team                   text,
  team_name              text,
  pos                    text,
  position_group         text,
  projection_final       numeric,
  projection             numeric,
  ceiling                numeric,
  floor_val              numeric,
  consistency            numeric,
  form_score             numeric,
  neeko_rating           numeric,
  price                  integer,
  prev_price             integer,
  price_change           integer,
  price_change_pct       numeric,
  value_score            numeric,
  best_value_score       numeric,
  value_tag              text,
  value_tier             text,
  projection_confidence  numeric,
  risk_rating            text,
  matchup_rating         numeric,
  upside_rating          text,
  upside_pct             numeric,
  captain_score          numeric,
  captain_rating         text,
  ai_recommendation      text,
  recommendation_color   text,
  recommendation_short   text,
  recommendation_strength text,
  consistency_tier       text,
  games_played           integer,
  matchup_label          text,
  start_sit_decision     text,
  edge_score             numeric,
  edge_tier              text,
  market_watch_category  text,
  confidence_label       text,
  status                 text,
  is_available           boolean,
  total_count            integer,
  cached_at              timestamptz,
  row_rank               integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      c.player_id,
      c.player_name,
      c.team,
      c.team_name,
      c.position           AS pos,
      c.position_group,
      c.projection_final,
      c.projection,
      c.ceiling,
      c.floor              AS floor_val,
      c.consistency,
      c.form_score,
      c.neeko_rating,
      c.price,
      c.prev_price,
      c.price_change,
      c.price_change_pct,
      c.value_score,
      c.best_value_score,
      c.value_tag,
      c.value_tier,
      c.projection_confidence,
      c.risk_rating,
      c.matchup_rating,
      c.upside_rating,
      c.upside_pct,
      c.captain_score,
      c.captain_rating,
      c.ai_recommendation,
      c.recommendation_color,
      c.recommendation_short,
      c.recommendation_strength,
      c.consistency_tier,
      c.games_played,
      c.matchup_label,
      c.start_sit_decision,
      c.edge_score,
      c.edge_tier,
      c.market_watch_category,
      c.confidence_label,
      c.status,
      c.is_available,
      c.total_count,
      c.cached_at,
      ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(c.is_available, true) DESC,
          CASE p_sort_by
            WHEN 'neeko_rating'  THEN c.neeko_rating
            WHEN 'projection'    THEN c.projection_final
            WHEN 'value_score'   THEN c.best_value_score
            WHEN 'captain_score' THEN c.captain_score
            WHEN 'form_score'    THEN c.form_score
            WHEN 'consistency'   THEN c.consistency
            WHEN 'edge_score'    THEN c.edge_score
            WHEN 'price'         THEN c.price::numeric
            ELSE                      c.neeko_rating
          END DESC NULLS LAST
      )::integer AS row_rank
    FROM afl.player_rankings_cache c
    WHERE
      (p_pos IS NULL OR c.position = p_pos OR c.position_group = p_pos)
  )
  SELECT *
  FROM ranked
  WHERE row_rank <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(integer, text, text) TO anon, authenticated;

-- ============================================================
-- 3. Create search_available_players() RPC for Start/Sit selector
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_available_players(
  p_query   text,
  p_limit   integer DEFAULT 10
)
RETURNS TABLE (
  player_id         uuid,
  player_name       text,
  team              text,
  player_pos        text,
  projection_final  numeric,
  neeko_rating      numeric,
  is_available      boolean,
  status            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.position          AS player_pos,
    c.projection_final,
    c.neeko_rating,
    COALESCE(c.is_available, true) AS is_available,
    c.status
  FROM afl.player_rankings_cache c
  WHERE
    c.player_id IS NOT NULL
    AND c.player_name ILIKE '%' || p_query || '%'
    AND COALESCE(c.is_available, true) = true
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_available_players(text, integer) TO anon, authenticated;
