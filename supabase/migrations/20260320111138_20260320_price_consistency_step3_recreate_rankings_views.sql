
/*
  # Price Consistency Step 3 — Recreate Rankings Views with Price History

  ## Summary
  Views v_rankings_master, v_rankings_free, and v_mw_premium were dropped in a prior
  migration. This migration recreates them with the new price history columns:
  prev_price, price_change, price_change_pct, status, is_available.

  ## Changes
  1. Recreate public.v_rankings_master — full columns including price_change
  2. Recreate public.v_rankings_free — free-tier subset with price_change
  3. Recreate public.v_mw_premium — market watch premium view with prev_price/price_change_pct
  4. Rebuild get_rankings_premium() RPC — add price history to output
  5. Grant anon/authenticated SELECT on new views
*/

-- ============================================================
-- 1. RECREATE v_rankings_master
-- ============================================================
CREATE OR REPLACE VIEW public.v_rankings_master
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling_estimate,
  c.floor_estimate,
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
  c.analysis,
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
  c.matchup_multiplier,
  c.matchup_label,
  c.neeko_rating_raw,
  c.neeko_rating_scaled,
  c.start_sit_decision,
  c.edge_score,
  c.edge_tier,
  c.market_watch_category,
  c.confidence_label,
  c.status,
  c.is_available,
  c.total_count,
  c.cached_at
FROM afl.player_rankings_cache c;

-- ============================================================
-- 2. RECREATE v_rankings_free (free-tier subset)
-- ============================================================
CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
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
  c.recommendation_strength,
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
FROM afl.player_rankings_cache c;

-- ============================================================
-- 3. RECREATE v_mw_premium (market_watch_snapshot not market_watch_snapshots)
-- ============================================================
CREATE OR REPLACE VIEW public.v_mw_premium
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.snapshot_id,
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.price,
  p.prev_price,
  p.price_change_pct,
  p.breakeven,
  p.projection,
  p.ceiling,
  p.risk_pct,
  p.price_edge_pts,
  p.expected_price_change,
  p.projected_price,
  p.projected_price_r1,
  p.projected_price_r2,
  p.projected_price_r3,
  p.breakout_score,
  p.breakout_flag,
  p.volatility_score,
  p.volatility_level,
  p.category,
  p.action,
  p.trade_score,
  p.buy_score,
  p.sell_score,
  p.hold_score,
  p.watch_score,
  p.reasons,
  p.last3_avg,
  p.estimated_price,
  p.value_score,
  p.price_range_top,
  p.price_range_bottom,
  p.value_momentum,
  p.momentum_label,
  p.peak_price,
  p.peak_round,
  p.peak_status,
  s.round_number,
  s.season,
  s.updated_at                            AS snapshot_created_at,
  p.created_at
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s ON s.snapshot_id = p.snapshot_id
WHERE s.is_active = true;

-- ============================================================
-- 4. REBUILD get_rankings_premium() RPC with price history
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

-- ============================================================
-- 5. GRANTS
-- ============================================================
GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
GRANT SELECT ON public.v_rankings_free   TO anon, authenticated;
GRANT SELECT ON public.v_mw_premium      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_premium(integer, text, text, text) TO anon, authenticated;
