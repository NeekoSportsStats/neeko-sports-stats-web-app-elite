/*
  # Rewrite Trap Logic — Price Mispricing Signal

  ## Summary
  Replaces the previous multi-condition scoring trap (risk/consistency/value_tier/confidence)
  with a strict PRICE MISPRICING definition.

  ## Changes (Trap section only)
  A player is a Trap pick if they satisfy ALL four conditions:

  1. price_rank <= 50         — must be a premium-priced player (top 50 by price)
  2. value_score < 95         — priced above their value output
  3. projection_rank >= price_rank + 10  — their projection rank lags their price rank by 10+
  4. projection_confidence < 60          — model is not confident in their output

  ## Removed logic
  - No trap on low matchup alone
  - No trap on low form alone
  - No trap on volatility alone

  ## Unchanged
  - Captain section logic
  - Breakout section logic
  - RPC signature and all returned columns
*/

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n int)
RETURNS TABLE (
  player_id            text,
  player_name          text,
  team                 text,
  "position"           text,
  section              text,
  section_rank         bigint,
  projection_final     numeric,
  ceiling_estimate     numeric,
  floor_estimate       numeric,
  upside_rating        numeric,
  risk_rating          numeric,
  projection_confidence numeric,
  captain_score        numeric,
  captain_rating       text,
  neeko_rating         numeric,
  price                numeric,
  value_score          numeric,
  value_tag            text,
  ai_summary           text,
  recommendation_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
WITH ranked AS (
  SELECT
    r.player_id::text                         AS player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence::numeric          AS projection_confidence,
    r.captain_score,
    r.captain_rating,
    r.neeko_rating,
    r.price::numeric                          AS price,
    r.value_score,
    r.value_tier,
    r.value_tag,
    r.consistency_score,
    r.ai_summary,
    r.recommendation_color,
    ROW_NUMBER() OVER (ORDER BY r.neeko_rating    DESC NULLS LAST) AS neeko_rating_rank,
    ROW_NUMBER() OVER (ORDER BY r.price           DESC NULLS LAST) AS price_rank,
    ROW_NUMBER() OVER (ORDER BY r.projection_final DESC NULLS LAST) AS projection_rank
  FROM public.v_rankings_canonical r
),
trap_eligible AS (
  SELECT *
  FROM ranked
  WHERE price_rank        <= 50
    AND value_score        < 95
    AND projection_rank   >= price_rank + 10
    AND projection_confidence < 60
),
sectioned AS (
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM ranked
  UNION ALL
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST) AS section_rank
  FROM ranked
  WHERE value_score > 100
  UNION ALL
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY (price_rank::int - projection_rank::int) DESC NULLS LAST,
               value_score ASC NULLS LAST
    ) AS section_rank
  FROM trap_eligible
)
SELECT
  s.player_id,
  s.player_name,
  s.team,
  s.position,
  s.section,
  s.section_rank,
  s.projection_final,
  s.ceiling_estimate,
  s.floor_estimate,
  s.upside_rating,
  s.risk_rating,
  s.projection_confidence,
  s.captain_score,
  s.captain_rating,
  s.neeko_rating,
  s.price,
  s.value_score,
  s.value_tag,
  s.ai_summary,
  s.recommendation_color
FROM sectioned s
WHERE s.section_rank <= limit_n
ORDER BY s.section, s.section_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO authenticated;
