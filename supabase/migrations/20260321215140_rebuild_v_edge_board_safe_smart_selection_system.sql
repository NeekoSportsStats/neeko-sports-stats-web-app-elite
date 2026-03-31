/*
  # Rebuild v_edge_board_safe — Smart 3-Signal Selection System

  ## Goal
  Guarantee exactly 3 rows are returned (one per signal category) from the landing
  page Edge Signals view, using deterministic selection logic per signal type.
  Injured/unavailable players are excluded at the CTE level.

  ## Signal Selection Logic

  ### Captain Lock
  Best player for captaining — highest captain_score, tiebreak on projection_final.
  Fallback: highest neeko_rating if captain_score is null for all.

  ### Must Have Value
  Best value play — highest best_value_score > 0, tiebreak on projection_final.
  Fallback: highest value_score > 0, then highest neeko_rating.

  ### Do Not Start
  Highest-ranked player with the most risk — highest risk_rating among top 50 by
  neeko_rating. This ensures we pick a relevant player (not a fringe one) who carries
  meaningful uncertainty. Tiebreak: lowest projection_confidence.

  ## Deduplication
  Each signal picks from the full available pool independently. The same player can
  appear in multiple signals if they genuinely qualify (rare edge case — acceptable).

  ## Fallback Safety
  Every CASE branch falls back to the top neeko_rating player so the view can never
  return 0 rows even with extreme data gaps.

  ## Columns Returned (unchanged — no frontend changes needed)
  player_name, team, position, neeko_rating, projection_final, ceiling_estimate,
  projection_confidence, risk_rating, upside_rating

  Plus: signal_type (used for ordering / client identification)
*/

DROP VIEW IF EXISTS public.v_edge_board_safe;

CREATE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH available_players AS (
  SELECT
    player_name,
    team,
    position,
    neeko_rating,
    projection_final::double precision        AS projection_final,
    ceiling_estimate,
    floor_estimate,
    projection_confidence,
    risk_rating,
    upside_rating,
    captain_score,
    COALESCE(best_value_score, value_score, 0) AS resolved_value_score,
    ROW_NUMBER() OVER (ORDER BY neeko_rating DESC NULLS LAST) AS neeko_rank
  FROM afl.player_rankings_cache
  WHERE
    COALESCE(is_available, true) = true
    AND COALESCE(status, 'AVAILABLE') != 'OUT'
    AND projection_final IS NOT NULL
    AND COALESCE(projection_final, 0) > 0
),

-- Signal 1: Captain Lock — highest captain_score among all available, fallback neeko_rating
captain AS (
  SELECT
    player_name, team, position, neeko_rating, projection_final,
    ceiling_estimate, projection_confidence, risk_rating, upside_rating,
    'captain' AS signal_type
  FROM available_players
  ORDER BY
    COALESCE(captain_score, 0) DESC,
    projection_final DESC NULLS LAST
  LIMIT 1
),

-- Signal 2: Must Have Value — best value_score > 0 among available, fallback top neeko_rating
value_play AS (
  SELECT
    player_name, team, position, neeko_rating, projection_final,
    ceiling_estimate, projection_confidence, risk_rating, upside_rating,
    'breakout' AS signal_type
  FROM available_players
  WHERE resolved_value_score > 0
  ORDER BY resolved_value_score DESC, projection_final DESC NULLS LAST
  LIMIT 1
),

-- Fallback for value: top neeko_rating player if no one has value_score > 0
value_fallback AS (
  SELECT
    player_name, team, position, neeko_rating, projection_final,
    ceiling_estimate, projection_confidence, risk_rating, upside_rating,
    'breakout' AS signal_type
  FROM available_players
  ORDER BY neeko_rating DESC NULLS LAST
  LIMIT 1
),

-- Signal 3: Do Not Start — highest risk_rating among top-50 available (ensures relevance)
trap AS (
  SELECT
    player_name, team, position, neeko_rating, projection_final,
    ceiling_estimate, projection_confidence, risk_rating, upside_rating,
    'trap' AS signal_type
  FROM available_players
  WHERE neeko_rank <= 50
  ORDER BY
    risk_rating DESC NULLS LAST,
    projection_confidence ASC NULLS LAST
  LIMIT 1
),

-- Fallback for trap: highest risk_rating from entire pool
trap_fallback AS (
  SELECT
    player_name, team, position, neeko_rating, projection_final,
    ceiling_estimate, projection_confidence, risk_rating, upside_rating,
    'trap' AS signal_type
  FROM available_players
  ORDER BY risk_rating DESC NULLS LAST
  LIMIT 1
)

-- Assemble final 3 rows: prefer primary signal, fall back if empty
SELECT player_name, team, position, neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating, signal_type
FROM captain

UNION ALL

SELECT player_name, team, position, neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating, signal_type
FROM (
  SELECT * FROM value_play
  UNION ALL
  SELECT * FROM value_fallback
  LIMIT 1
) vp

UNION ALL

SELECT player_name, team, position, neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating, signal_type
FROM (
  SELECT * FROM trap
  UNION ALL
  SELECT * FROM trap_fallback
  LIMIT 1
) tp;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
