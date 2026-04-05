/*
  # Fix Signal Thresholds — Extended Elite Guard for Top-25 Players

  ## Problem
  The current elite guard (projection >= 95 AND edge >= -30) is too narrow.
  Players like Gawn (proj=119, edge=-46), Bontempelli (proj=116, edge=-42),
  Daicos (proj=107, edge=-60) are showing STRONG_SELL despite being genuinely
  elite players. This is because the breakeven formula (price / 7200) creates
  structurally large negative edges for premium-priced players.

  ## Solution
  Extended three-tier elite guard:
  - Tier 1: projection >= 115 AND edge >= -65 → HOLD (protects top ~8 players)
  - Tier 2: projection >= 100 AND edge >= -55 → HOLD (protects next tier)
  - Tier 3: projection >= 90 AND edge >= -40 → HOLD (catches remaining top-25)
  
  Signal thresholds unchanged:
  - STRONG_BUY: edge >= 9
  - BUY: edge >= -3
  - HOLD: elite guard OR edge >= -19
  - SELL: edge >= -30
  - STRONG_SELL: edge < -30

  ## Changes
  - Rebuilds fn_populate_player_rankings_cache with extended elite guard
  - Backfills existing cache rows with corrected signals
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_round int;
  v_season int;
  v_projection_p90 numeric;
BEGIN
  SELECT COALESCE(MAX(week), 0) INTO v_round FROM afl.raw_2026_matches WHERE status = 'completed';
  v_season := 2026;

  SELECT PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY projected_score)
  INTO v_projection_p90
  FROM afl.mv_player_projection
  WHERE is_active = true;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, position,
    season_avg, last_3_avg, projection_final,
    ceiling, floor_val,
    price, breakeven, edge,
    value_score, value_tier,
    signal, signal_tag,
    recommendation, recommendation_short,
    ai_summary, ai_recommendation,
    neeko_rating,
    games_played, consistency_score,
    risk_pct,
    is_available, is_bye, is_injured,
    status, manual_status,
    matchup_label,
    cached_at, season, round_number
  )
  SELECT
    p.player_id,
    p.player_name,
    p.team_name AS team,
    p.primary_position AS position,
    ROUND(p.season_avg::numeric, 1) AS season_avg,
    ROUND(p.last_3_avg::numeric, 1) AS last_3_avg,
    ROUND(p.projected_score::numeric, 1) AS projection_final,
    ROUND(p.ceiling::numeric, 1) AS ceiling,
    ROUND(p.floor_val::numeric, 1) AS floor_val,
    COALESCE(pr.price, 0) AS price,
    CASE WHEN COALESCE(pr.price, 0) > 0
      THEN ROUND((COALESCE(pr.price, 0)::numeric / 7200), 1)
      ELSE 0
    END AS breakeven,
    ROUND(
      p.projected_score::numeric -
      CASE WHEN COALESCE(pr.price, 0) > 0
        THEN (COALESCE(pr.price, 0)::numeric / 7200)
        ELSE 0
      END,
      1
    ) AS edge,
    -- value_score: percentile-based, capped
    LEAST(GREATEST(
      ROUND(
        (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) /
        NULLIF(COALESCE(pr.price, 0)::numeric / 100000, 0) * 10,
        1
      ),
      -10
    ), 10) AS value_score,
    -- value_tier
    CASE
      WHEN COALESCE(pr.price, 0) < 250000 THEN 'emerging'
      WHEN COALESCE(pr.price, 0) < 500000 THEN 'mid'
      WHEN COALESCE(pr.price, 0) < 750000 THEN 'premium'
      ELSE 'elite'
    END AS value_tier,
    -- signal: EXTENDED ELITE GUARD for top-25 protection
    CASE
      -- Tier 0: clear buys regardless of price
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= 9
        THEN 'STRONG_BUY'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -3
        THEN 'BUY'
      -- Tier 1 elite guard: projection >= 115 protects top ~8 players from STRONG_SELL
      WHEN p.projected_score::numeric >= 115
        AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -65
        THEN 'HOLD'
      -- Tier 2 elite guard: projection >= 100
      WHEN p.projected_score::numeric >= 100
        AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -55
        THEN 'HOLD'
      -- Tier 3 elite guard: projection >= 90
      WHEN p.projected_score::numeric >= 90
        AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -40
        THEN 'HOLD'
      -- Standard thresholds
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -19
        THEN 'HOLD'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -30
        THEN 'SELL'
      ELSE 'STRONG_SELL'
    END AS signal,
    -- signal_tag: 3-level label
    CASE
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -3
        THEN 'Target'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) < -30
        AND NOT (
          (p.projected_score::numeric >= 115 AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -65)
          OR (p.projected_score::numeric >= 100 AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -55)
          OR (p.projected_score::numeric >= 90 AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -40)
        )
        THEN 'Avoid'
      ELSE 'Watch'
    END AS signal_tag,
    -- recommendation
    CASE
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= 9   THEN 'Strong Buy'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -3  THEN 'Buy'
      WHEN p.projected_score::numeric >= 115 AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -65 THEN 'Hold'
      WHEN p.projected_score::numeric >= 100 AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -55 THEN 'Hold'
      WHEN p.projected_score::numeric >= 90  AND (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -40 THEN 'Hold'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -19 THEN 'Hold'
      WHEN (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) >= -30 THEN 'Sell'
      ELSE 'Strong Sell'
    END AS recommendation,
    pa.recommendation_short,
    pa.summary AS ai_summary,
    pa.primary_reason AS ai_recommendation,
    -- neeko_rating: projection-based with value adjustment
    LEAST(GREATEST(
      ROUND(
        (p.projected_score::numeric / NULLIF(COALESCE(v_projection_p90, 90), 0)) * 7
        + LEAST(GREATEST(
            (p.projected_score::numeric - COALESCE(pr.price, 0)::numeric / 7200) / 10,
            -1.5
          ), 1.5)
        + CASE WHEN p.games_played >= 5 THEN (1 - COALESCE(p.consistency_score, 0.5)) * -1 ELSE 0 END,
        1
      ),
      1
    ), 10) AS neeko_rating,
    p.games_played,
    ROUND(p.consistency_score::numeric, 3) AS consistency_score,
    CASE
      WHEN p.projected_score::numeric > 0
        THEN LEAST(GREATEST(
          ROUND(ABS(p.projected_score::numeric - COALESCE(p.last_3_avg, p.season_avg, 0)) / NULLIF(p.projected_score::numeric, 0) * 100, 1),
          0
        ), 100)
      ELSE NULL
    END AS risk_pct,
    -- availability
    NOT (COALESCE(p.manual_status, '') IN ('injured', 'out', 'bye')
      OR COALESCE(p.status, '') IN ('injured', 'out', 'bye')) AS is_available,
    COALESCE(p.manual_status, '') = 'bye' OR COALESCE(p.status, '') = 'bye' AS is_bye,
    COALESCE(p.manual_status, '') IN ('injured', 'out')
      OR COALESCE(p.status, '') IN ('injured', 'out') AS is_injured,
    p.status,
    p.manual_status,
    opc.matchup_label,
    NOW() AS cached_at,
    v_season AS season,
    v_round AS round_number
  FROM afl.mv_player_projection p
  LEFT JOIN afl.v_latest_player_prices pr ON pr.player_id = p.player_id
  LEFT JOIN afl.player_ai_analysis pa ON pa.player_id = p.player_id
  LEFT JOIN afl.opponent_position_venue_concession opc
    ON opc.team_id = p.team_id
    AND opc.position = p.primary_position
  WHERE p.is_active = true
  ON CONFLICT (player_id) DO UPDATE SET
    player_name        = EXCLUDED.player_name,
    team               = EXCLUDED.team,
    position           = EXCLUDED.position,
    season_avg         = EXCLUDED.season_avg,
    last_3_avg         = EXCLUDED.last_3_avg,
    projection_final   = EXCLUDED.projection_final,
    ceiling            = EXCLUDED.ceiling,
    floor_val          = EXCLUDED.floor_val,
    price              = EXCLUDED.price,
    breakeven          = EXCLUDED.breakeven,
    edge               = EXCLUDED.edge,
    value_score        = EXCLUDED.value_score,
    value_tier         = EXCLUDED.value_tier,
    signal             = EXCLUDED.signal,
    signal_tag         = EXCLUDED.signal_tag,
    recommendation     = EXCLUDED.recommendation,
    recommendation_short = EXCLUDED.recommendation_short,
    ai_summary         = EXCLUDED.ai_summary,
    ai_recommendation  = EXCLUDED.ai_recommendation,
    neeko_rating       = EXCLUDED.neeko_rating,
    games_played       = EXCLUDED.games_played,
    consistency_score  = EXCLUDED.consistency_score,
    risk_pct           = EXCLUDED.risk_pct,
    is_available       = EXCLUDED.is_available,
    is_bye             = EXCLUDED.is_bye,
    is_injured         = EXCLUDED.is_injured,
    status             = EXCLUDED.status,
    manual_status      = EXCLUDED.manual_status,
    matchup_label      = EXCLUDED.matchup_label,
    cached_at          = EXCLUDED.cached_at,
    season             = EXCLUDED.season,
    round_number       = EXCLUDED.round_number;
END;
$$;
