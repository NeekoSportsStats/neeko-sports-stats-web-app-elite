/*
  # Create get_content_intel_completed_game RPC

  Admin-only function for the Post-Game Review tab in AdminContentIntel.

  ## What it does
  Returns completed-game player stats with projection comparison for content creation.

  ## Parameters
  - p_season: season year (default 2026)
  - p_round: specific round filter (null = latest completed round)
  - p_match_id: specific game_id filter (null = all games in round)
  - p_lens: stat family to analyse (disposals/goals/marks/tackles/kicks/handballs/clearances/hitouts/fantasy)
  - p_threshold: minimum value to count as a "hit" (default 20)
  - p_limit: max rows returned (default 500)

  ## Tables read
  - afl.player_games — actual stats
  - afl.games_raw — match context (FT games only)
  - public.player_rankings_cache — pre-game projections

  ## Security
  - SECURITY DEFINER
  - Admin guard: checks profiles.is_admin = true
  - Returns empty set for non-admins (no error exposed)

  ## Notes
  - Rollover-safe: uses MAX(week) from FT games, not get_current_afl_round_safe()
  - `position` is a PostgreSQL reserved keyword — uses player_position instead
  - result_label values: hit, missed, hit_beat_proj, hit_under_proj, missed_beat_proj
  - copy_bullet and proof_caption_line contain no betting language
*/

CREATE OR REPLACE FUNCTION public.get_content_intel_completed_game(
  p_season    integer DEFAULT 2026,
  p_round     integer DEFAULT NULL,
  p_match_id  integer DEFAULT NULL,
  p_lens      text    DEFAULT 'disposals',
  p_threshold numeric DEFAULT 20,
  p_limit     integer DEFAULT 500
)
RETURNS TABLE(
  season              integer,
  round               integer,
  game_id             integer,
  game_label          text,
  game_date           timestamptz,
  home_team           text,
  away_team           text,
  player_id           integer,
  player_name         text,
  team                text,
  opponent            text,
  player_position     text,
  stat_family         text,
  actual_value        integer,
  projected_value     numeric,
  projection_delta    numeric,
  threshold           numeric,
  hit_threshold       boolean,
  result_label        text,
  recent_average      numeric,
  l3_average          numeric,
  l5_average          numeric,
  season_average      numeric,
  copy_bullet         text,
  proof_caption_line  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin   boolean;
  v_round      integer;
  v_stat_col   text;
BEGIN
  -- Admin guard
  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_is_admin IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Resolve round: use provided, else latest completed round
  IF p_round IS NOT NULL THEN
    v_round := p_round;
  ELSE
    SELECT MAX(g.week)
    INTO v_round
    FROM afl.games_raw g
    WHERE g.season = p_season
      AND g.status_short = 'FT';
  END IF;

  -- Map lens to column name for dynamic SQL safety (whitelist)
  v_stat_col := CASE p_lens
    WHEN 'disposals'   THEN 'disposals'
    WHEN 'goals'       THEN 'goals'
    WHEN 'marks'       THEN 'marks'
    WHEN 'tackles'     THEN 'tackles'
    WHEN 'kicks'       THEN 'kicks'
    WHEN 'handballs'   THEN 'handballs'
    WHEN 'clearances'  THEN 'clearances'
    WHEN 'hitouts'     THEN 'hitouts'
    WHEN 'fantasy'     THEN 'fantasy_score'
    ELSE 'disposals'
  END;

  RETURN QUERY EXECUTE format(
    $q$
    WITH completed_games AS (
      SELECT
        g.game_id,
        g.season,
        g.week   AS round,
        g.game_date,
        g.home_team_name,
        g.away_team_name,
        g.home_team_id,
        g.away_team_id,
        g.home_team_name || ' v ' || g.away_team_name AS game_label
      FROM afl.games_raw g
      WHERE g.season = %1$L::integer
        AND g.week   = %2$L::integer
        AND g.status_short = 'FT'
        AND (%3$L::integer IS NULL OR g.game_id = %3$L::integer)
    ),
    player_stats AS (
      SELECT
        pg.player_id,
        pg.player_name,
        pg.team_id,
        pg.team_name,
        pg.game_id,
        pg.season,
        pg.week,
        pg.%4$I  AS actual_raw
      FROM afl.player_games pg
      WHERE pg.season = %1$L::integer
        AND pg.week   = %2$L::integer
        AND pg.%4$I  IS NOT NULL
    ),
    joined AS (
      SELECT
        ps.player_id,
        ps.player_name,
        ps.team_name                                                AS team,
        CASE
          WHEN ps.team_id = cg.home_team_id THEN cg.away_team_name
          ELSE cg.home_team_name
        END                                                         AS opponent,
        cg.season,
        cg.round,
        cg.game_id,
        cg.game_label,
        cg.game_date,
        cg.home_team_name,
        cg.away_team_name,
        ps.actual_raw::integer                                      AS actual_value,
        COALESCE(pr.projection_final, pr.projection, pr.season_avg) AS projected_value,
        COALESCE(pr.position_group, '—')                            AS player_position,
        pr.last_3_avg                                               AS l3_average,
        pr.last_5_avg                                               AS l5_average,
        pr.season_avg                                               AS season_average
      FROM player_stats ps
      JOIN completed_games cg ON cg.game_id = ps.game_id
      LEFT JOIN public.player_rankings_cache pr
        ON pr.player_id = ps.player_id
    ),
    scored AS (
      SELECT
        j.*,
        %5$s::numeric                                               AS threshold_val,
        %6$L                                                        AS stat_family,
        (j.actual_value >= %5$s::numeric)                          AS hit_threshold,
        (j.actual_value - COALESCE(j.projected_value, 0))          AS projection_delta,
        COALESCE(j.l3_average, j.season_average, 0)                AS recent_avg,

        -- result_label
        CASE
          WHEN j.actual_value >= %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value >= j.projected_value            THEN 'hit_beat_proj'
          WHEN j.actual_value >= %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value < j.projected_value             THEN 'hit_under_proj'
          WHEN j.actual_value >= %5$s::numeric                     THEN 'hit'
          WHEN j.actual_value < %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value >= j.projected_value            THEN 'missed_beat_proj'
          ELSE                                                          'missed'
        END                                                         AS result_label,

        -- copy_bullet (no betting language)
        j.player_name || ' — ' || j.actual_value || ' ' || %6$L
          || CASE
               WHEN j.projected_value IS NOT NULL
               THEN ' (proj: ' || ROUND(j.projected_value, 0)::text || ')'
               ELSE ''
             END                                                     AS copy_bullet,

        -- proof_caption_line (social-ready, no betting language)
        CASE
          WHEN j.actual_value >= %5$s::numeric
          THEN j.player_name || ' delivered ' || j.actual_value || ' ' || %6$L
               || ' for ' || j.team_name
               || CASE
                    WHEN j.projected_value IS NOT NULL
                         AND j.actual_value >= j.projected_value
                    THEN ' — beat the projection by '
                         || ABS(ROUND(j.actual_value - j.projected_value, 0))::text
                    WHEN j.projected_value IS NOT NULL
                    THEN ' — came in under projection'
                    ELSE ''
                  END
          ELSE j.player_name || ' fell short with ' || j.actual_value || ' ' || %6$L
               || ' for ' || j.team_name
               || CASE
                    WHEN j.projected_value IS NOT NULL
                    THEN ' (proj was '
                         || ROUND(j.projected_value, 0)::text || ')'
                    ELSE ''
                  END
        END                                                          AS proof_caption_line

      FROM joined j
    )
    SELECT
      s.season,
      s.round,
      s.game_id,
      s.game_label,
      s.game_date,
      s.home_team_name,
      s.away_team_name,
      s.player_id,
      s.player_name,
      s.team,
      s.opponent,
      s.player_position,
      s.stat_family,
      s.actual_value,
      s.projected_value,
      s.projection_delta,
      s.threshold_val     AS threshold,
      s.hit_threshold,
      s.result_label,
      s.recent_avg        AS recent_average,
      s.l3_average,
      s.l5_average,
      s.season_average,
      s.copy_bullet,
      s.proof_caption_line
    FROM scored s
    ORDER BY s.hit_threshold DESC, s.actual_value DESC
    LIMIT %7$s
    $q$,
    p_season,          -- %1$L
    v_round,           -- %2$L
    p_match_id,        -- %3$L
    v_stat_col,        -- %4$I  (identifier — safe because whitelisted above)
    p_threshold,       -- %5$s  (numeric literal)
    p_lens,            -- %6$L  (label string)
    p_limit            -- %7$s  (integer)
  );
END;
$$;

-- Grant execute to authenticated only (admin guard inside function)
REVOKE ALL ON FUNCTION public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer) TO authenticated;
