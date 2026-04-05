/*
  # Fix afl.populate_rankings_cache_from_source() v2 — correct cache column names

  ## Changes from v1
  - Remove edge_tier (not a column in player_rankings_cache — use signal_tag instead)
  - Remove trend_signal (not a column in player_rankings_cache)
  - Use signal_tag instead of edge_tier for the ebc.edge_tier value
  - Cache has: edge, signal, signal_tag, value_signal, market_watch_category, is_bye, status, manual_status, breakeven
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  p_buy         double precision;
  p_sell        double precision;
  p_strong_sell double precision;
BEGIN

-- Compute percentile thresholds — join v_edge_board_core for breakeven
SELECT
  PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY
    CASE
      WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played >= 3
      THEN ROUND(((pp.projection - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2)
      ELSE NULL
    END
  ),
  PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY
    CASE
      WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played >= 3
      THEN ROUND(((pp.projection - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2)
      ELSE NULL
    END
  ),
  PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY
    CASE
      WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played >= 3
      THEN ROUND(((pp.projection - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2)
      ELSE NULL
    END
  )
INTO p_buy, p_sell, p_strong_sell
FROM afl.mv_player_projection pp
LEFT JOIN afl.v_edge_board_core ebc ON ebc.player_id = pp.player_id
WHERE pp.games_played >= 3
AND pp.projection::numeric > 50;

INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, position,
  price, projection_final, breakeven, games_played,
  season_avg, last_3_avg, last_5_avg,
  signal, signal_tag, value_score, value_signal,
  edge,
  market_watch_category,
  is_bye, status, manual_status,
  summary_short, ai_summary, recommendation_color,
  cached_at
)
SELECT
  pp.player_id,
  pp.player_name,
  pp.team_name        AS team,
  pp.team_name,
  pp.position,
  pp.price,
  pp.projection::numeric AS projection_final,
  ebc.breakeven,
  pp.games_played,
  pp.season_avg,
  pp.last3_avg        AS last_3_avg,
  pp.last5_avg        AS last_5_avg,

  -- signal: trend-based from edge board core
  COALESCE(ebc.signal, 'STABLE') AS signal,

  -- signal_tag: edge_tier from edge board core
  COALESCE(ebc.edge_tier, 'STABLE') AS signal_tag,

  -- value_score: normalised edge per $100k price
  CASE
    WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played >= 3
    THEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2)
    WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played = 2
    THEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price * 0.6)::numeric, 2)
    WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played = 1
    THEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price * 0.4)::numeric, 2)
    WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL
    THEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price * 0.25)::numeric, 2)
    ELSE pp.value_score
  END::double precision,

  -- value_signal: percentile-rank based (BUY/HOLD/SELL/STRONG_SELL)
  CASE
    WHEN COALESCE(ebc.is_bye, false) = true
      OR UPPER(COALESCE(ebc.manual_status, '')) IN ('INJURED', 'OUT', 'OMITTED')
      OR UPPER(COALESCE(ebc.status, ''))        IN ('INJURED', 'OUT', 'OMITTED')
    THEN 'HOLD'
    WHEN pp.price > 0 AND ebc.breakeven IS NOT NULL AND pp.games_played >= 3 THEN
      CASE
        WHEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_buy
        THEN 'BUY'
        WHEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_sell
        THEN 'HOLD'
        WHEN ROUND(((pp.projection::numeric - ebc.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_strong_sell
        THEN 'SELL'
        ELSE 'STRONG_SELL'
      END
    ELSE 'HOLD'
  END,

  -- edge from v_edge_board_core
  ebc.edge,

  -- market_watch_category from v_edge_board_core
  ebc.market_watch_category,

  COALESCE(ebc.is_bye, false),
  ebc.status,
  ebc.manual_status,

  -- AI fields: preserve from existing cache row if present
  COALESCE(
    (SELECT c.summary_short FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
    NULL
  ),
  COALESCE(
    (SELECT c.ai_summary FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
    NULL
  ),
  COALESCE(
    (SELECT c.recommendation_color FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
    NULL
  ),

  now()

FROM afl.mv_player_projection pp
LEFT JOIN afl.v_edge_board_core ebc ON ebc.player_id = pp.player_id

ON CONFLICT (player_id) DO UPDATE SET
  player_name           = EXCLUDED.player_name,
  team                  = EXCLUDED.team,
  team_name             = EXCLUDED.team_name,
  position              = EXCLUDED.position,
  price                 = EXCLUDED.price,
  projection_final      = EXCLUDED.projection_final,
  breakeven             = EXCLUDED.breakeven,
  games_played          = EXCLUDED.games_played,
  season_avg            = EXCLUDED.season_avg,
  last_3_avg            = EXCLUDED.last_3_avg,
  last_5_avg            = EXCLUDED.last_5_avg,
  signal                = EXCLUDED.signal,
  signal_tag            = EXCLUDED.signal_tag,
  value_score           = EXCLUDED.value_score,
  value_signal          = EXCLUDED.value_signal,
  edge                  = EXCLUDED.edge,
  market_watch_category = EXCLUDED.market_watch_category,
  is_bye                = EXCLUDED.is_bye,
  status                = EXCLUDED.status,
  manual_status         = EXCLUDED.manual_status,
  summary_short         = COALESCE(EXCLUDED.summary_short, afl.player_rankings_cache.summary_short),
  ai_summary            = COALESCE(EXCLUDED.ai_summary, afl.player_rankings_cache.ai_summary),
  recommendation_color  = COALESCE(EXCLUDED.recommendation_color, afl.player_rankings_cache.recommendation_color),
  cached_at             = now();

END;
$function$;
