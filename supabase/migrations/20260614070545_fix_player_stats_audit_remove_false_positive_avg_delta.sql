
-- Drop and recreate both stats audit RPCs with corrected return types and checks.
-- Removes the false-positive avg_delta_high (raw disposals vs fantasy season_avg).
-- Adds projection_season_gap: season_avg vs projection_final gap > 40 fantasy pts.

DROP FUNCTION IF EXISTS public.admin_get_player_stats_identity_audit();
DROP FUNCTION IF EXISTS public.admin_get_player_stats_mismatch_queue();

-- ─────────────────────────────────────────────────────────────────
-- 1. SUMMARY AUDIT
-- ─────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_player_stats_identity_audit()
RETURNS TABLE (
  player_id                   integer,
  player_name                 text,
  team_name                   text,
  position_group              text,
  games_played_raw            bigint,
  games_played_cache          integer,
  raw_season_avg_disposals    numeric,
  cache_season_avg            numeric,
  cache_projection_final      numeric,
  projection_delta            numeric,
  disposal_rows               bigint,
  disposal_discrepancy_rows   bigint,
  avg_hitouts_raw             numeric,
  is_ruck_cache               boolean,
  raw_team                    text,
  cache_team                  text,
  team_mismatch               boolean,
  missing_from_cache          boolean,
  missing_from_raw            boolean,
  has_override                boolean,
  check_flags                 text[],
  severity                    text
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
    SELECT player_id, player_name, team_name,
           disposals, kicks, handballs, hitouts
    FROM afl.raw_player_stats
    WHERE season = 2026
      AND player_id IS NOT NULL
      AND player_name IS NOT NULL
  ),
  raw_agg AS (
    SELECT
      player_id,
      MAX(player_name)                                          AS raw_player_name,
      MAX(team_name)                                            AS raw_team,
      COUNT(*)                                                  AS games_raw,
      ROUND(AVG(COALESCE(disposals,0))::numeric, 2)            AS raw_disp_avg,
      ROUND(AVG(COALESCE(hitouts,0))::numeric, 2)              AS avg_hitouts,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
          AND ABS(disposals - kicks - handballs) > 2
      )                                                         AS disposal_disc_rows,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
      )                                                         AS disposal_check_rows
    FROM raw_2026
    GROUP BY player_id
  ),
  cache_row AS (
    SELECT player_id, player_name AS cache_name, team AS cache_team,
           position_group, season_avg, projection_final, games_played, last_3_avg
    FROM afl.player_rankings_cache
  ),
  ov AS (
    SELECT DISTINCT player_id FROM afl.player_identity_overrides
  ),
  joined AS (
    SELECT
      COALESCE(r.player_id, c.player_id)                        AS pid,
      COALESCE(r.raw_player_name, c.cache_name)                 AS pname,
      r.raw_team,
      c.cache_team,
      c.position_group,
      r.games_raw,
      c.games_played,
      r.raw_disp_avg,
      c.season_avg,
      c.projection_final,
      r.disposal_check_rows,
      r.disposal_disc_rows,
      r.avg_hitouts,
      (ov.player_id IS NOT NULL)                                AS has_override,
      (c.player_id IS NULL)                                     AS missing_from_cache,
      (r.player_id IS NULL)                                     AS missing_from_raw
    FROM raw_agg r
    FULL OUTER JOIN cache_row c ON r.player_id = c.player_id
    LEFT JOIN ov ON COALESCE(r.player_id, c.player_id) = ov.player_id
  ),
  flagged AS (
    SELECT j.*,
      (
        NOT j.missing_from_cache AND NOT j.missing_from_raw
        AND j.raw_team IS NOT NULL AND j.cache_team IS NOT NULL
        AND lower(trim(j.raw_team)) <> lower(trim(j.cache_team))
      ) AS team_mismatch_flag,
      (COALESCE(j.disposal_disc_rows, 0) > 0) AS has_disposal_disc,
      (
        j.position_group ILIKE '%ruck%'
        AND j.avg_hitouts IS NOT NULL AND j.avg_hitouts < 1
        AND COALESCE(j.games_raw, 0) >= 3
      ) AS ruck_no_hitouts,
      (
        j.projection_final IS NOT NULL
        AND (j.projection_final < 0 OR j.projection_final > 200)
      ) AS proj_insane,
      (
        j.season_avg IS NOT NULL
        AND j.projection_final IS NOT NULL
        AND ABS(j.season_avg - j.projection_final) > 40
      ) AS projection_season_gap
    FROM joined j
  )
  SELECT
    f.pid, f.pname,
    COALESCE(f.cache_team, f.raw_team),
    f.position_group,
    COALESCE(f.games_raw, 0),
    COALESCE(f.games_played, 0),
    f.raw_disp_avg,
    f.season_avg,
    f.projection_final,
    CASE
      WHEN f.season_avg IS NOT NULL AND f.projection_final IS NOT NULL
      THEN ABS(f.season_avg - f.projection_final)
      ELSE NULL
    END,
    COALESCE(f.disposal_check_rows, 0),
    COALESCE(f.disposal_disc_rows, 0),
    f.avg_hitouts,
    (f.position_group ILIKE '%ruck%'),
    f.raw_team, f.cache_team,
    f.team_mismatch_flag,
    f.missing_from_cache,
    f.missing_from_raw,
    f.has_override,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN f.has_disposal_disc     THEN 'disposal_arithmetic'   END,
      CASE WHEN f.proj_insane           THEN 'projection_insane'     END,
      CASE WHEN f.projection_season_gap THEN 'projection_season_gap' END,
      CASE WHEN f.team_mismatch_flag    THEN 'team_mismatch'         END,
      CASE WHEN f.ruck_no_hitouts       THEN 'ruck_no_hitouts'       END,
      CASE WHEN f.missing_from_cache    THEN 'missing_from_cache'    END,
      CASE WHEN f.missing_from_raw      THEN 'missing_from_raw'      END
    ], NULL),
    CASE
      WHEN f.proj_insane OR f.has_disposal_disc                  THEN 'CRITICAL'
      WHEN f.team_mismatch_flag OR f.projection_season_gap       THEN 'WARNING'
      WHEN f.missing_from_cache OR f.ruck_no_hitouts OR f.missing_from_raw THEN 'REVIEW'
      ELSE 'PASS'
    END
  FROM flagged f
  WHERE
    f.has_disposal_disc OR f.proj_insane OR f.projection_season_gap
    OR f.team_mismatch_flag OR f.ruck_no_hitouts
    OR f.missing_from_cache OR f.missing_from_raw OR f.has_override
  ORDER BY
    CASE
      WHEN f.proj_insane OR f.has_disposal_disc          THEN 1
      WHEN f.team_mismatch_flag OR f.projection_season_gap THEN 2
      ELSE 3
    END,
    COALESCE(f.cache_team, f.raw_team),
    f.pname;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_identity_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_identity_audit()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────
-- 2. MISMATCH QUEUE
-- ─────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_player_stats_mismatch_queue()
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
    SELECT player_id, player_name, team_name,
           disposals, kicks, handballs, hitouts
    FROM afl.raw_player_stats
    WHERE season = 2026
      AND player_id IS NOT NULL
      AND player_name IS NOT NULL
  ),
  raw_agg AS (
    SELECT
      player_id,
      MAX(player_name)                                          AS raw_player_name,
      MAX(team_name)                                            AS raw_team,
      COUNT(*)                                                  AS games_raw,
      ROUND(AVG(COALESCE(disposals,0))::numeric, 2)            AS raw_disp_avg,
      ROUND(AVG(COALESCE(hitouts,0))::numeric, 2)              AS avg_hitouts,
      COUNT(*) FILTER (
        WHERE disposals IS NOT NULL
          AND kicks IS NOT NULL
          AND handballs IS NOT NULL
          AND ABS(disposals - kicks - handballs) > 2
      )                                                         AS disposal_disc_rows
    FROM raw_2026
    GROUP BY player_id
  ),
  cache_row AS (
    SELECT player_id, player_name AS cache_name, team AS cache_team,
           position_group, season_avg, projection_final, games_played, last_3_avg
    FROM afl.player_rankings_cache
  ),
  ov AS (
    SELECT DISTINCT player_id FROM afl.player_identity_overrides
  )

  -- A: Disposal arithmetic mismatch (CRITICAL)
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'disposal_arithmetic'::text,
    'Disposal count does not equal kicks + handballs in ' || r.disposal_disc_rows || ' game(s)',
    r.raw_disp_avg::text, NULL::text,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.disposal_disc_rows > 0

  UNION ALL

  -- B: Projection out of sane range (CRITICAL)
  SELECT
    c.player_id, COALESCE(r.raw_player_name, c.cache_name),
    COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'projection_insane'::text,
    'Projection ' || c.projection_final || ' is outside sane range [0, 200]',
    NULL::text, c.projection_final::text,
    COALESCE(r.games_raw, 0), (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE c.projection_final IS NOT NULL
    AND (c.projection_final < 0 OR c.projection_final > 200)

  UNION ALL

  -- C: Team mismatch between raw and cache (WARNING)
  SELECT
    r.player_id, r.raw_player_name, c.cache_team,
    'WARNING'::text, 'team_mismatch'::text,
    'Raw team "' || r.raw_team || '" differs from cache team "' || c.cache_team || '"',
    r.raw_team, c.cache_team,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.raw_team IS NOT NULL AND c.cache_team IS NOT NULL
    AND lower(trim(r.raw_team)) <> lower(trim(c.cache_team))

  UNION ALL

  -- D: Cache internal: season_avg vs projection_final gap > 40 pts (WARNING)
  SELECT
    c.player_id, COALESCE(r.raw_player_name, c.cache_name),
    COALESCE(c.cache_team, r.raw_team),
    'WARNING'::text, 'projection_season_gap'::text,
    'Cache season_avg ' || c.season_avg || ' vs projection_final ' || c.projection_final
      || ' (gap ' || ROUND(ABS(c.season_avg - c.projection_final), 1) || ' pts)',
    c.season_avg::text, c.projection_final::text,
    COALESCE(r.games_raw, 0), (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE c.season_avg IS NOT NULL AND c.projection_final IS NOT NULL
    AND ABS(c.season_avg - c.projection_final) > 40

  UNION ALL

  -- E: Ruckman with near-zero hitouts (REVIEW)
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'REVIEW'::text, 'ruck_no_hitouts'::text,
    'Ruckman avg hitouts ' || r.avg_hitouts || ' over ' || r.games_raw || ' game(s)',
    r.avg_hitouts::text, NULL::text,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE c.position_group ILIKE '%ruck%'
    AND r.avg_hitouts < 1
    AND r.games_raw >= 3

  UNION ALL

  -- F: Has 2026 raw stats but missing from cache (REVIEW)
  SELECT
    r.player_id, r.raw_player_name, r.raw_team,
    'REVIEW'::text, 'missing_from_cache'::text,
    'Player has ' || r.games_raw || ' 2026 game(s) in raw stats but no cache entry',
    r.games_raw::text, NULL::text,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE c.player_id IS NULL

  UNION ALL

  -- G: In cache but no 2026 raw stats (REVIEW)
  SELECT
    c.player_id, c.cache_name, c.cache_team,
    'REVIEW'::text, 'missing_from_raw'::text,
    'In cache with projection ' || COALESCE(c.projection_final::text, 'none') || ' but no 2026 raw stats',
    NULL::text, COALESCE(c.projection_final::text, '—'),
    0, (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE r.player_id IS NULL

  ORDER BY
    CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
    team_name, player_name;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_mismatch_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_mismatch_queue()
  TO authenticated, service_role;
