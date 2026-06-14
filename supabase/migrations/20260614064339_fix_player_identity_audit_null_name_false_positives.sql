
-- Fix: Player identity audit RPCs had false positives from historical raw_player_stats
-- rows where player_name IS NULL (2025 season data stored without names).
-- Fix: raw_latest CTEs now require player_name IS NOT NULL so team mismatches,
-- missing-from-cache warnings, and placeholder counts only fire on real data.
-- Fix: placeholder detection no longer includes OR player_name IS NULL.

-- ────────────────────────────────────────────────────────────
-- 1. TEAM-LEVEL AUDIT
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_identity_team_audit()
RETURNS TABLE (
  team_name             text,
  canonical_count       bigint,
  raw_count             bigint,
  cache_count           bigint,
  placeholder_count     bigint,
  unmatched_raw_count   bigint,
  duplicate_name_count  bigint,
  provider_conflict_count bigint,
  has_override_count    bigint,
  last_seen_week        integer,
  health_status         text
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

  all_teams AS (
    SELECT t.team_id, t.team_name FROM afl.teams t
  ),

  canonical_per_team AS (
    SELECT team_name, COUNT(DISTINCT player_id) AS canonical_count
    FROM afl.player_rankings_cache WHERE player_id IS NOT NULL
    GROUP BY team_name
  ),

  raw_per_team AS (
    SELECT team_name, COUNT(DISTINCT player_id) AS raw_count
    FROM afl.raw_player_stats
    WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    GROUP BY team_name
  ),

  -- Only count explicitly bad API placeholder names; NULL means old data without name stored
  placeholders_per_team AS (
    SELECT team_name, COUNT(DISTINCT player_id) AS placeholder_count
    FROM afl.raw_player_stats
    WHERE player_name ~ '^Player#?[0-9]'
       OR lower(player_name) IN ('unknown','unnamed','tbd','test player','api player')
    GROUP BY team_name
  ),

  -- Unmatched: named raw players not in rankings cache
  unmatched_per_team AS (
    SELECT r.team_name, COUNT(DISTINCT r.player_id) AS unmatched_count
    FROM afl.raw_player_stats r
    WHERE r.player_name IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM afl.player_rankings_cache c WHERE c.player_id = r.player_id)
    GROUP BY r.team_name
  ),

  dup_names_per_team AS (
    SELECT c.team_name, COUNT(*) AS dup_count
    FROM (
      SELECT team_name, player_name, COUNT(DISTINCT player_id) AS id_count
      FROM afl.player_rankings_cache
      GROUP BY team_name, player_name
      HAVING COUNT(DISTINCT player_id) > 1
    ) c
    GROUP BY c.team_name
  ),

  conflicts_per_team AS (
    SELECT r.team_name, COUNT(DISTINCT r.player_id) AS conflict_count
    FROM (
      SELECT player_id, team_name, COUNT(DISTINCT player_name) AS name_count
      FROM afl.raw_player_stats
      WHERE player_name IS NOT NULL
      GROUP BY player_id, team_name
      HAVING COUNT(DISTINCT player_name) > 1
    ) r
    GROUP BY r.team_name
  ),

  overrides_per_team AS (
    SELECT COALESCE(o.team_name, c.team_name) AS team_name,
           COUNT(DISTINCT o.player_id) AS override_count
    FROM afl.player_identity_overrides o
    LEFT JOIN afl.player_rankings_cache c ON c.player_id = o.player_id
    GROUP BY COALESCE(o.team_name, c.team_name)
  ),

  last_seen_per_team AS (
    SELECT team_name, MAX(week) AS last_seen_week
    FROM afl.raw_player_stats
    WHERE player_name IS NOT NULL
    GROUP BY team_name
  )

  SELECT
    t.team_name,
    COALESCE(cp.canonical_count, 0)   AS canonical_count,
    COALESCE(rp.raw_count, 0)         AS raw_count,
    COALESCE(cp.canonical_count, 0)   AS cache_count,
    COALESCE(pp.placeholder_count, 0) AS placeholder_count,
    COALESCE(up.unmatched_count, 0)   AS unmatched_raw_count,
    COALESCE(dn.dup_count, 0)         AS duplicate_name_count,
    COALESCE(cf.conflict_count, 0)    AS provider_conflict_count,
    COALESCE(op.override_count, 0)    AS has_override_count,
    COALESCE(ls.last_seen_week, 0)::integer AS last_seen_week,
    CASE
      WHEN COALESCE(cf.conflict_count, 0) > 0 OR COALESCE(pp.placeholder_count, 0) > 2 THEN 'CRITICAL'
      WHEN COALESCE(up.unmatched_count, 0) > 0 OR COALESCE(pp.placeholder_count, 0) > 0 THEN 'WARNING'
      WHEN COALESCE(dn.dup_count, 0) > 0 OR COALESCE(op.override_count, 0) > 0          THEN 'REVIEW'
      ELSE 'PASS'
    END AS health_status
  FROM all_teams t
  LEFT JOIN canonical_per_team  cp ON cp.team_name  = t.team_name
  LEFT JOIN raw_per_team        rp ON rp.team_name  = t.team_name
  LEFT JOIN placeholders_per_team pp ON pp.team_name = t.team_name
  LEFT JOIN unmatched_per_team  up ON up.team_name  = t.team_name
  LEFT JOIN dup_names_per_team  dn ON dn.team_name  = t.team_name
  LEFT JOIN conflicts_per_team  cf ON cf.team_name  = t.team_name
  LEFT JOIN overrides_per_team  op ON op.team_name  = t.team_name
  LEFT JOIN last_seen_per_team  ls ON ls.team_name  = t.team_name
  ORDER BY
    CASE
      WHEN COALESCE(cf.conflict_count, 0) > 0 OR COALESCE(pp.placeholder_count, 0) > 2 THEN 0
      WHEN COALESCE(up.unmatched_count, 0) > 0 OR COALESCE(pp.placeholder_count, 0) > 0 THEN 1
      WHEN COALESCE(dn.dup_count, 0) > 0 OR COALESCE(op.override_count, 0) > 0          THEN 2
      ELSE 3
    END,
    t.team_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_identity_team_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_identity_team_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_identity_team_audit() TO service_role;


-- ────────────────────────────────────────────────────────────
-- 2. PLAYER-LEVEL AUDIT
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_identity_player_audit(
  p_team_name text DEFAULT NULL
)
RETURNS TABLE (
  player_id              integer,
  canonical_name         text,
  raw_name               text,
  cache_name             text,
  canonical_team         text,
  raw_team               text,
  position_group         text,
  player_number          integer,
  has_override           boolean,
  override_notes         text,
  is_placeholder         boolean,
  is_unmatched_raw       boolean,
  is_duplicate_name      boolean,
  is_provider_conflict   boolean,
  is_team_mismatch       boolean,
  in_raw_stats           boolean,
  in_rankings_cache      boolean,
  in_afl_players         boolean,
  last_seen_week         integer,
  first_seen_week        integer,
  games_played           integer,
  severity               text,
  flag_reasons           text[]
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

  -- Only named rows for latest identity detection
  raw_latest AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      player_name   AS raw_name,
      team_name     AS raw_team,
      player_number,
      team_id
    FROM afl.raw_player_stats
    WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    ORDER BY player_id, week DESC, game_id DESC
  ),

  cache_entry AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      player_name   AS cache_name,
      team_name     AS cache_team,
      team_id       AS cache_team_id,
      position,
      games_played
    FROM afl.player_rankings_cache
    ORDER BY player_id, cached_at DESC
  ),

  canonical AS (
    SELECT player_id, player_name AS canonical_name, position_group
    FROM afl.players
  ),

  overrides AS (
    SELECT player_id, player_name, team_name, notes
    FROM afl.player_identity_overrides
  ),

  raw_summary AS (
    SELECT
      player_id,
      COUNT(DISTINCT player_name) AS distinct_raw_names,
      MAX(week)                   AS last_seen_week,
      MIN(week)                   AS first_seen_week
    FROM afl.raw_player_stats
    WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    GROUP BY player_id
  ),

  dup_names AS (
    SELECT player_id
    FROM (
      SELECT c.player_id, c.team_name, c.player_name,
             COUNT(*) OVER (PARTITION BY c.team_name, c.player_name) AS cnt
      FROM afl.player_rankings_cache c
    ) x
    WHERE cnt > 1
  ),

  all_ids AS (
    SELECT player_id FROM afl.raw_player_stats WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    UNION
    SELECT player_id FROM afl.player_rankings_cache WHERE player_id IS NOT NULL
    UNION
    SELECT player_id FROM afl.players WHERE player_id IS NOT NULL
    UNION
    SELECT player_id FROM afl.player_identity_overrides WHERE player_id IS NOT NULL
  )

  SELECT
    ai.player_id,
    COALESCE(ca.canonical_name, ce.cache_name, rl.raw_name) AS canonical_name,
    rl.raw_name,
    ce.cache_name,
    COALESCE(ce.cache_team, ov.team_name)                   AS canonical_team,
    rl.raw_team,
    COALESCE(ca.position_group, ce.position)                AS position_group,
    rl.player_number::integer,
    (ov.player_id IS NOT NULL)                              AS has_override,
    ov.notes                                                AS override_notes,
    -- Placeholder: only explicit bad API names, not NULL
    (
      COALESCE(rl.raw_name, '') ~ '^Player#?[0-9]'
      OR lower(COALESCE(rl.raw_name, '')) IN ('unknown','unnamed','tbd','test player','api player')
    ) AS is_placeholder,
    (rl.player_id IS NOT NULL AND ce.player_id IS NULL)    AS is_unmatched_raw,
    (dup.player_id IS NOT NULL)                            AS is_duplicate_name,
    (COALESCE(rs.distinct_raw_names, 0) > 1)               AS is_provider_conflict,
    (
      rl.raw_team IS NOT NULL
      AND ce.cache_team IS NOT NULL
      AND rl.raw_team <> ce.cache_team
    ) AS is_team_mismatch,
    (rl.player_id IS NOT NULL)  AS in_raw_stats,
    (ce.player_id IS NOT NULL)  AS in_rankings_cache,
    (ca.player_id IS NOT NULL)  AS in_afl_players,
    COALESCE(rs.last_seen_week, 0)::integer  AS last_seen_week,
    COALESCE(rs.first_seen_week, 0)::integer AS first_seen_week,
    COALESCE(ce.games_played, 0)::integer    AS games_played,

    CASE
      WHEN COALESCE(rs.distinct_raw_names, 0) > 1
           AND (rl.raw_name IS NOT NULL)
           AND rl.raw_name !~ '^Player#?[0-9]'  THEN 'CRITICAL'
      WHEN (COALESCE(rl.raw_name, '') ~ '^Player#?[0-9]'
             OR lower(COALESCE(rl.raw_name, '')) IN ('unknown','unnamed','tbd'))
           AND ce.player_id IS NOT NULL           THEN 'CRITICAL'
      WHEN rl.player_id IS NOT NULL AND ce.player_id IS NULL THEN 'WARNING'
      WHEN rl.raw_team IS NOT NULL AND ce.cache_team IS NOT NULL
           AND rl.raw_team <> ce.cache_team       THEN 'WARNING'
      WHEN dup.player_id IS NOT NULL              THEN 'WARNING'
      WHEN ov.player_id IS NOT NULL               THEN 'REVIEW'
      WHEN rs.first_seen_week IS NOT NULL
           AND COALESCE(ce.games_played, 0) <= 2  THEN 'REVIEW'
      ELSE 'LOW'
    END AS severity,

    ARRAY_REMOVE(ARRAY[
      CASE WHEN COALESCE(rl.raw_name, '') ~ '^Player#?[0-9]'
                OR lower(COALESCE(rl.raw_name, '')) IN ('unknown','unnamed','tbd')
           THEN 'Placeholder name in raw stats' END,
      CASE WHEN rl.player_id IS NOT NULL AND ce.player_id IS NULL
           THEN 'In raw stats but missing from rankings cache' END,
      CASE WHEN ce.player_id IS NOT NULL AND rl.player_id IS NULL
           THEN 'In cache but no recent raw stats' END,
      CASE WHEN rl.raw_team IS NOT NULL AND ce.cache_team IS NOT NULL
                AND rl.raw_team <> ce.cache_team
           THEN 'Team mismatch: raw=' || rl.raw_team || ' vs cache=' || ce.cache_team END,
      CASE WHEN dup.player_id IS NOT NULL
           THEN 'Duplicate canonical name within team' END,
      CASE WHEN COALESCE(rs.distinct_raw_names, 0) > 1
           THEN 'Multiple raw names for same provider ID (' || rs.distinct_raw_names || ')' END,
      CASE WHEN ov.player_id IS NOT NULL
           THEN 'Has manual override: ' || COALESCE(ov.notes, 'no notes') END,
      CASE WHEN ca.player_id IS NULL AND rl.player_id IS NOT NULL
           THEN 'Missing from afl.players canonical table' END
    ], NULL) AS flag_reasons

  FROM all_ids ai
  LEFT JOIN raw_latest  rl  ON rl.player_id  = ai.player_id
  LEFT JOIN cache_entry ce  ON ce.player_id  = ai.player_id
  LEFT JOIN canonical   ca  ON ca.player_id  = ai.player_id
  LEFT JOIN overrides   ov  ON ov.player_id  = ai.player_id
  LEFT JOIN raw_summary rs  ON rs.player_id  = ai.player_id
  LEFT JOIN dup_names   dup ON dup.player_id = ai.player_id

  WHERE
    p_team_name IS NULL
    OR COALESCE(ce.cache_team, rl.raw_team, ov.team_name) = p_team_name

  ORDER BY
    CASE
      WHEN COALESCE(rs.distinct_raw_names, 0) > 1 THEN 0
      WHEN COALESCE(rl.raw_name, '') ~ '^Player#?[0-9]' THEN 1
      WHEN rl.player_id IS NOT NULL AND ce.player_id IS NULL THEN 2
      WHEN rl.raw_team IS NOT NULL AND ce.cache_team IS NOT NULL AND rl.raw_team <> ce.cache_team THEN 3
      WHEN ov.player_id IS NOT NULL THEN 4
      ELSE 5
    END,
    COALESCE(ca.canonical_name, ce.cache_name, rl.raw_name);
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_identity_player_audit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_identity_player_audit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_identity_player_audit(text) TO service_role;


-- ────────────────────────────────────────────────────────────
-- 3. REVIEW QUEUE
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_identity_review_queue()
RETURNS TABLE (
  player_id     integer,
  player_name   text,
  team_name     text,
  severity      text,
  issue_type    text,
  reason        text,
  has_override  boolean,
  last_seen_week integer,
  games_played  integer
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

  -- Only named rows for identity detection
  raw_latest AS (
    SELECT DISTINCT ON (player_id)
      player_id, player_name, team_name, player_number, week
    FROM afl.raw_player_stats
    WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    ORDER BY player_id, week DESC, game_id DESC
  ),

  cache_entry AS (
    SELECT DISTINCT ON (player_id)
      player_id, player_name, team_name, games_played
    FROM afl.player_rankings_cache ORDER BY player_id, cached_at DESC
  ),

  overrides AS (
    SELECT player_id, player_name, team_name, notes
    FROM afl.player_identity_overrides
  ),

  raw_summary AS (
    SELECT player_id, COUNT(DISTINCT player_name) AS distinct_raw_names
    FROM afl.raw_player_stats
    WHERE player_id IS NOT NULL AND player_name IS NOT NULL
    GROUP BY player_id
  ),

  dup_names AS (
    SELECT player_id
    FROM (
      SELECT player_id, team_name, player_name,
             COUNT(*) OVER (PARTITION BY team_name, player_name) AS cnt
      FROM afl.player_rankings_cache
    ) x WHERE cnt > 1
  )

  -- A: Placeholder names (CRITICAL)
  SELECT
    rl.player_id,
    rl.player_name,
    rl.team_name,
    'CRITICAL'::text,
    'placeholder'::text,
    'Raw stats contains placeholder name: ' || rl.player_name,
    (ov.player_id IS NOT NULL),
    rl.week::integer,
    COALESCE(ce.games_played, 0)::integer
  FROM raw_latest rl
  LEFT JOIN cache_entry ce ON ce.player_id = rl.player_id
  LEFT JOIN overrides   ov ON ov.player_id = rl.player_id
  WHERE rl.player_name ~ '^Player#?[0-9]'
     OR lower(rl.player_name) IN ('unknown','unnamed','tbd','test player','api player')

  UNION ALL

  -- B: Provider ID conflict — multiple distinct names (CRITICAL)
  SELECT
    rl.player_id, rl.player_name, rl.team_name,
    'CRITICAL'::text, 'provider_conflict'::text,
    'Provider ID ' || rl.player_id || ' maps to ' || rs.distinct_raw_names || ' different names in raw stats',
    (ov.player_id IS NOT NULL), rl.week::integer,
    COALESCE(ce.games_played, 0)::integer
  FROM raw_latest rl
  JOIN raw_summary rs ON rs.player_id = rl.player_id AND rs.distinct_raw_names > 1
  LEFT JOIN cache_entry ce ON ce.player_id = rl.player_id
  LEFT JOIN overrides   ov ON ov.player_id = rl.player_id
  WHERE NOT (rl.player_name ~ '^Player#?[0-9]' OR lower(rl.player_name) IN ('unknown','unnamed','tbd'))

  UNION ALL

  -- C: Named raw player with no cache entry (WARNING)
  SELECT
    rl.player_id, rl.player_name, rl.team_name,
    'WARNING'::text, 'missing_from_cache'::text,
    'Player appears in raw stats (week ' || rl.week || ') but is missing from rankings cache',
    (ov.player_id IS NOT NULL), rl.week::integer, 0::integer
  FROM raw_latest rl
  LEFT JOIN cache_entry ce ON ce.player_id = rl.player_id
  LEFT JOIN overrides   ov ON ov.player_id = rl.player_id
  WHERE ce.player_id IS NULL
    AND NOT (rl.player_name ~ '^Player#?[0-9]' OR lower(rl.player_name) IN ('unknown','unnamed','tbd'))

  UNION ALL

  -- D: Team mismatch — only fires on named rows now (WARNING)
  SELECT
    rl.player_id, COALESCE(ce.player_name, rl.player_name), ce.team_name,
    'WARNING'::text, 'team_mismatch'::text,
    'Team mismatch: canonical=' || ce.team_name || ', raw=' || rl.team_name,
    (ov.player_id IS NOT NULL), rl.week::integer,
    COALESCE(ce.games_played, 0)::integer
  FROM raw_latest rl
  JOIN cache_entry ce ON ce.player_id = rl.player_id
  LEFT JOIN overrides ov ON ov.player_id = rl.player_id
  WHERE rl.team_name <> ce.team_name

  UNION ALL

  -- E: Duplicate canonical name within team (WARNING)
  SELECT
    ce.player_id, ce.player_name, ce.team_name,
    'WARNING'::text, 'duplicate_name'::text,
    'Same player name appears under multiple IDs in same team',
    (ov.player_id IS NOT NULL),
    COALESCE(rl.week, 0)::integer,
    COALESCE(ce.games_played, 0)::integer
  FROM dup_names d
  JOIN cache_entry ce ON ce.player_id = d.player_id
  LEFT JOIN raw_latest rl ON rl.player_id = d.player_id
  LEFT JOIN overrides  ov ON ov.player_id = d.player_id

  UNION ALL

  -- F: Manual overrides — verify still needed (REVIEW)
  SELECT
    ov.player_id,
    COALESCE(ce.player_name, rl.player_name, ov.player_name),
    COALESCE(ce.team_name, ov.team_name),
    'REVIEW'::text, 'has_override'::text,
    'Manual override exists — verify still required. Notes: ' || COALESCE(ov.notes, 'none'),
    TRUE,
    COALESCE(rl.week, 0)::integer,
    COALESCE(ce.games_played, 0)::integer
  FROM overrides ov
  LEFT JOIN cache_entry ce ON ce.player_id = ov.player_id
  LEFT JOIN raw_latest  rl ON rl.player_id = ov.player_id
  WHERE NOT EXISTS (
    SELECT 1 FROM raw_summary rs2
    WHERE rs2.player_id = ov.player_id AND rs2.distinct_raw_names > 1
  )
  AND NOT (
    COALESCE(rl.player_name, '') ~ '^Player#?[0-9]'
    OR lower(COALESCE(rl.player_name, '')) IN ('unknown','unnamed','tbd')
  )

  ORDER BY
    CASE severity
      WHEN 'CRITICAL' THEN 0
      WHEN 'WARNING'  THEN 1
      WHEN 'REVIEW'   THEN 2
      ELSE 3
    END,
    team_name, player_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_identity_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_identity_review_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_identity_review_queue() TO service_role;


-- ────────────────────────────────────────────────────────────
-- 4. GLOBAL AUDIT SUMMARY
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_identity_audit_summary()
RETURNS TABLE (
  teams_audited          bigint,
  canonical_players      bigint,
  raw_players            bigint,
  matched_players        bigint,
  unmatched_raw          bigint,
  placeholder_players    bigint,
  duplicate_name_risks   bigint,
  provider_id_conflicts  bigint,
  team_mismatch_risks    bigint,
  open_review_items      bigint
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
    (SELECT COUNT(DISTINCT team_name) FROM afl.teams)::bigint,
    (SELECT COUNT(DISTINCT player_id) FROM afl.player_rankings_cache WHERE player_id IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT player_id) FROM afl.raw_player_stats WHERE player_id IS NOT NULL AND player_name IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT r.player_id)
     FROM afl.raw_player_stats r
     WHERE r.player_name IS NOT NULL
       AND EXISTS (SELECT 1 FROM afl.player_rankings_cache c WHERE c.player_id = r.player_id))::bigint,
    (SELECT COUNT(DISTINCT r.player_id)
     FROM afl.raw_player_stats r
     WHERE r.player_name IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM afl.player_rankings_cache c WHERE c.player_id = r.player_id))::bigint,
    -- Only explicit API placeholder names, not NULLs
    (SELECT COUNT(DISTINCT r.player_id)
     FROM afl.raw_player_stats r
     WHERE r.player_name ~ '^Player#?[0-9]'
        OR lower(r.player_name) IN ('unknown','unnamed','tbd'))::bigint,
    (SELECT COUNT(DISTINCT player_id)
     FROM (
       SELECT player_id, team_name, player_name,
              COUNT(*) OVER (PARTITION BY team_name, player_name) AS cnt
       FROM afl.player_rankings_cache
     ) x WHERE cnt > 1)::bigint,
    (SELECT COUNT(DISTINCT player_id)
     FROM afl.raw_player_stats
     WHERE player_name IS NOT NULL
     GROUP BY player_id
     HAVING COUNT(DISTINCT player_name) > 1)::bigint,
    (SELECT COUNT(DISTINCT rl.player_id)
     FROM (
       SELECT DISTINCT ON (player_id) player_id, team_name
       FROM afl.raw_player_stats
       WHERE player_id IS NOT NULL AND player_name IS NOT NULL
       ORDER BY player_id, week DESC, game_id DESC
     ) rl
     JOIN (
       SELECT DISTINCT ON (player_id) player_id, team_name
       FROM afl.player_rankings_cache
       ORDER BY player_id, cached_at DESC
     ) ce ON ce.player_id = rl.player_id AND ce.team_name <> rl.team_name)::bigint,
    (SELECT COUNT(*) FROM public.player_identity_anomalies WHERE status = 'open')::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_identity_audit_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_identity_audit_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_identity_audit_summary() TO service_role;
