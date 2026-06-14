-- Part 5: Coverage Audit RPC
-- Returns all raw_player_stats players absent from player_rankings_cache,
-- classified into buckets with actionable metadata.

CREATE OR REPLACE FUNCTION public.admin_get_raw_without_cache_audit()
RETURNS TABLE (
  player_id          integer,
  player_name        text,
  team_name          text,
  games_played_2026  bigint,
  latest_seen_week   integer,
  exclusion_bucket   text,
  exclusion_reason   text,
  recommended_action text,
  affected_surfaces  text[],
  should_be_active   boolean,
  blocking_source    text,
  position_group     text,
  active             boolean,
  manual_status      text,
  has_override       boolean,
  has_form           boolean,
  has_projection     boolean
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
  WITH raw_agg AS (
    SELECT
      r.player_id,
      MAX(r.player_name) AS raw_name,
      MAX(r.team_name)   AS raw_team,
      COUNT(*)           AS games_count,
      MAX(r.week)        AS last_week
    FROM afl.raw_player_stats r
    WHERE r.season = 2026
      AND r.player_id IS NOT NULL
    GROUP BY r.player_id
  )
  SELECT
    ra.player_id,
    ra.raw_name                          AS player_name,
    ra.raw_team                          AS team_name,
    ra.games_count                       AS games_played_2026,
    ra.last_week::integer                AS latest_seen_week,

    -- ── Exclusion bucket ─────────────────────────────────────────────────────
    CASE
      WHEN ra.player_id IN (2080, 1909)
        THEN 'IDENTITY_BLOCKED'
      WHEN ra.raw_name LIKE 'Player#%'
        THEN 'IDENTITY_UNKNOWN'
      WHEN pl.player_id IS NULL
        THEN 'NOT_IN_PLAYERS_TABLE'
      WHEN COALESCE(pl.manual_status, '') IN ('delisted', 'retired')
        THEN 'INTENTIONAL_NON_RANKED'
      WHEN pl.active = false AND ra.games_count < 5
        THEN 'INACTIVE_FLAG_LOW_GAMES'
      WHEN pl.active = false AND ra.games_count >= 5
        THEN 'INACTIVE_FLAG_SHOULD_FIX'
      WHEN fpf.player_id IS NULL
        THEN 'NO_FORM_DATA_YET'
      WHEN pp.player_id IS NULL
        THEN 'PROJECTION_MISSING'
      ELSE 'UNKNOWN'
    END                                  AS exclusion_bucket,

    -- ── Human-readable reason ─────────────────────────────────────────────────
    CASE
      WHEN ra.player_id = 2080
        THEN 'Duplicate provider ID — primary record is #1567 (Jye Caldwell). Intentionally excluded to prevent a duplicate cache entry.'
      WHEN ra.player_id = 1909
        THEN 'Alternate provider ID — primary record is #1872 (Tom Hanily). Intentionally excluded to prevent a duplicate cache entry.'
      WHEN ra.raw_name LIKE 'Player#%'
        THEN 'Player name not yet resolved from provider. Placeholder ID with no canonical identity in afl.players.'
      WHEN pl.player_id IS NULL
        THEN 'player_id ' || ra.player_id || ' does not exist in afl.players — never seeded by the identity pipeline.'
      WHEN COALESCE(pl.manual_status, '') IN ('delisted', 'retired')
        THEN 'Player manually flagged as ' || pl.manual_status || '. Excluded by ranking policy.'
      WHEN pl.active = false AND ra.games_count < 5
        THEN 'active=false in afl.players with only ' || ra.games_count || ' 2026 game(s). Below the 5-game threshold for automatic reactivation.'
      WHEN pl.active = false AND ra.games_count >= 5
        THEN 'active=false in afl.players despite ' || ra.games_count || ' 2026 games. Missed by the reactivation sweep — needs manual fix.'
      WHEN fpf.player_id IS NULL
        THEN 'No row in feature_player_form. Player has too few games or the projection pipeline has not processed them yet. Auto-resolves on next run.'
      WHEN pp.player_id IS NULL
        THEN 'No row in player_projection. Bootstrap gap — form exists but no projection row was inserted. Re-run coverage fix migration.'
      ELSE 'Uncategorised. Manual investigation required.'
    END                                  AS exclusion_reason,

    -- ── Recommended action ────────────────────────────────────────────────────
    CASE
      WHEN ra.player_id IN (2080, 1909)
        THEN 'No action required. Duplicate prevention is intentional and correct.'
      WHEN ra.raw_name LIKE 'Player#%'
        THEN 'Resolve identity: look up player on AFL website using team and round data, then INSERT into player_identity_overrides.'
      WHEN pl.player_id IS NULL
        THEN 'INSERT a row into afl.players with correct name, position_group, and active=true, then re-run the cache function.'
      WHEN COALESCE(pl.manual_status, '') IN ('delisted', 'retired')
        THEN 'No action. If the player returned, clear manual_status and re-run the cache function.'
      WHEN pl.active = false AND ra.games_count < 5
        THEN 'Monitor. Set active=true if player reaches 5 confirmed 2026 games.'
      WHEN pl.active = false AND ra.games_count >= 5
        THEN 'Set active=true in afl.players and run SELECT afl.fn_populate_player_rankings_cache().'
      WHEN fpf.player_id IS NULL
        THEN 'Auto-resolves on next pipeline run once feature_player_form is populated for this player.'
      WHEN pp.player_id IS NULL
        THEN 'Re-run projection bootstrap: INSERT INTO afl.player_projection from afl.feature_player_form for this player_id.'
      ELSE 'Investigate manually: check pipeline logs, afl.players active flag, and player_identity_overrides.'
    END                                  AS recommended_action,

    -- ── Affected frontend surfaces ────────────────────────────────────────────
    ARRAY['rankings', 'player_detail', 'team_builder']::text[] AS affected_surfaces,

    -- ── Should this player be in the cache? ───────────────────────────────────
    CASE
      WHEN ra.player_id IN (2080, 1909)                                THEN false
      WHEN COALESCE(pl.manual_status, '') IN ('delisted', 'retired')   THEN false
      WHEN pl.active = false AND ra.games_count < 5                    THEN false
      WHEN ra.raw_name LIKE 'Player#%'                                 THEN false
      WHEN pl.player_id IS NULL                                        THEN false
      ELSE true
    END                                  AS should_be_active,

    -- ── Tightest single blocking source ──────────────────────────────────────
    CASE
      WHEN ra.player_id IN (2080, 1909)                                THEN 'identity_duplicate'
      WHEN ra.raw_name LIKE 'Player#%'                                 THEN 'placeholder_name'
      WHEN pl.player_id IS NULL                                        THEN 'missing_from_players_table'
      WHEN COALESCE(pl.manual_status, '') IN ('delisted', 'retired')   THEN 'manual_status_excluded'
      WHEN pl.active = false                                           THEN 'active_flag_false'
      WHEN fpf.player_id IS NULL                                       THEN 'no_form_data'
      WHEN pp.player_id IS NULL                                        THEN 'no_projection_row'
      ELSE 'unknown'
    END                                  AS blocking_source,

    pl.position_group,
    COALESCE(pl.active, false)           AS active,
    pl.manual_status,
    (ov.player_id IS NOT NULL)           AS has_override,
    (fpf.player_id IS NOT NULL)          AS has_form,
    (pp.player_id IS NOT NULL)           AS has_projection

  FROM raw_agg ra
  LEFT JOIN afl.players              pl  ON pl.player_id  = ra.player_id
  LEFT JOIN afl.player_rankings_cache c  ON c.player_id   = ra.player_id
  LEFT JOIN afl.player_projection    pp  ON pp.player_id  = ra.player_id
  LEFT JOIN afl.feature_player_form  fpf ON fpf.player_id = ra.player_id
  LEFT JOIN afl.player_identity_overrides ov ON ov.player_id = ra.player_id

  WHERE c.player_id IS NULL   -- only players absent from the cache

  ORDER BY ra.games_count DESC, ra.player_id;
END;
$$;
