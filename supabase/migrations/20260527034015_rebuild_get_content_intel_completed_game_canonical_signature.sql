/*
  # Rebuild get_content_intel_completed_game with canonical signature

  ## Summary
  Drops the existing overload (which had argument order p_season, p_lens, p_threshold,
  p_limit, p_round, p_match_id) and recreates it with the canonical order:
    p_season, p_round, p_match_id, p_lens, p_threshold, p_limit

  This is the single authoritative definition. PostgREST resolves named-param RPC calls
  by matching argument names, so argument order only matters for preventing ambiguity
  between overloads. With exactly one definition, the 400 "could not choose best candidate"
  error cannot occur.

  ## Changes
  1. DROP existing function (p_season, p_lens, p_threshold, p_limit, p_round, p_match_id)
  2. CREATE canonical function (p_season, p_round, p_match_id, p_lens, p_threshold, p_limit)

  ## Security
  - SECURITY DEFINER with admin guard (checks profiles.is_admin = true)
  - REVOKE from PUBLIC and anon
  - GRANT to authenticated only (admin check enforced inside function body)

  ## Tables read (read-only)
  - afl.player_games
  - afl.games_raw
  - public.player_rankings_cache
*/

-- Drop existing overload regardless of argument order
DROP FUNCTION IF EXISTS public.get_content_intel_completed_game(integer, text, numeric, integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer);

-- Canonical definition
CREATE OR REPLACE FUNCTION public.get_content_intel_completed_game(
  p_season    integer  DEFAULT 2026,
  p_round     integer  DEFAULT NULL,
  p_match_id  integer  DEFAULT NULL,
  p_lens      text     DEFAULT 'disposals',
  p_threshold numeric  DEFAULT 20,
  p_limit     integer  DEFAULT 500
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
  projection_source   text,
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
  v_round    integer;
  v_stat_col text;
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
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

  IF v_round IS NULL THEN
    RETURN;
  END IF;

  -- Stat column whitelist (prevents SQL injection via dynamic identifier)
  v_stat_col := CASE p_lens
    WHEN 'disposals'   THEN 'disposals'
    WHEN 'goals'       THEN 'goals'
    WHEN 'marks'       THEN 'marks'
    WHEN 'tackles'     THEN 'tackles'
    WHEN 'kicks'       THEN 'kicks'
    WHEN 'handballs'   THEN 'handballs'
    WHEN 'clearances'  THEN 'clearances'
    WHEN 'hitouts'     THEN 'hit_outs'
    WHEN 'fantasy'     THEN 'fantasy_score'
    ELSE NULL
  END;

  IF v_stat_col IS NULL THEN
    RAISE EXCEPTION 'Invalid lens: %', p_lens;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
    WITH completed_games AS (
      SELECT
        g.game_id,
        g.season,
        g.week                                              AS round,
        g.start_time                                        AS game_date,
        g.home_team,
        g.away_team,
        g.home_team || ' v ' || g.away_team                AS game_label
      FROM afl.games_raw g
      WHERE g.season = %1$L::integer
        AND g.week   = %2$L::integer
        AND g.status_short = 'FT'
        AND (%3$L::integer IS NULL OR g.match_id = %3$L::integer)
    ),
    player_stats AS (
      SELECT
        pg.player_id,
        pg.team                                             AS player_team,
        pg.opponent,
        pg.game_id,
        pg.season,
        pg.week,
        pg.%4$I                                             AS actual_raw
      FROM afl.player_games pg
      WHERE pg.season = %1$L::integer
        AND pg.week   = %2$L::integer
        AND pg.%4$I  IS NOT NULL
    ),
    joined AS (
      SELECT
        ps.player_id,
        COALESCE(ap.player_name, 'Player #' || ps.player_id::text)  AS player_name,
        ps.player_team                                               AS team,
        ps.opponent,
        cg.season,
        cg.round,
        cg.game_id,
        cg.game_label,
        cg.game_date,
        cg.home_team,
        cg.away_team,
        ps.actual_raw::integer                                       AS actual_value,
        COALESCE(pr.projection_final, pr.projection, pr.season_avg)  AS projected_value,
        CASE
          WHEN pr.projection_final IS NOT NULL THEN 'projection'
          WHEN pr.projection       IS NOT NULL THEN 'projection'
          WHEN pr.season_avg       IS NOT NULL THEN 'season_avg'
          ELSE 'none'
        END                                                          AS projection_source,
        COALESCE(pr.position_group, '—')                             AS player_position,
        pr.last_3_avg                                                AS l3_average,
        pr.last_5_avg                                                AS l5_average,
        pr.season_avg                                                AS season_average
      FROM player_stats ps
      JOIN completed_games cg ON cg.game_id = ps.game_id
      LEFT JOIN afl.players ap ON ap.id = ps.player_id
      LEFT JOIN public.player_rankings_cache pr ON pr.player_id = ps.player_id
    ),
    scored AS (
      SELECT
        j.*,
        %5$s::numeric                                       AS threshold_val,
        %6$L                                                AS stat_family,
        (j.actual_value >= %5$s::numeric)                   AS hit_threshold,
        CASE
          WHEN j.projected_value IS NOT NULL
          THEN ROUND((j.actual_value - j.projected_value)::numeric, 1)
          ELSE NULL
        END                                                 AS projection_delta,
        COALESCE(j.l3_average, j.season_average, 0)         AS recent_avg,

        CASE
          WHEN j.actual_value >= %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value >= j.projected_value     THEN 'hit_beat_proj'
          WHEN j.actual_value >= %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value < j.projected_value      THEN 'hit_under_proj'
          WHEN j.actual_value >= %5$s::numeric             THEN 'hit'
          WHEN j.actual_value < %5$s::numeric
               AND j.projected_value IS NOT NULL
               AND j.actual_value >= j.projected_value     THEN 'missed_beat_proj'
          ELSE                                                  'missed'
        END                                                 AS result_label,

        j.player_name || ' — ' || j.actual_value || ' ' || %6$L
          || CASE
               WHEN j.projected_value IS NOT NULL
               THEN ' (proj: ' || ROUND(j.projected_value, 0)::text || ')'
               ELSE ''
             END                                            AS copy_bullet,

        CASE
          WHEN j.actual_value >= %5$s::numeric
          THEN j.player_name || ' delivered ' || j.actual_value || ' ' || %6$L
               || ' for ' || j.team
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
               || ' for ' || j.team
               || CASE
                    WHEN j.projected_value IS NOT NULL
                    THEN ' (proj was ' || ROUND(j.projected_value, 0)::text || ')'
                    ELSE ''
                  END
        END                                                 AS proof_caption_line

      FROM joined j
    )
    SELECT
      s.season,
      s.round,
      s.game_id,
      s.game_label,
      s.game_date,
      s.home_team,
      s.away_team,
      s.player_id,
      s.player_name,
      s.team,
      s.opponent,
      s.player_position,
      s.stat_family,
      s.actual_value,
      s.projected_value,
      s.projection_delta,
      s.projection_source,
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
    p_season,     -- %1$L
    v_round,      -- %2$L
    p_match_id,   -- %3$L
    v_stat_col,   -- %4$I (identifier — whitelisted above)
    p_threshold,  -- %5$s (numeric literal)
    p_lens,       -- %6$L (display label)
    p_limit       -- %7$s (integer)
  );
END;
$$;

-- Revoke from public/anon; grant to authenticated only (admin guard enforced inside)
REVOKE ALL ON FUNCTION public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_content_intel_completed_game(integer, integer, integer, text, numeric, integer) TO authenticated;
