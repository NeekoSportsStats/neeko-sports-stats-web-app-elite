/*
  # Fix get_edge_board_data RPC Signal Vocabulary

  ## Problem
  `get_edge_board_data` filters for signals 'STRONG_BUY', 'BUY', 'SELL', 'STRONG_SELL'
  but the rankings cache stores 'STRONG_START', 'START', 'HOLD', 'SIT', 'STRONG_SIT'.
  All three sections return zero rows.

  ## Fix
  Update signal filters to match current vocabulary.
  - must_have: STRONG_START or START (replaces STRONG_BUY, BUY)
  - breakout: STRONG_START (replaces STRONG_BUY)
  - do_not_start: SIT or STRONG_SIT (replaces SELL, STRONG_SELL)
*/

DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 5)
RETURNS TABLE(
  player_id            integer,
  player_name          text,
  team                 text,
  player_position      text,
  section              text,
  section_rank         bigint,
  projection_final     numeric,
  ceiling_estimate     double precision,
  floor_estimate       double precision,
  upside_rating        double precision,
  risk_rating          double precision,
  projection_confidence double precision,
  captain_score        double precision,
  captain_rating       text,
  neeko_rating         double precision,
  price                integer,
  price_change         integer,
  value_score          double precision,
  value_tag            text,
  ai_summary           text,
  recommendation_color text,
  refreshed_at         timestamptz,
  edge                 numeric,
  signal_tag           text,
  signal               text,
  summary_short        text,
  trend_signal         text,
  breakeven            numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH base AS (
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, c.team)              AS team,
    c."position"                               AS player_position,
    c.projection_final, c.ceiling_estimate, c.floor_estimate,
    c.upside_rating, c.risk_rating, c.projection_confidence,
    c.captain_score, c.captain_rating, c.neeko_rating,
    c.price, c.price_change,
    c.value_score_canonical::double precision  AS value_score,
    COALESCE(c.signal_display, c.signal_canonical) AS value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.cached_at                                AS refreshed_at,
    c.edge_canonical                           AS edge,
    c.breakeven_canonical                      AS breakeven,
    c.signal_canonical                         AS signal,
    c.signal_canonical                         AS signal_tag,
    c.summary_short,
    c.signal_canonical                         AS trend_signal
  FROM afl.player_rankings_cache c
  WHERE c.games_played >= 3
    AND c.projection_final > 40
    AND c.price > 0
    AND COALESCE(c.manual_status, c.status, '') NOT IN
        ('injured', 'inactive', 'inactive_ghost', 'OUT', 'INJURED', 'OMITTED')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
),

-- Must Have: STRONG_START or START signal (was STRONG_BUY, BUY)
must_have_candidates AS (
  SELECT b.*, 'must_have'::text AS section,
    ROW_NUMBER() OVER (ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST) AS section_rank
  FROM base b
  WHERE b.signal IN ('STRONG_START', 'START')
  LIMIT limit_n
),

-- Breakout: STRONG_START only (was STRONG_BUY)
breakout_candidates AS (
  SELECT b.*, 'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY b.edge DESC NULLS LAST, b.value_score DESC NULLS LAST) AS section_rank
  FROM base b
  WHERE b.signal = 'STRONG_START'
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
  LIMIT limit_n
),

-- Do Not Start: SIT or STRONG_SIT (was SELL, STRONG_SELL)
do_not_start_candidates AS (
  SELECT b.*, 'do_not_start'::text AS section,
    ROW_NUMBER() OVER (ORDER BY b.edge ASC NULLS LAST, b.risk_rating DESC NULLS LAST) AS section_rank
  FROM base b
  WHERE b.signal IN ('SIT', 'STRONG_SIT')
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
  LIMIT limit_n
)

SELECT
  player_id, player_name, team, player_position, section, section_rank,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating, price, price_change,
  value_score, value_tag, ai_summary, recommendation_color, refreshed_at, edge,
  signal_tag, signal, summary_short, trend_signal, breakeven
FROM (
  SELECT * FROM must_have_candidates
  UNION ALL SELECT * FROM breakout_candidates
  UNION ALL SELECT * FROM do_not_start_candidates
) combined
ORDER BY section, section_rank;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated, service_role;
