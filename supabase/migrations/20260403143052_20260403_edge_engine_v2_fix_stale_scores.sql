
/*
  # Edge Engine V2 — Fix stale edge_scores on inactive players

  Players not in mv_player_projection have old integer edge_scores from before
  the edge engine upgrade. Clamp them to 0 (HOLD) and mark is_available = false.
*/

UPDATE afl.player_rankings_cache
SET
  edge_score = 0,
  edge_tier = 'NEUTRAL',
  ai_recommendation = 'HOLD',
  recommendation_color = 'amber',
  market_watch_category = 'Watch',
  is_available = false
WHERE player_id NOT IN (
  SELECT player_id FROM afl.mv_player_projection
)
AND edge_score > 20;

-- Also fix any that are < -20 (shouldn't exist but safety)
UPDATE afl.player_rankings_cache
SET
  edge_score = 0,
  edge_tier = 'NEUTRAL',
  ai_recommendation = 'HOLD',
  recommendation_color = 'amber',
  market_watch_category = 'Watch',
  is_available = false
WHERE player_id NOT IN (
  SELECT player_id FROM afl.mv_player_projection
)
AND edge_score < -20;
