/*
  # Fix Edge Board RPC: Expose ai_recommendation and summary_short

  ## Summary
  The get_edge_board_data RPC was not returning ai_recommendation or summary_short
  from player_rankings_cache. This meant the frontend was deriving signal labels
  (TARGET/WATCH/AVOID) and action text (BUY/SELL/HOLD) from edge_score thresholds
  instead of using the canonical ai_recommendation field — causing contradictions.

  ## Changes
  - Add ai_recommendation to the SELECT output of get_edge_board_data
  - Add summary_short to the SELECT output (replaces ai_summary which was always NULL)
  - No logic changes to candidate selection — only the output columns are extended

  ## Notes
  - The function is fully replaced (DROP + CREATE) to change the RETURNS TABLE signature
  - All existing columns preserved in same order; new columns appended
*/

DROP FUNCTION IF EXISTS public.get_edge_board_data();
DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 5)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team                  text,
  player_position       text,
  section               text,
  section_rank          bigint,
  projection_final      numeric,
  ceiling_estimate      double precision,
  floor_estimate        double precision,
  upside_rating         double precision,
  risk_rating           double precision,
  projection_confidence double precision,
  captain_score         double precision,
  captain_rating        text,
  neeko_rating          double precision,
  price                 integer,
  price_change          integer,
  value_score           double precision,
  value_tag             text,
  ai_summary            text,
  recommendation_color  text,
  refreshed_at          timestamp with time zone,
  edge_score            numeric,
  edge_tier             text,
  ai_recommendation     text,
  summary_short         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH base AS (
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, c.team)        AS team,
    c.position                           AS player_position,
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
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.cached_at                          AS refreshed_at,
    c.edge_score,
    c.edge_tier,
    c.breakeven,
    c.ai_recommendation,
    c.summary_short
  FROM afl.player_rankings_cache c
  WHERE
    c.games_played >= 3
    AND c.projection_final > 40
    AND COALESCE(c.manual_status, c.status, '') NOT IN ('injured', 'inactive', 'inactive_ghost')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
),

captain_candidates AS (
  SELECT
    b.*,
    'captain'::text                      AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.captain_score, 0) DESC, COALESCE(b.projection_final, 0) DESC) AS section_rank
  FROM base b
  WHERE COALESCE(b.captain_score, 0) > 0
  LIMIT 5
),

breakout_candidates AS (
  SELECT
    b.*,
    'breakout'::text                     AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.value_score, 0) DESC, COALESCE(b.edge_score, 0) DESC) AS section_rank
  FROM base b
  WHERE
    b.player_id NOT IN (SELECT cc.player_id FROM captain_candidates cc)
    AND COALESCE(b.value_score, 0) > 0
    AND COALESCE(b.price, 0) < 600000
  LIMIT 5
),

trap_candidates AS (
  SELECT
    b.*,
    'trap'::text                         AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.risk_rating, 0) DESC) AS section_rank
  FROM base b
  WHERE
    b.player_id NOT IN (SELECT cc.player_id FROM captain_candidates cc)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
    AND COALESCE(b.risk_rating, 0) >= 6
  LIMIT 5
),

combined AS (
  SELECT * FROM captain_candidates
  UNION ALL
  SELECT * FROM breakout_candidates
  UNION ALL
  SELECT * FROM trap_candidates
)

SELECT
  player_id,
  player_name,
  team,
  player_position,
  section,
  section_rank,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  upside_rating,
  risk_rating,
  projection_confidence,
  captain_score,
  captain_rating,
  neeko_rating,
  price,
  price_change,
  value_score,
  value_tag,
  ai_summary,
  recommendation_color,
  refreshed_at,
  edge_score,
  edge_tier,
  ai_recommendation,
  summary_short
FROM combined
ORDER BY section, section_rank;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated;
