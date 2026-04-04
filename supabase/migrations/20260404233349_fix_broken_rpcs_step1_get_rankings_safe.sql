/*
  # Fix get_rankings_safe: Remove start_sit_decision

  ## Summary
  Drops and rebuilds get_rankings_safe removing start_sit_decision from RETURNS TABLE
  and SELECT body. Frontend derives start/sit from signal only.

  ## Changes
  - Removed: start_sit_decision from RETURNS TABLE and SELECT
  - Retained: signal, signal_tag, edge, baseline, season_avg, last_3_avg, value_score
  - All other columns preserved as-is
*/

DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_safe(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  player_id integer,
  player_name text,
  team text,
  team_name text,
  "position" text,
  position_group text,
  projection_final numeric,
  ceiling double precision,
  floor double precision,
  consistency double precision,
  form_score double precision,
  neeko_rating double precision,
  neeko_rating_scaled double precision,
  price integer,
  prev_price integer,
  price_change integer,
  price_change_pct numeric,
  breakeven numeric,
  value_score double precision,
  best_value_score double precision,
  value_tag text,
  value_tier text,
  projection_confidence double precision,
  risk_rating double precision,
  matchup_rating text,
  matchup_label text,
  matchup_multiplier numeric,
  recommendation_strength text,
  recommendation_color text,
  why text,
  long text,
  ai_summary text,
  consistency_tier text,
  access_tier text,
  total_count integer,
  cached_at timestamp with time zone,
  games_played integer,
  row_rank integer,
  signal text,
  signal_tag text,
  edge numeric,
  baseline numeric,
  season_avg numeric,
  last_3_avg numeric,
  value numeric,
  upside_pct double precision,
  market_watch_category text,
  status text,
  manual_status text,
  is_available boolean,
  bye_round integer,
  is_bye boolean,
  bye_next_round boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
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
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.position_group,

    c.projection_final,
    c.ceiling,
    c.floor,

    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,

    c.price,
    c.prev_price,
    c.price_change,
    c.price_change_pct,
    c.breakeven,
    c.value_score::double precision,
    c.best_value_score,
    c.value_tag,
    c.value_tier,

    c.projection_confidence,
    c.risk_rating,
    c.matchup_rating,
    c.matchup_label,
    c.matchup_multiplier,

    c.recommendation_strength,
    c.recommendation_color,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.summary_short, c.recommendation_short)
      WHEN COALESCE(c.summary_short, c.recommendation_short) IS NOT NULL THEN truncate_ai_text(COALESCE(c.summary_short, c.recommendation_short), 'first_sentence')
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN COALESCE(c.summary_long, c.recommendation_why, c.ai_summary)
      ELSE NULL
    END,

    CASE
      WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN c.ai_summary
      ELSE NULL
    END,

    c.consistency_tier,

    CASE
      WHEN v_is_premium             THEN 'premium'::text
      WHEN c.player_id = ANY(v_free_ids) THEN 'free'::text
      ELSE 'locked'::text
    END,

    c.total_count,
    c.cached_at,
    c.games_played,

    ROW_NUMBER() OVER (ORDER BY c.projection_final DESC NULLS LAST)::int,

    c.signal,
    c.signal_tag,
    c.edge,
    c.baseline,
    c.season_avg,
    c.last_3_avg,
    c.value,
    c.upside_pct,
    c.market_watch_category,

    c.status,
    c.manual_status,
    c.is_available,
    c.bye_round,
    c.is_bye,
    c.bye_next_round

  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, integer) TO anon, authenticated;
