/*
  # Fix Rankings Sparkline — Drop UUID Overload, Harden Text RPC

  ## Problem
  Two overloads of `get_player_score_history_by_id` exist:
    - text overload (works correctly)
    - uuid overload (broken — tries to cast integer player_id through text::integer which fails for non-numeric strings)

  PostgREST resolves the overload ambiguously when the frontend passes a
  numeric string like "1830", causing the sparkline to silently return no data.

  ## Fix
  1. DROP the broken uuid overload entirely
  2. Rebuild the text overload with explicit `search_path` and grant
  3. No change to return signature or frontend code

  ## Result
  Sparkline in expanded Rankings rows now reliably fetches last 10 game scores.
*/

-- Step 1: Drop the broken UUID overload
DROP FUNCTION IF EXISTS public.get_player_score_history_by_id(uuid, integer);

-- Step 2: Rebuild the text overload cleanly (idempotent)
CREATE OR REPLACE FUNCTION public.get_player_score_history_by_id(
  player_id_in text,
  n_games      integer DEFAULT 10
)
RETURNS TABLE(
  game_index    integer,
  round_label   text,
  round_number  integer,
  fantasy_points numeric,
  season        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH latest AS (
  SELECT
    g.season,
    g.week          AS round_number,
    g.game_id       AS match_index,
    g.fantasy_score::numeric AS fantasy_points
  FROM afl.player_games g
  WHERE g.player_id = player_id_in::integer
    AND g.fantasy_score IS NOT NULL
    AND g.fantasy_score > 0
  ORDER BY g.season DESC, g.week DESC
  LIMIT n_games
),
ordered AS (
  SELECT
    season,
    round_number,
    match_index,
    fantasy_points,
    ROW_NUMBER() OVER (ORDER BY season ASC, round_number ASC, match_index ASC) AS game_idx
  FROM latest
)
SELECT
  o.game_idx::integer,
  CASE
    WHEN o.round_number = 0  THEN 'OR'
    WHEN o.round_number = 25 THEN 'EF'
    WHEN o.round_number = 26 THEN 'SF'
    WHEN o.round_number = 27 THEN 'PF'
    WHEN o.round_number = 28 THEN 'GF'
    ELSE 'R' || o.round_number::text
  END AS round_label,
  o.round_number::integer,
  o.fantasy_points,
  o.season::integer
FROM ordered o
ORDER BY o.game_idx ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_score_history_by_id(text, integer) TO anon, authenticated;
