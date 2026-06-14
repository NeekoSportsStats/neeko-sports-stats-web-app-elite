-- Hardening pass: adds issue_category, fingerprint detection, identity switch detection.
-- Drops and recreates all 4 audit RPCs. Read-only. No production data is modified.

DROP FUNCTION IF EXISTS public.admin_get_player_stats_identity_audit();
DROP FUNCTION IF EXISTS public.admin_get_player_stats_mismatch_queue();
DROP FUNCTION IF EXISTS public.admin_get_fingerprint_conflicts();
DROP FUNCTION IF EXISTS public.admin_get_identity_switch_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUMMARY AUDIT  (adds issue_category)
-- ─────────────────────────────────────────────────────────────────────────────
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
  issue_category              text,
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
  -- Fingerprint: same player_name under multiple player_ids in same game
  fp_conflict_players AS (
    SELECT DISTINCT unnest(array_agg(DISTINCT player_id)) AS player_id
    FROM afl.raw_player_stats
    WHERE season = 2026 AND player_name IS NOT NULL
    GROUP BY game_id, player_name
    HAVING COUNT(DISTINCT player_id) > 1
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
      (r.player_id IS NULL)                                     AS missing_from_raw,
      (fp_conflict_players.player_id IS NOT NULL)               AS has_fp_conflict
    FROM raw_agg r
    FULL OUTER JOIN cache_row c ON r.player_id = c.player_id
    LEFT JOIN ov ON COALESCE(r.player_id, c.player_id) = ov.player_id
    LEFT JOIN fp_conflict_players ON COALESCE(r.player_id, c.player_id) = fp_conflict_players.player_id
  ),
  flagged AS (
    SELECT j.*,
      (
        NOT j.missing_from_cache AND NOT j.missing_from_raw
        AND j.raw_team IS NOT NULL AND j.cache_team IS NOT NULL
        AND lower(trim(j.raw_team)) <> lower(trim(j.cache_team))
      ) AS team_mismatch_flag,
      (COALESCE(j.disposal_disc_rows, 0) > 0)           AS has_disposal_disc,
      (
        j.position_group ILIKE '%ruck%'
        AND j.avg_hitouts IS NOT NULL AND j.avg_hitouts < 1
        AND COALESCE(j.games_raw, 0) >= 3
      )                                                  AS ruck_no_hitouts,
      (
        j.projection_final IS NOT NULL
        AND (j.projection_final < 0 OR j.projection_final > 200)
      )                                                  AS proj_insane,
      (
        j.season_avg IS NOT NULL
        AND j.projection_final IS NOT NULL
        AND ABS(j.season_avg - j.projection_final) > 40
      )                                                  AS projection_season_gap
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
      CASE WHEN f.missing_from_raw      THEN 'missing_from_raw'      END,
      CASE WHEN f.has_fp_conflict       THEN 'identity_fingerprint'  END
    ], NULL),
    -- issue_category: pick the highest-priority category for this row
    CASE
      WHEN f.has_fp_conflict OR f.team_mismatch_flag  THEN 'Identity Mismatch'
      WHEN f.missing_from_cache OR f.missing_from_raw  THEN 'Pipeline Coverage'
      WHEN f.proj_insane OR f.projection_season_gap    THEN 'Projection/Data Quality'
      WHEN f.has_disposal_disc OR f.ruck_no_hitouts    THEN 'Projection/Data Quality'
      ELSE 'Manual Review'
    END,
    CASE
      WHEN f.has_fp_conflict OR f.proj_insane OR f.has_disposal_disc  THEN 'CRITICAL'
      WHEN f.team_mismatch_flag OR f.projection_season_gap            THEN 'WARNING'
      WHEN f.missing_from_cache OR f.ruck_no_hitouts OR f.missing_from_raw THEN 'REVIEW'
      ELSE 'PASS'
    END
  FROM flagged f
  WHERE
    f.has_disposal_disc OR f.proj_insane OR f.projection_season_gap
    OR f.team_mismatch_flag OR f.ruck_no_hitouts
    OR f.missing_from_cache OR f.missing_from_raw OR f.has_override
    OR f.has_fp_conflict
  ORDER BY
    CASE
      WHEN f.has_fp_conflict OR f.proj_insane OR f.has_disposal_disc    THEN 1
      WHEN f.team_mismatch_flag OR f.projection_season_gap              THEN 2
      ELSE 3
    END,
    COALESCE(f.cache_team, f.raw_team),
    f.pname;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_identity_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_identity_audit()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MISMATCH QUEUE  (adds issue_category, fingerprint section)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_player_stats_mismatch_queue()
RETURNS TABLE (
  player_id       integer,
  player_name     text,
  team_name       text,
  severity        text,
  issue_type      text,
  issue_category  text,
  detail          text,
  raw_value       text,
  cache_value     text,
  games_raw       bigint,
  has_override    boolean
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
           game_id, week, season,
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
  ),
  -- Fingerprint: same player_name under multiple player_ids in same game
  fp_conflict AS (
    SELECT
      game_id,
      player_name                               AS conflict_name,
      COUNT(DISTINCT player_id)                 AS id_count,
      MIN(player_id)                            AS player_id_a,
      MAX(player_id)                            AS player_id_b,
      MIN(team_name)                            AS team_a,
      MAX(week)                                 AS week_num,
      array_agg(DISTINCT player_id ORDER BY player_id) AS all_ids
    FROM afl.raw_player_stats
    WHERE season = 2026 AND player_name IS NOT NULL
    GROUP BY game_id, player_name
    HAVING COUNT(DISTINCT player_id) > 1
  )

  -- A: Disposal arithmetic (CRITICAL / Projection/Data Quality)
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'disposal_arithmetic'::text, 'Projection/Data Quality'::text,
    'Disposal count does not equal kicks + handballs in ' || r.disposal_disc_rows || ' game(s)',
    r.raw_disp_avg::text, NULL::text,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.disposal_disc_rows > 0

  UNION ALL

  -- B: Projection out of sane range (CRITICAL / Projection/Data Quality)
  SELECT
    c.player_id, COALESCE(r.raw_player_name, c.cache_name),
    COALESCE(c.cache_team, r.raw_team),
    'CRITICAL'::text, 'projection_insane'::text, 'Projection/Data Quality'::text,
    'Projection ' || c.projection_final || ' is outside sane range [0, 200]',
    NULL::text, c.projection_final::text,
    COALESCE(r.games_raw, 0), (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE c.projection_final IS NOT NULL
    AND (c.projection_final < 0 OR c.projection_final > 200)

  UNION ALL

  -- C: Identity fingerprint — same name, different IDs in same game (CRITICAL / Identity Mismatch)
  SELECT
    fp.player_id_a,
    fp.conflict_name,
    fp.team_a,
    'CRITICAL'::text, 'identity_fingerprint'::text, 'Identity Mismatch'::text,
    'Name "' || fp.conflict_name || '" appears under ' || fp.id_count
      || ' different player IDs (e.g. #' || fp.player_id_a || ' and #' || fp.player_id_b
      || ') in game ' || fp.game_id || ' (week ' || fp.week_num || ')',
    fp.player_id_a::text,
    fp.player_id_b::text,
    0::bigint,
    (ov.player_id IS NOT NULL)
  FROM fp_conflict fp
  LEFT JOIN ov ON fp.player_id_a = ov.player_id

  UNION ALL

  -- D: Team mismatch raw vs cache (WARNING / Identity Mismatch)
  SELECT
    r.player_id, r.raw_player_name, c.cache_team,
    'WARNING'::text, 'team_mismatch'::text, 'Identity Mismatch'::text,
    'Raw team "' || r.raw_team || '" differs from cache team "' || c.cache_team || '"',
    r.raw_team, c.cache_team,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE r.raw_team IS NOT NULL AND c.cache_team IS NOT NULL
    AND lower(trim(r.raw_team)) <> lower(trim(c.cache_team))

  UNION ALL

  -- E: Projection vs season_avg gap > 40 pts (WARNING / Projection/Data Quality)
  SELECT
    c.player_id, COALESCE(r.raw_player_name, c.cache_name),
    COALESCE(c.cache_team, r.raw_team),
    'WARNING'::text, 'projection_season_gap'::text, 'Projection/Data Quality'::text,
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

  -- F: Ruckman near-zero hitouts (REVIEW / Projection/Data Quality)
  SELECT
    r.player_id, r.raw_player_name, COALESCE(c.cache_team, r.raw_team),
    'REVIEW'::text, 'ruck_no_hitouts'::text, 'Projection/Data Quality'::text,
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

  -- G: In raw but missing from cache (REVIEW / Pipeline Coverage)
  SELECT
    r.player_id, r.raw_player_name, r.raw_team,
    'REVIEW'::text, 'missing_from_cache'::text, 'Pipeline Coverage'::text,
    'Player has ' || r.games_raw || ' 2026 game(s) in raw stats but no cache entry',
    r.games_raw::text, NULL::text,
    r.games_raw, (ov.player_id IS NOT NULL)
  FROM raw_agg r
  LEFT JOIN cache_row c ON r.player_id = c.player_id
  LEFT JOIN ov ON r.player_id = ov.player_id
  WHERE c.player_id IS NULL

  UNION ALL

  -- H: In cache but no 2026 raw stats (REVIEW / Pipeline Coverage)
  SELECT
    c.player_id, c.cache_name, c.cache_team,
    'REVIEW'::text, 'missing_from_raw'::text, 'Pipeline Coverage'::text,
    'In cache with projection ' || COALESCE(c.projection_final::text, 'none') || ' but no 2026 raw stats',
    NULL::text, COALESCE(c.projection_final::text, '—'),
    0, (ov.player_id IS NOT NULL)
  FROM cache_row c
  LEFT JOIN raw_agg r ON c.player_id = r.player_id
  LEFT JOIN ov ON c.player_id = ov.player_id
  WHERE r.player_id IS NULL

  ORDER BY
    CASE issue_category
      WHEN 'Identity Mismatch'        THEN 1
      WHEN 'Pipeline Coverage'        THEN 2
      WHEN 'Projection/Data Quality'  THEN 3
      ELSE 4
    END,
    CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
    team_name, player_name;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_player_stats_mismatch_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_player_stats_mismatch_queue()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FINGERPRINT CONFLICTS  (dedicated view for duplicate identity detection)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_fingerprint_conflicts()
RETURNS TABLE (
  conflict_name   text,
  game_id         integer,
  week_num        integer,
  id_count        bigint,
  player_id_a     integer,
  player_id_b     integer,
  team_a          text,
  all_ids         integer[]
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
  SELECT
    r.player_name                                               AS conflict_name,
    r.game_id,
    r.week                                                      AS week_num,
    COUNT(DISTINCT r.player_id)                                 AS id_count,
    MIN(r.player_id)                                            AS player_id_a,
    MAX(r.player_id)                                            AS player_id_b,
    MIN(r.team_name)                                            AS team_a,
    array_agg(DISTINCT r.player_id ORDER BY r.player_id)       AS all_ids
  FROM afl.raw_player_stats r
  WHERE r.season = 2026 AND r.player_name IS NOT NULL
  GROUP BY r.game_id, r.player_name, r.week
  HAVING COUNT(DISTINCT r.player_id) > 1
  ORDER BY id_count DESC, r.week, conflict_name;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_fingerprint_conflicts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_fingerprint_conflicts()
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. IDENTITY SWITCH AUDIT  (same player_id used under multiple names)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_get_identity_switch_audit()
RETURNS TABLE (
  player_id   integer,
  name_count  bigint,
  all_names   text[],
  game_count  bigint,
  teams       text[]
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
  SELECT
    r.player_id,
    COUNT(DISTINCT r.player_name)                               AS name_count,
    array_agg(DISTINCT r.player_name ORDER BY r.player_name)   AS all_names,
    COUNT(DISTINCT r.game_id)                                   AS game_count,
    array_agg(DISTINCT r.team_name ORDER BY r.team_name)       AS teams
  FROM afl.raw_player_stats r
  WHERE r.season = 2026 AND r.player_name IS NOT NULL
  GROUP BY r.player_id
  HAVING COUNT(DISTINCT r.player_name) > 1
  ORDER BY name_count DESC, r.player_id;

END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_identity_switch_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_identity_switch_audit()
  TO authenticated, service_role;
