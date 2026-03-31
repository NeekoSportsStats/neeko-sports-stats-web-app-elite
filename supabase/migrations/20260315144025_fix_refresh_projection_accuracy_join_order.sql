/*
  # Fix refresh_projection_accuracy() join order for statement timeout

  ## Problem
  The previous version started the query from afl.v_player_rankings (a heavy view
  covering all players/games) and applied the 21-day date filter after the full
  view was materialised. Postgres evaluated the entire view before LIMIT could help.

  ## Fix
  Flip the join so the query starts from afl.games_raw filtered to the last 21 days
  (a tiny set — typically < 10 rows per round), then joins into v_player_rankings.
  This forces the planner to scope the work to recent games first.

  ## Indexes
  Already created in prior migration:
  - idx_games_raw_game_date (afl.games_raw.game_date)
  - idx_games_raw_game_id   (afl.games_raw.game_id)
  Both are recreated here as IF NOT EXISTS for safety.
*/

CREATE INDEX IF NOT EXISTS idx_games_raw_game_date
  ON afl.games_raw (game_date);

CREATE INDEX IF NOT EXISTS idx_games_raw_game_id
  ON afl.games_raw (game_id);

CREATE OR REPLACE FUNCTION public.refresh_projection_accuracy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN

  INSERT INTO public.projection_accuracy (
    player_id,
    season,
    round_number,
    round_label,
    game_id,
    projection,
    projected_score,
    actual_score,
    error,
    abs_error,
    within_10,
    injury_excluded,
    created_at
  )
  SELECT
    r.player_id,
    EXTRACT(YEAR FROM g.game_date)::int,
    COALESCE(g.week, 0),
    g.round,
    g.game_id,
    r.projection::numeric,
    r.projection::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::boolean,
    NULL::boolean,
    now()
  FROM afl.games_raw g
  JOIN afl.v_player_rankings r
    ON r.game_id = g.game_id
  WHERE g.game_date >= now() - INTERVAL '21 days'
  ON CONFLICT (player_id, game_id) DO NOTHING;

END;
$$;
