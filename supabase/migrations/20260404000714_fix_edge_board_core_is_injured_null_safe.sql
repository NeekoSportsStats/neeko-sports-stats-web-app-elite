/*
  # Fix Edge Board is_injured NULL-safety

  status and manual_status are NULL for most players (not set = available).
  The expression `status = 'injured' OR manual_status = 'injured'` evaluates to
  NULL when both are NULL — so `is_injured = false` never matched.

  Fix: use COALESCE to treat NULL as not-injured.
*/

CREATE OR REPLACE VIEW afl.v_edge_board_core
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.team_name,
  rc.position,
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.projection_final,
  rc.breakeven,
  rc.edge_score,
  rc.value_score,
  rc.neeko_rating,
  rc.consistency,
  rc.projection_confidence,
  rc.games_played,
  rc.ai_recommendation,
  rc.market_watch_category,
  rc.summary_short,
  rc.recommendation_short,
  rc.recommendation_color,
  rc.matchup_label,
  rc.ceiling,
  rc.floor,
  rc.form_score,
  rc.status,
  rc.manual_status,
  rc.is_available,
  rc.is_bye,
  -- NULL-safe: treat NULL status as not injured
  (COALESCE(rc.status, '') = 'injured' OR COALESCE(rc.manual_status, '') = 'injured') AS is_injured,
  rc.cached_at,
  CASE
    WHEN rc.edge_score >= 15 THEN 'STRONG_BUY'
    WHEN rc.edge_score >= 6  THEN 'BUY'
    WHEN rc.edge_score <= -15 THEN 'STRONG_SELL'
    WHEN rc.edge_score <= -6  THEN 'SELL'
    ELSE 'HOLD'
  END AS edge_tier,
  (
    rc.price IS NOT NULL AND rc.price > 0
    AND rc.projection_final IS NOT NULL AND rc.projection_final::double precision > 30
    AND rc.games_played >= 3
    AND rc.player_name IS NOT NULL
    AND rc.team IS NOT NULL AND rc.team <> ''
    AND COALESCE(rc.is_available, true) = true
    AND COALESCE(rc.status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
    AND COALESCE(rc.manual_status, 'AVAILABLE') NOT IN ('OUT', 'INJURED', 'INACTIVE', 'injured', 'bye')
    AND rc.is_bye IS NOT TRUE
  ) AS is_valid_edge_candidate
FROM afl.player_rankings_cache rc
WHERE
  rc.player_id IS NOT NULL
  AND rc.player_name IS NOT NULL
  AND rc.projection_final IS NOT NULL
  AND rc.projection_final::double precision > 30
  AND COALESCE(rc.is_available, true) = true
  AND COALESCE(rc.status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
  AND COALESCE(rc.manual_status, 'AVAILABLE') NOT IN ('OUT', 'INJURED', 'INACTIVE', 'injured', 'bye')
  AND rc.is_bye IS NOT TRUE;

GRANT SELECT ON afl.v_edge_board_core TO authenticated, service_role;
