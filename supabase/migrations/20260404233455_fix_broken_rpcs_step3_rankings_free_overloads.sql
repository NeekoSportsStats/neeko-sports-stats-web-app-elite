/*
  # Fix get_rankings_free: Remove all stale field references

  ## Summary
  There are 3 overloads of get_rankings_free. Two reference dropped columns:
  - (p_limit, p_pos, p_sort_by) — references ai_recommendation, edge_score, edge_tier, start_sit_decision
  - (p_is_bot) — references ai_recommendation

  The (position_filter, sort_key, limit_n) overload is already clean.

  ## Changes
  - Overload (p_limit, p_pos, p_sort_by): replace ai_recommendation->signal, remove edge_score/edge_tier/start_sit_decision
  - Overload (p_is_bot): replace ai_recommendation->signal
  - sort key 'edge_score' mapped to 'edge' for backwards compatibility
*/

DROP FUNCTION IF EXISTS public.get_rankings_free(integer, text, text);

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  p_limit integer DEFAULT 100,
  p_pos text DEFAULT NULL,
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
  projection_confidence numeric,
  risk_rating text,
  matchup_rating numeric,
  upside_rating text,
  upside_pct numeric,
  captain_score numeric,
  captain_rating text,
  signal text,
  recommendation_color text,
  recommendation_short text,
  recommendation_strength text,
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
  cached_at timestamp with time zone,
  row_rank integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
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
      c.projection_confidence,
      c.risk_rating,
      c.matchup_rating,
      c.upside_rating,
      c.upside_pct,
      c.captain_score,
      c.captain_rating,
      c.signal,
      c.recommendation_color,
      c.recommendation_short,
      c.recommendation_strength,
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
            WHEN 'edge_score'    THEN c.edge
            WHEN 'edge'          THEN c.edge
            WHEN 'price'         THEN c.price::numeric
            ELSE                      c.neeko_rating
          END DESC NULLS LAST
      )::integer AS row_rank
    FROM afl.player_rankings_cache c
    WHERE
      (p_pos IS NULL OR c."position" = p_pos OR c.position_group = p_pos)
  )
  SELECT *
  FROM ranked
  WHERE row_rank <= p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(integer, text, text) TO anon, authenticated;


DROP FUNCTION IF EXISTS public.get_rankings_free(boolean);

CREATE OR REPLACE FUNCTION public.get_rankings_free(p_is_bot boolean DEFAULT false)
RETURNS TABLE(
  player_id integer,
  player_name text,
  team text,
  player_position text,
  price integer,
  projection_final numeric,
  neeko_rating numeric,
  summary_short text,
  signal text,
  recommendation_color text,
  is_locked boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_free_ids int[];
  v_limit int;
BEGIN
  SELECT get_free_player_ids() INTO v_free_ids;

  v_limit := COALESCE(
    (SELECT (config_value->'rankings'->>'free_full_rows')::int +
            (config_value->'rankings'->>'free_locked_preview_rows')::int
     FROM public.freemium_config
     WHERE config_key = 'ui_limits'),
    20
  );

  RETURN QUERY
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.price,
    c.projection_final,
    c.neeko_rating,

    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN c.summary_short
      WHEN c.summary_short IS NOT NULL THEN truncate_ai_text(c.summary_short, 'first_sentence')
      ELSE NULL
    END,

    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN c.signal
      ELSE NULL
    END,

    c.recommendation_color,

    CASE
      WHEN c.player_id = ANY(v_free_ids) THEN false
      ELSE true
    END

  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.neeko_rating DESC NULLS LAST
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(boolean) TO anon, authenticated;
