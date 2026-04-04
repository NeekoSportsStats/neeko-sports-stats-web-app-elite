/*
  # Fix get_rankings_premium: Remove all stale field references

  ## Summary
  Two of three overloads of get_rankings_premium reference dropped columns:
  - (p_position, p_team, p_sort_by, p_limit, p_offset) — references ai_recommendation
  - (p_limit, p_pos, p_team, p_sort_by) — references ai_recommendation, start_sit_decision, edge_score, edge_tier

  ## Changes
  - Overload (p_position, p_team, p_sort_by, p_limit, p_offset): replace ai_recommendation->signal
  - Overload (p_limit, p_pos, p_team, p_sort_by): replace all stale fields with canonical equivalents
  - sort key 'edge_score' mapped to 'edge' for backwards compatibility
*/

DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  p_position text DEFAULT NULL,
  p_team text DEFAULT NULL,
  p_sort_by text DEFAULT 'neeko_rating',
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  player_id integer,
  player_name text,
  player_team text,
  player_position text,
  position_group text,
  neeko_rating double precision,
  projection_final numeric,
  projection double precision,
  ceiling double precision,
  floor double precision,
  ceiling_estimate double precision,
  consistency double precision,
  form_score double precision,
  price integer,
  value_score double precision,
  best_value_score double precision,
  projection_confidence double precision,
  risk_rating double precision,
  matchup_rating text,
  upside_rating double precision,
  captain_score double precision,
  captain_rating text,
  signal text,
  recommendation_why text,
  recommendation_short text,
  recommendation_color text,
  ai_summary text,
  ai_updated_at timestamp with time zone,
  value_tag text,
  value_tier text,
  consistency_tier text,
  confidence_label text,
  total_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
SELECT
  c.player_id,
  c.player_name,
  c.team              AS player_team,
  c."position"        AS player_position,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling           AS ceiling_estimate,
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
  c.signal,
  c.recommendation_why,
  c.recommendation_short,
  c.recommendation_color,
  c.ai_summary,
  c.ai_updated_at,
  c.value_tag,
  c.value_tier,
  c.consistency_tier,
  c.confidence_label,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (p_position IS NULL OR c.position_group = p_position)
AND   (p_team     IS NULL OR c.team           = p_team)
ORDER BY
  CASE WHEN p_sort_by = 'neeko_rating'          THEN c.neeko_rating          END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'projection'            THEN c.projection_final      END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'value_score'           THEN c.value_score           END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'captain_score'         THEN c.captain_score         END DESC NULLS LAST,
  CASE WHEN p_sort_by = 'projection_confidence' THEN c.projection_confidence END DESC NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT  p_limit
OFFSET p_offset;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(text, text, text, integer, integer) TO anon, authenticated;


DROP FUNCTION IF EXISTS public.get_rankings_premium(integer, text, text, text);

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  p_limit integer DEFAULT 200,
  p_pos text DEFAULT NULL,
  p_team text DEFAULT NULL,
  p_sort_by text DEFAULT 'neeko_rating'
)
RETURNS TABLE(
  player_id uuid,
  player_name text,
  team text,
  team_name text,
  pos text,
  position_group text,
  projection_final numeric,
  projection numeric,
  ceiling numeric,
  floor_val numeric,
  consistency numeric,
  form_score numeric,
  neeko_rating numeric,
  price integer,
  prev_price integer,
  price_change integer,
  price_change_pct numeric,
  value_score numeric,
  best_value_score numeric,
  value_tag text,
  value_tier text,
  signal text,
  summary text,
  projection_confidence numeric,
  risk_rating text,
  matchup_rating numeric,
  upside_rating text,
  upside_pct numeric,
  captain_score numeric,
  captain_rating text,
  recommendation_color text,
  recommendation_short text,
  recommendation_why text,
  recommendation_strength text,
  ai_summary text,
  ai_updated_at timestamp with time zone,
  consistency_tier text,
  games_played integer,
  matchup_label text,
  edge numeric,
  signal_tag text,
  market_watch_category text,
  confidence_label text,
  status text,
  is_available boolean,
  total_count integer,
  cached_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position"         AS pos,
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
    c.recommendation_color,
    c.recommendation_short,
    c.recommendation_why,
    c.recommendation_strength,
    c.ai_summary,
    c.ai_updated_at,
    c.consistency_tier,
    c.games_played,
    c.matchup_label,
    c.edge,
    c.signal_tag,
    c.market_watch_category,
    c.confidence_label,
    c.status,
    c.is_available,
    c.total_count,
    c.cached_at
  FROM afl.player_rankings_cache c
  WHERE
    (p_pos  IS NULL OR c."position" = p_pos OR c.position_group = p_pos)
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
      WHEN 'edge_score'      THEN c.edge
      WHEN 'edge'            THEN c.edge
      WHEN 'price'           THEN c.price::numeric
      ELSE                        c.neeko_rating
    END DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(integer, text, text, text) TO anon, authenticated;
