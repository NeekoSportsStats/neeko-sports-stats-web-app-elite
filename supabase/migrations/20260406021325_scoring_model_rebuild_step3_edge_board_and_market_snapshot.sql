/*
  # Scoring Model Rebuild — Step 3: Edge Board RPC + Market Watch Snapshot

  ## Summary

  ### get_edge_board_data
  Rebuilt to use canonical fields exclusively:
  - signal_canonical for section routing (STRONG_UP/UP → must_have, STRONG_UP → breakout,
    DOWN/STRONG_DOWN → do_not_start)
  - edge_canonical for ranking within sections
  - value_score_canonical for secondary sort
  - Excludes rookies (games_played < 3) from all sections
  - Excludes injured/bye players

  ### build_market_watch_snapshot
  Aligned to canonical fields:
  - category pulled from category_canonical
  - action pulled from action_canonical
  - trade_score = value_score_canonical
  - price_edge_pts = edge_canonical
  - Excludes rookies from snapshot
*/

-- ─── get_edge_board_data ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 5)
RETURNS TABLE (
  player_id           integer,
  player_name         text,
  team                text,
  player_position     text,
  section             text,
  section_rank        bigint,
  projection_final    numeric,
  ceiling_estimate    double precision,
  floor_estimate      double precision,
  upside_rating       double precision,
  risk_rating         double precision,
  projection_confidence double precision,
  captain_score       double precision,
  captain_rating      text,
  neeko_rating        double precision,
  price               integer,
  price_change        integer,
  value_score         double precision,
  value_tag           text,
  ai_summary          text,
  recommendation_color text,
  refreshed_at        timestamp with time zone,
  edge                numeric,
  signal_tag          text,
  signal              text,
  summary_short       text,
  trend_signal        text,
  breakeven           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH base AS (
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, c.team)       AS team,
    c."position"                         AS player_position,
    c.projection_final,
    c.ceiling_estimate,
    c.floor_estimate,
    c.upside_rating,
    c.risk_rating,
    c.projection_confidence,
    c.captain_score,
    c.captain_rating,
    c.neeko_rating,
    c.price,
    c.price_change,
    c.value_score_canonical::double precision  AS value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.cached_at                          AS refreshed_at,
    c.edge_canonical                     AS edge,
    c.breakeven_canonical                AS breakeven,
    c.signal_canonical                   AS signal,
    c.signal_canonical                   AS signal_tag,
    c.summary_short,
    c.signal_canonical                   AS trend_signal
  FROM afl.player_rankings_cache c
  WHERE c.games_played >= 3
    AND c.projection_final > 40
    AND c.price > 0
    AND COALESCE(c.manual_status, c.status, '') NOT IN
        ('injured', 'inactive', 'inactive_ghost', 'OUT', 'INJURED', 'OMITTED')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
),

-- Section 1: MUST HAVE — UP or STRONG_UP, ranked by edge desc then value desc
must_have_candidates AS (
  SELECT
    b.*,
    'must_have'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST
    ) AS section_rank
  FROM base b
  WHERE b.signal IN ('STRONG_UP', 'UP')
  LIMIT limit_n
),

-- Section 2: BREAKOUT — STRONG_UP only, not already in must_have
breakout_candidates AS (
  SELECT
    b.*,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST
    ) AS section_rank
  FROM base b
  WHERE b.signal = 'STRONG_UP'
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
  LIMIT limit_n
),

-- Section 3: DO NOT START — DOWN or STRONG_DOWN, ranked by worst edge
do_not_start_candidates AS (
  SELECT
    b.*,
    'do_not_start'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY b.edge ASC NULLS LAST, b.risk_rating DESC NULLS LAST
    ) AS section_rank
  FROM base b
  WHERE b.signal IN ('DOWN', 'STRONG_DOWN')
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
  LIMIT limit_n
),

combined AS (
  SELECT * FROM must_have_candidates
  UNION ALL SELECT * FROM breakout_candidates
  UNION ALL SELECT * FROM do_not_start_candidates
)

SELECT
  player_id, player_name, team, player_position,
  section, section_rank, projection_final, ceiling_estimate, floor_estimate,
  upside_rating, risk_rating, projection_confidence, captain_score, captain_rating,
  neeko_rating, price, price_change, value_score, value_tag, ai_summary,
  recommendation_color, refreshed_at, edge, signal_tag, signal,
  summary_short, trend_signal, breakeven
FROM combined
ORDER BY section, section_rank;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated;

-- ─── market.build_market_watch_snapshot ─────────────────────────────────────
-- Rebuild snapshot function to use canonical fields and exclude rookies
CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_season      int;
  v_round       int;
  v_snapshot_id uuid;
BEGIN

  SELECT season, MAX(week)
  INTO v_season, v_round
  FROM afl.player_games
  GROUP BY season
  ORDER BY season DESC
  LIMIT 1;

  IF v_season IS NULL THEN
    v_season := 2026;
    v_round  := 1;
  END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position, price, prev_price,
    price_change_pct, projection, breakeven, ceiling, risk_pct, price_edge_pts,
    expected_price_change, category, action, trade_score, reasons,
    projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score, price_range_top, price_range_bottom,
    value_momentum, momentum_label, peak_price, peak_round, peak_status,
    buy_score, sell_score, hold_score, watch_score
  )
  SELECT
    v_snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc."position",
    COALESCE(rc.price, 0)                                           AS price,
    COALESCE(rc.prev_price, rc.price, 0)::integer                   AS prev_price,
    COALESCE(rc.price_change_pct, 0)::numeric                       AS price_change_pct,
    COALESCE(rc.projection_final, 0)::numeric                       AS projection,
    ROUND(GREATEST(0, COALESCE(rc.breakeven_canonical, 0)))::integer AS breakeven,
    COALESCE(rc.ceiling, rc.projection_final, 0)::numeric           AS ceiling,
    COALESCE(rc.risk_rating, 50)::numeric                           AS risk_pct,
    ROUND(COALESCE(rc.edge_canonical, 0), 1)                        AS price_edge_pts,
    0                                                               AS expected_price_change,
    rc.category_canonical                                           AS category,
    rc.action_canonical                                             AS action,
    COALESCE(rc.value_score_canonical, 0)::numeric                  AS trade_score,
    jsonb_build_array(COALESCE(rc.summary_short, 'No analysis'))    AS reasons,
    COALESCE(rc.price, 0)                                           AS projected_price,
    COALESCE(rc.price, 0)                                           AS projected_price_r1,
    COALESCE(rc.price, 0)                                           AS projected_price_r2,
    COALESCE(rc.price, 0)                                           AS projected_price_r3,
    0                                                               AS breakout_score,
    false                                                           AS breakout_flag,
    COALESCE(rc.risk_rating, 50)::numeric                           AS volatility_score,
    CASE
      WHEN COALESCE(rc.risk_rating, 50) >= 70 THEN 'High'
      WHEN COALESCE(rc.risk_rating, 50) >= 40 THEN 'Medium'
      ELSE 'Low'
    END                                                             AS volatility_level,
    COALESCE(rc.last_3_avg, rc.projection_final, 0)::numeric        AS last3_avg,
    COALESCE(rc.price, 0)                                           AS estimated_price,
    COALESCE(rc.value_score_canonical, 0)::numeric                  AS value_score,
    COALESCE(rc.ceiling, rc.projection_final, 0)::numeric           AS price_range_top,
    GREATEST(COALESCE(rc.projection_final, 0) * 0.8, 0)            AS price_range_bottom,
    0                                                               AS value_momentum,
    'Stable'                                                        AS momentum_label,
    COALESCE(rc.price, 0)                                           AS peak_price,
    v_round                                                         AS peak_round,
    'Current'                                                       AS peak_status,
    CASE WHEN rc.action_canonical = 'BUY'
         THEN COALESCE(rc.value_score_canonical, 0) ELSE 0 END      AS buy_score,
    CASE WHEN rc.action_canonical = 'SELL'
         THEN ABS(COALESCE(rc.value_score_canonical, 0)) ELSE 0 END AS sell_score,
    CASE WHEN rc.action_canonical = 'HOLD' THEN 50 ELSE 0 END       AS hold_score,
    COALESCE(rc.value_score_canonical, 0)::numeric                  AS watch_score
  FROM afl.player_rankings_cache rc
  LEFT JOIN afl.players p ON p.player_id = rc.player_id
  WHERE rc.player_id IS NOT NULL
    AND COALESCE(rc.price, 0) > 0
    AND COALESCE(rc.projection_final, 0) > 0
    AND COALESCE(p.active, true) = true
    AND COALESCE(rc.games_played, 0) >= 3
    AND rc.category_canonical IS NOT NULL
    AND (rc.manual_status IS NULL OR rc.manual_status NOT IN
         ('RETIRED', 'injured', 'out', 'suspended', 'delisted'))
  ORDER BY ABS(rc.edge_canonical) DESC NULLS LAST;

  UPDATE market.market_watch_snapshot
  SET
    total_player_count = (
      SELECT COUNT(*) FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    buy_category_pct = (
      SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE action = 'BUY') / NULLIF(COUNT(*), 0), 1)
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    sell_category_pct = (
      SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE action = 'SELL') / NULLIF(COUNT(*), 0), 1)
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    distribution_valid = true,
    updated_at = now()
  WHERE snapshot_id = v_snapshot_id;

END;
$$;
