/*
  # Create get_player_chart_data RPC (v2)

  ## Purpose
  Canonical data source for the player modal score history chart.
  Returns merged actual game scores + historical pre-game projections.

  ## Returns per row
  - round_label: "R1", "R2", "OR", "GF", etc.
  - round_number: integer (week number)
  - season: integer
  - game_id: integer
  - actual_score: numeric (null if not yet played)
  - projected_score: numeric (from projection_history if snapshot exists)
  - is_future: boolean (true = upcoming game, no actual score yet)

  ## Data Sources
  - Actuals: afl.player_games (fantasy_score, week)
  - Projections: afl.player_projection_history (projection_final, joined by player_id + game_id)
  - Round numbers: afl.games (game_id -> week)

  ## Notes
  - Returns last n_games completed games + next upcoming game projection
  - As the 2026 season starts, past games with saved projections will show both lines
  - If no projection snapshot exists for a past game, projected_score is null
  - Two overloads: integer and text player_id
*/

DROP FUNCTION IF EXISTS public.get_player_chart_data(integer, integer);
DROP FUNCTION IF EXISTS public.get_player_chart_data(text, integer);

CREATE OR REPLACE FUNCTION public.get_player_chart_data(
  p_player_id integer,
  n_games     integer DEFAULT 10
)
RETURNS TABLE (
  round_label      text,
  round_number     integer,
  season           integer,
  game_id          integer,
  actual_score     numeric,
  projected_score  numeric,
  is_future        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  WITH
  -- Past completed games (most recent n_games)
  past AS (
    SELECT
      g.game_id::integer                           AS game_id,
      g.season::integer                            AS season,
      g.week::integer                              AS round_number,
      g.fantasy_score::numeric                     AS actual_score
    FROM afl.player_games g
    WHERE g.player_id = p_player_id
      AND g.fantasy_score IS NOT NULL
      AND g.fantasy_score > 0
    ORDER BY g.season DESC, g.week DESC
    LIMIT n_games
  ),

  -- Projection snapshots that match past games (pre-game projections saved before game played)
  past_proj AS (
    SELECT
      ph.game_id::integer                          AS game_id,
      ph.projection_final::numeric                 AS projected_score
    FROM afl.player_projection_history ph
    WHERE ph.player_id = p_player_id
  ),

  -- Merge past actuals with projections
  past_merged AS (
    SELECT
      p.game_id,
      p.season,
      p.round_number,
      p.actual_score,
      pp.projected_score,
      false::boolean                               AS is_future
    FROM past p
    LEFT JOIN past_proj pp ON pp.game_id = p.game_id
    ORDER BY p.season ASC, p.round_number ASC
  ),

  -- Upcoming projection: earliest future game with a projection snapshot
  upcoming AS (
    SELECT
      ph.game_id::integer                          AS game_id,
      ph.season::integer                           AS season,
      ph.projection_final::numeric                 AS projected_score,
      NULL::numeric                                AS actual_score,
      true::boolean                                AS is_future,
      -- Join to afl.games for the week number
      COALESCE(ga.week, 0)::integer                AS round_number
    FROM afl.player_projection_history ph
    LEFT JOIN afl.games ga ON ga.game_id = ph.game_id
    WHERE ph.player_id = p_player_id
      AND ph.game_date > now()
    ORDER BY ph.game_date ASC
    LIMIT 1
  ),

  -- Union past and upcoming
  combined AS (
    SELECT game_id, season, round_number, actual_score, projected_score, is_future
    FROM past_merged

    UNION ALL

    SELECT game_id, season, round_number, actual_score, projected_score, is_future
    FROM upcoming
  )

  SELECT
    CASE
      WHEN round_number = 0  THEN 'OR'
      WHEN round_number = 25 THEN 'EF'
      WHEN round_number = 26 THEN 'SF'
      WHEN round_number = 27 THEN 'PF'
      WHEN round_number = 28 THEN 'GF'
      ELSE 'R' || round_number::text
    END                        AS round_label,
    round_number,
    season,
    game_id,
    actual_score,
    projected_score,
    is_future
  FROM combined
  ORDER BY season ASC, round_number ASC, is_future ASC;
$$;

-- Text overload (frontend passes player_id as string)
CREATE OR REPLACE FUNCTION public.get_player_chart_data(
  p_player_id text,
  n_games     integer DEFAULT 10
)
RETURNS TABLE (
  round_label      text,
  round_number     integer,
  season           integer,
  game_id          integer,
  actual_score     numeric,
  projected_score  numeric,
  is_future        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT * FROM public.get_player_chart_data(p_player_id::integer, n_games);
$$;

GRANT EXECUTE ON FUNCTION public.get_player_chart_data(integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_chart_data(text, integer) TO anon, authenticated;
