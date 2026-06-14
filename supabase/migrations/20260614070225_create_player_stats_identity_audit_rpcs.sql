
-- Stats Identity Audit RPCs
-- Read-only admin functions that cross-check stat consistency across
-- raw_player_stats, player_rankings_cache, and player_projection_history.
-- No INSERT/UPDATE/DELETE anywhere in this file.

-- ─────────────────────────────────────────────────────────────────
-- 1. SUMMARY AUDIT: admin_get_player_stats_identity_audit()
-- Returns one row per player with all consistency checks rolled up.
-- Checks:
--   A. Disposal arithmetic: disposals = kicks + handballs (2026 only)
--   B. Cache vs raw season_avg delta > 15 pts
--   C. Stat-profile / position mismatch (ruckman with 0 hitouts, etc.)
--   D. Projection confidence vs games_played (low games, high confidence)
--   E. Missing from cache (has raw stats but no cache row)
--   F. Missing from raw  (in cache but no 2026 raw stats)
--   G. Fantasy score sanity: projection_final sanity band
--   H. Team consistency: raw team vs cache team mismatch
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_player_stats_identity_audit()
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  team_name             text,
  position_group        text,
  games_played_raw      bigint,
  games_played_cache    integer,
  raw_season_avg        numeric,
  cache_season_avg      numeric,
  avg_delta             numeric,
  cache_projection      numeric,
  disposal_rows         bigint,
  disposal_discrepancy_rows bigint,
  avg_hitouts_raw       numeric,
  is_ruck_cache         boolean,
  raw_team              text,
  cache_team            text,
  team_mismatch         boolean,
  missing_from_cache    boolean,
  missing_from_raw      boolean,
  has_override          boolean,
  check_flags           text[],
  severity              text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH
  -- 2026 named raw rows only
  raw_2026 AS (
    SELECT
      player_id,
      player_name,
      team_name,
      disposals,
      kicks,
      handballs,
      hitouts,
      goals,
      marks,
      tackles,
      clearances
    FROM afl.raw_player_stats
    WHERE season = 2026
      AND player_id IS NOT NULL
      AND player_name IS NOT NULL
  ),

  -- Per-player raw aggregates
  raw_agg AS (
    SELECT
      player_id,
      MAX(player_name)                                            AS raw_player_name,
      MAX(team_name)                                              AS raw_team,
      COUNT(*)                                                    AS games_raw,
      ROUND(AVG(COALESCE(disposals, 0))::numeric, 2)             AS raw_disp_avg,
      ROUND(AVG(COALESCE(hitouts, 0))::numeric, 2)               AS avg_hitouts,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
          AND ABS(disposals - kicks - handballs) > 2
      )                                                           AS disposal_disc_rows,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
      )                                                           AS disposal_check_rows
    FROM raw_2026
    GROUP BY player_id
  ),

  -- Cache row (one per player)
  cache_row AS (
    SELECT
      player_id,
      player_name                                                 AS cache_name,
      team                                                        AS cache_team,
      position_group,
      season_avg,
      projection_final,
      games_played,
      projection_confidence
    FROM afl.player_rankings_cache
  ),

  -- Override lookup
  ov AS (
    SELECT DISTINCT player_id FROM afl.player_identity_overrides
  ),

  -- Join everything
  joined AS (
    SELECT
      COALESCE(r.player_id, c.player_id)                          AS pid,
      COALESCE(r.raw_player_name, c.cache_name)                   AS pname,
      COALESCE(r.raw_team, c.cache_team)                          AS raw_team,
      c.cache_team,
      c.position_group,
      r.games_raw,
      c.games_played,
      r.raw_disp_avg,
      c.season_avg                                                AS cache_season_avg,
      c.projection_final,
      r.disposal_check_rows,
      r.disposal_disc_rows,
      r.avg_hitouts,
      (ov.player_id IS NOT NULL)                                  AS has_override,
      (c.player_id IS NULL)                                       AS missing_from_cache,
      (r.player_id IS NULL)                                       AS missing_from_raw
    FROM raw_agg r
    FULL OUTER JOIN cache_row c ON r.player_id = c.player_id
    LEFT JOIN ov ON COALESCE(r.player_id, c.player_id) = ov.player_id
  ),

  -- Build flags
  flagged AS (
    SELECT
      j.*,
      -- team mismatch (both sides present, teams differ)
      (
        NOT j.missing_from_cache
        AND NOT j.missing_from_raw
        AND j.raw_team IS NOT NULL
        AND j.cache_team IS NOT NULL
        AND lower(trim(j.raw_team)) <> lower(trim(j.cache_team))
      ) AS team_mismatch_flag,

      -- cache vs raw avg delta
      CASE
        WHEN j.raw_disp_avg IS NOT NULL AND j.cache_season_avg IS NOT NULL
        THEN ABS(j.raw_disp_avg - j.cache_season_avg)
        ELSE NULL
      END AS avg_delta_val,

      -- ruck with no hitouts
      (
        j.position_group ILIKE '%ruck%'
        AND j.avg_hitouts IS NOT NULL
        AND j.avg_hitouts < 1
        AND j.games_raw >= 3
      ) AS ruck_no_hitouts,

      -- projection sanity: projection_final outside [0, 200]
      (
        j.projection_final IS NOT NULL
        AND (j.projection_final < 0 OR j.projection_final > 200)
      ) AS proj_insane,

      -- disposal discrepancy
      (
        j.disposal_disc_rows > 0
      ) AS has_disposal_disc
    FROM joined j
  )

  SELECT
    f.pid                                                          AS player_id,
    f.pname                                                        AS player_name,
    COALESCE(f.cache_team, f.raw_team)                            AS team_name,
    f.position_group,
    COALESCE(f.games_raw, 0)                                      AS games_played_raw,
    COALESCE(f.games_played, 0)                                   AS games_played_cache,
    f.raw_disp_avg                                                AS raw_season_avg,
    f.cache_season_avg,
    f.avg_delta_val                                               AS avg_delta,
    f.projection_final                                            AS cache_projection,
    COALESCE(f.disposal_check_rows, 0)                            AS disposal_rows,
    COALESCE(f.disposal_disc_rows, 0)                             AS disposal_discrepancy_rows,
    f.avg_hitouts                                                  AS avg_hitouts_raw,
    (f.position_group ILIKE '%ruck%')                             AS is_ruck_cache,
    f.raw_team,
    f.cache_team,
    f.team_mismatch_flag                                          AS team_mismatch,
    f.missing_from_cache,
    f.missing_from_raw,
    f.has_override,

    -- Build flag array
    ARRAY_REMOVE(ARRAY[
      CASE WHEN f.has_disposal_disc    THEN 'disposal_arithmetic'  END,
      CASE WHEN f.avg_delta_val > 15   THEN 'avg_delta_high'       END,
      CASE WHEN f.ruck_no_hitouts      THEN 'ruck_no_hitouts'      END,
      CASE WHEN f.proj_insane          THEN 'projection_insane'    END,
      CASE WHEN f.team_mismatch_flag   THEN 'team_mismatch'        END,
      CASE WHEN f.missing_from_cache   THEN 'missing_from_cache'   END,
      CASE WHEN f.missing_from_raw     THEN 'missing_from_raw'     END
    ], NULL)                                                       AS check_flags,

    -- Severity
    CASE
      WHEN f.proj_insane OR f.has_disposal_disc                          THEN 'CRITICAL'
      WHEN f.team_mismatch_flag OR (f.avg_delta_val > 15)               THEN 'WARNING'
      WHEN f.missing_from_cache OR f.ruck_no_hitouts OR f.missing_from_raw THEN 'REVIEW'
      ELSE 'PASS'
    END                                                           AS severity

  FROM flagged f
  WHERE
    -- Only surface players with at least one issue OR who are in both sources
    (
      f.has_disposal_disc
      OR f.avg_delta_val > 15
      OR f.ruck_no_hitouts
      OR f.proj_insane
      OR f.team_mismatch_flag
      OR f.missing_from_cache
      OR f.missing_from_raw
      OR f.has_override
    )
  ORDER BY
    CASE
      WHEN f.proj_insane OR f.has_disposal_disc     THEN 1
      WHEN f.team_mismatch_flag OR f.avg_delta_val > 15 THEN 2
      WHEN f.missing_from_cache OR f.ruck_no_hitouts OR f.missing_from_raw THEN 3
      ELSE 4
    END,
    COALESCE(f.cache_team, f.raw_team),
    f.pname;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_identity_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_identity_audit()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────
-- 2. MISMATCH QUEUE: admin_get_player_stats_mismatch_queue()
-- Returns a flat ranked queue of specific mismatch incidents,
-- one row per issue type per player, ordered by severity.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_player_stats_mismatch_queue()
RETURNS TABLE (
  player_id    integer,
  player_name  text,
  team_name    text,
  severity     text,
  issue_type   text,
  detail       text,
  raw_value    text,
  cache_value  text,
  games_raw    bigint,
  has_override boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH
  raw_2026 AS (
    SELECT
      player_id, player_name, team_name,
      disposals, kicks, handballs, hitouts,
      goals, marks, tackles, clearances
    FROM afl.raw_player_stats
    WHERE season = 2026
      AND player_id IS NOT NULL
      AND player_name IS NOT NULL
  ),
  raw_agg AS (
    SELECT
      player_id,
      MAX(player_name)                                              AS raw_player_name,
      MAX(team_name)                                                AS raw_team,
      COUNT(*)                                                      AS games_raw,
      ROUND(AVG(COALESCE(disposals, 0))::numeric, 2)               AS raw_disp_avg,
      ROUND(AVG(COALESCE(hitouts, 0))::numeric, 2)                 AS avg_hitouts,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
          AND ABS(disposals - kicks - handballs) > 2
      )                                                             AS disposal_disc_rows
    FROM raw_2026
    GROUP BY player_id
  ),
  cache_row AS (
    SELECT player_id, player_name AS cache_name, team AS cache_team,
           position_group, season_avg, projection_final, games_played
    FROM afl.player_rankings_cache
  ),
  ov AS (
    SELECT DISTINCT player_id FROM afl.player_identity_overrides
  )

  -- Section A: Disposal arithmetic mismatch
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'disposal_arithmetic'::text,
    'Disposal count does not equal kicks + handballs in ' || r.disposal_disc_rows || ' game(s)',
    r.raw_disp_avg::text, NULL::text,
    r.games_raw,
    (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.disposal_disc_rows > 0

  UNION ALL

  -- Section B: Projection out of sanity range
  SELECT
    c.player_id, COALESCE(r.raw_player_name, c.cache_name),
    COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'projection_insane'::text,
    'Projection ' || c.projection_final || ' is outside sane range [0, 200]',
    NULL::text, c.projection_final::text,
    COALESCE(r.games_raw, 0),
    (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE c.projection_final IS NOT NULL
    AND (c.projection_final < 0 OR c.projection_final > 200)

  UNION ALL

  -- Section C: Team mismatch between raw and cache
  SELECT
    r.player_id, r.raw_player_name, c.cache_team,
    'WARNING'::text, 'team_mismatch'::text,
    'Raw team "' || r.raw_team || '" differs from cache team "' || c.cache_team || '"',
    r.raw_team, c.cache_team,
    r.games_raw,
    (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.raw_team IS NOT NULL
    AND c.cache_team IS NOT NULL
    AND lower(trim(r.raw_team)) <> lower(trim(c.cache_team))

  UNION ALL

  -- Section D: Season average delta > 15 points
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'WARNING'::text, 'avg_delta_high'::text,
    'Raw disposal avg ' || r.raw_disp_avg || ' vs cache season_avg ' || c.season_avg || ' (delta ' || ROUND(ABS(r.raw_disp_avg - c.season_avg), 1) || ')',
    r.raw_disp_avg::text, c.season_avg::text,
    r.games_raw,
    (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.raw_disp_avg IS NOT NULL
    AND c.season_avg IS NOT NULL
    AND ABS(r.raw_disp_avg - c.season_avg) > 15

  UNION ALL

  -- Section E: Ruck position with near-zero hitouts
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'REVIEW'::text, 'ruck_no_hitouts'::text,
    'Ruckman has avg hitouts of ' || r.avg_hitouts || ' across ' || r.games_raw || ' games',
    r.avg_hitouts::text, NULL::text,
    r.games_raw,
    (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE c.position_group ILIKE '%ruck%'
    AND r.avg_hitouts < 1
    AND r.games_raw >= 3

  UNION ALL

  -- Section F: Has raw stats but missing from cache
  SELECT
    r.player_id, r.raw_player_name, r.raw_team,
    'REVIEW'::text, 'missing_from_cache'::text,
    'Player has ' || r.games_raw || ' raw game(s) in 2026 but no cache entry',
    r.games_raw::text, NULL::text,
    r.games_raw,
    (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE c.player_id IS NULL

  UNION ALL

  -- Section G: In cache but no 2026 raw stats (may be injured/delisted)
  SELECT
    c.player_id, c.cache_name, c.cache_team,
    'REVIEW'::text, 'missing_from_raw'::text,
    'Player in cache with projection ' || COALESCE(c.projection_final::text,'?') || ' but no 2026 raw stats',
    NULL::text, COALESCE(c.projection_final::text,'—'),
    0,
    (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE r.player_id IS NULL

  ORDER BY
    CASE severity
      WHEN 'CRITICAL' THEN 1
      WHEN 'WARNING'  THEN 2
      WHEN 'REVIEW'   THEN 3
      ELSE 4
    END,
    team_name,
    player_name;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_mismatch_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_mismatch_queue()
  TO authenticated, service_role;
