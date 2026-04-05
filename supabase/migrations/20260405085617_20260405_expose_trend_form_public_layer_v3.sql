/*
  # Expose Trend/Form Columns in Public Layer (v3 — drop functions first)

  Drops existing RPCs and views, then recreates with trend/form columns added.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop existing RPCs that have conflicting signatures
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_rankings_safe(uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop and recreate public.player_rankings_cache view
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.player_rankings_cache CASCADE;

CREATE VIEW public.player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  ceiling_estimate,
  floor_estimate,
  consistency,
  form_score,
  neeko_rating,
  price,
  prev_price,
  price_change,
  price_change_pct,
  value_score,
  best_value_score,
  value_tag,
  value_tier,
  signal,
  signal_tag,
  baseline,
  edge,
  season_avg,
  last_3_avg,
  value,
  breakeven,
  trend_score,
  trend_signal,
  form_delta,
  form_label,
  summary,
  analysis,
  projection_confidence,
  risk_rating,
  matchup_rating,
  matchup_label,
  matchup_multiplier,
  upside_rating,
  upside_pct,
  captain_score,
  captain_rating,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  summary_short,
  summary_long,
  ai_summary,
  ai_updated_at,
  ai_generated_at,
  ai_prompt_version,
  ai_validation_passed,
  recommendation_strength,
  consistency_tier,
  start_sit_decision,
  market_watch_category,
  total_count,
  cached_at,
  created_at,
  games_played,
  neeko_rating_raw,
  neeko_rating_scaled,
  confidence_label,
  status,
  manual_status,
  is_available,
  bye_round,
  is_bye,
  bye_next_round,
  team_id,
  cache_snapshot_id,
  ai_cache_snapshot_id,
  pipeline_snapshot_id,
  edge_c_base,
  edge_c_form,
  edge_c_ceiling,
  edge_c_opponent,
  edge_c_venue,
  edge_c_role,
  edge_c_momentum,
  edge_c_breakout,
  edge_c_risk
FROM afl.player_rankings_cache;

GRANT SELECT ON public.player_rankings_cache TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop and recreate public.v_rankings_master view
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  ceiling_estimate,
  floor_estimate,
  consistency,
  form_score,
  neeko_rating,
  neeko_rating_raw,
  neeko_rating_scaled,
  price,
  value_score,
  value_tag,
  value_tier,
  best_value_score,
  matchup_multiplier,
  matchup_rating,
  matchup_label,
  games_played,
  upside_pct,
  upside_rating,
  signal,
  signal_tag,
  edge,
  baseline,
  season_avg,
  last_3_avg,
  trend_score,
  trend_signal,
  form_delta,
  form_label,
  market_watch_category,
  recommendation_color,
  recommendation_strength,
  captain_score,
  captain_rating,
  ai_summary,
  summary,
  summary_short,
  summary_long,
  analysis,
  recommendation_short,
  recommendation_why,
  ai_prompt_version,
  ai_validation_passed,
  ai_generated_at,
  projection_confidence,
  risk_rating,
  confidence_label,
  consistency_tier,
  prev_price,
  price_change,
  price_change_pct,
  breakeven,
  bye_round,
  is_bye,
  bye_next_round,
  team_id,
  is_available,
  status,
  manual_status,
  cache_snapshot_id,
  cached_at,
  total_count
FROM afl.player_rankings_cache c
WHERE is_available = true;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recreate get_rankings_safe with trend/form columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.get_rankings_safe(
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false,
  p_limit   integer DEFAULT 500
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  team_name             text,
  "position"            text,
  position_group        text,
  projection_final      numeric,
  ceiling               double precision,
  floor                 double precision,
  consistency           double precision,
  form_score            double precision,
  neeko_rating          double precision,
  neeko_rating_scaled   double precision,
  price                 integer,
  prev_price            integer,
  price_change          integer,
  price_change_pct      numeric,
  breakeven             numeric,
  value_score           double precision,
  best_value_score      double precision,
  value_tag             text,
  value_tier            text,
  projection_confidence double precision,
  risk_rating           double precision,
  matchup_rating        text,
  matchup_label         text,
  matchup_multiplier    numeric,
  recommendation_strength text,
  recommendation_color  text,
  why                   text,
  long                  text,
  ai_summary            text,
  consistency_tier      text,
  access_tier           text,
  total_count           integer,
  cached_at             timestamptz,
  games_played          integer,
  row_rank              integer,
  signal                text,
  signal_tag            text,
  edge                  numeric,
  baseline              numeric,
  season_avg            numeric,
  last_3_avg            numeric,
  value                 numeric,
  upside_pct            double precision,
  market_watch_category text,
  status                text,
  manual_status         text,
  is_available          boolean,
  bye_round             integer,
  is_bye                boolean,
  bye_next_round        boolean,
  trend_score           numeric,
  trend_signal          text,
  form_delta            numeric,
  form_label            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    c.bye_next_round,
    c.trend_score,
    c.trend_signal,
    c.form_delta,
    c.form_label
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
  ORDER BY c.projection_final DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recreate get_rankings_premium with trend/form columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.get_rankings_premium(
  position_filter text    DEFAULT 'ALL',
  sort_key        text    DEFAULT 'neeko_rating',
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
  ai_updated_at         timestamptz,
  value_tag             text,
  value_tier            text,
  consistency_tier      text,
  total_count           integer,
  baseline              numeric,
  trend_score           numeric,
  trend_signal          text,
  season_avg            numeric,
  form_delta            numeric,
  form_label            text,
  signal                text,
  signal_tag            text,
  edge                  numeric,
  breakeven             numeric,
  upside_pct            double precision,
  status                text,
  is_available          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
  c.total_count,
  c.baseline,
  c.trend_score,
  c.trend_signal,
  c.season_avg,
  c.form_delta,
  c.form_label,
  c.signal,
  c.signal_tag,
  c.edge,
  c.breakeven,
  c.upside_pct,
  c.status,
  c.is_available
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
