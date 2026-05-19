/*
  # Fix Post-Game Review projection comparison

  ## Summary
  The `get_content_intel_completed_game` RPC was comparing actual stat values (e.g.
  disposals = 39) against `projection_final` from `player_rankings_cache` which is a
  **fantasy score projection** (~91).  This produced misleading copy like "came in under
  projection (proj: 91)" for a disposals lens.

  ## Root cause
  No stat-specific projection columns exist anywhere in the database.  The only available
  projection value is `projection_final` which is always a fantasy-score estimate.

  ## Changes
  1. Add `projection_source text` output column so callers can see what projection was used.
  2. For `p_lens = 'fantasy'`:
     - Join `afl.player_projection_history` to get the latest pre-game snapshot
       (`snapshot_date < game_date`) for that player × game combination.
     - Use `projection_final` from that snapshot as `projected_value`.
     - Set `projection_source = 'fantasy_snapshot'` (or `'cache'` if no history row exists).
  3. For all other lenses:
     - Set `projected_value = NULL`, `projection_delta = NULL`, `projection_source = 'none'`.
     - `result_label` becomes only `'hit'` or `'missed'` — no beat/under labels.
     - `copy_bullet` omits "(proj: X)" suffix.
     - `proof_caption_line` uses clean factual format with no "under/beat projection" language.
  4. Admin guard, stat whitelist, and rollover-safe round resolution are unchanged.
  5. Explicit REVOKE on anon is re-applied to survive any Supabase grant reset.
*/

-- Drop existing overloads so we can replace cleanly
DROP FUNCTION IF EXISTS public.get_content_intel_completed_game(integer, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_content_intel_completed_game(integer, text, numeric, integer, integer);

CREATE OR REPLACE FUNCTION public.get_content_intel_completed_game(
  p_season      integer  DEFAULT 2026,
  p_lens        text     DEFAULT 'disposals',
  p_threshold   numeric  DEFAULT 20,
  p_limit       integer  DEFAULT 500,
  p_round       integer  DEFAULT NULL,
  p_match_id    integer  DEFAULT NULL
)
RETURNS TABLE(
  season             integer,
  round              integer,
  game_id            integer,
  game_label         text,
  game_date          timestamptz,
  home_team          text,
  away_team          text,
  player_id          integer,
  player_name        text,
  team               text,
  opponent           text,
  player_position    text,
  stat_family        text,
  actual_value       integer,
  projected_value    numeric,
  projection_delta   numeric,
  projection_source  text,
  threshold          numeric,
  hit_threshold      boolean,
  result_label       text,
  recent_average     numeric,
  l3_average         numeric,
  l5_average         numeric,
  season_average     numeric,
  copy_bullet        text,
  proof_caption_line text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stat_col    text;
  v_round       integer;
BEGIN
  -- ── Admin guard ──────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- ── Stat column whitelist ─────────────────────────────────────────────────────
  v_stat_col := CASE p_lens
    WHEN 'disposals'      THEN 'disposals'
    WHEN 'goals'          THEN 'goals'
    WHEN 'tackles'        THEN 'tackles'
    WHEN 'marks'          THEN 'marks'
    WHEN 'hitouts'        THEN 'hit_outs'
    WHEN 'clearances'     THEN 'clearances'
    WHEN 'fantasy'        THEN 'fantasy_score'
    ELSE NULL
  END;

  IF v_stat_col IS NULL THEN
    RAISE EXCEPTION 'Invalid lens: %', p_lens;
  END IF;

  -- ── Rollover-safe round resolution ───────────────────────────────────────────
  IF p_round IS NULL THEN
    SELECT MAX(gr.week)
    INTO   v_round
    FROM   afl.games_raw gr
    WHERE  gr.season = p_season
      AND  gr.status_short = 'FT';
  ELSE
    v_round := p_round;
  END IF;

  IF v_round IS NULL THEN
    RETURN;
  END IF;

  -- ── Dynamic query ─────────────────────────────────────────────────────────────
  RETURN QUERY EXECUTE format(
    $sql$
    WITH base AS (
      SELECT
        pg.player_id,
        pg.game_id,
        pg.week                                          AS round,
        pg.season,
        pg.team                                          AS player_team,
        pg.opponent,
        pg.%I                                            AS raw_stat,
        gr.home_team,
        gr.away_team,
        gr.start_time                                    AS game_date,
        gr.match_id
      FROM afl.player_games pg
      JOIN afl.games_raw    gr ON gr.game_id = pg.game_id
      WHERE pg.season = %L::integer
        AND pg.week   = %L::integer
        AND (%L::integer IS NULL OR gr.match_id = %L::integer)
        AND gr.status_short = 'FT'
        AND pg.%I IS NOT NULL
    ),
    with_cache AS (
      SELECT
        b.*,
        COALESCE(ap.player_name, 'Player #' || b.player_id::text)  AS pname,
        COALESCE(pr.position, pr.position_group, '—')              AS ppos,
        pr.season_avg,
        pr.l3_avg,
        pr.l5_avg,
        pr.recent_form_avg,
        -- Pre-game projection snapshot (fantasy lens only)
        ph.projection_final                                        AS snap_projection,
        ph.snapshot_date                                           AS snap_date
      FROM base b
      LEFT JOIN afl.players             ap ON ap.id = b.player_id
      LEFT JOIN public.player_rankings_cache pr
             ON pr.player_id = b.player_id
      -- Latest pre-game snapshot for this exact game
      LEFT JOIN LATERAL (
        SELECT pph.projection_final, pph.snapshot_date
        FROM   afl.player_projection_history pph
        WHERE  pph.player_id = b.player_id
          AND  pph.game_id   = b.game_id
          AND  pph.snapshot_date < b.game_date
        ORDER  BY pph.snapshot_date DESC
        LIMIT  1
      ) ph ON true
    ),
    computed AS (
      SELECT
        c.*,
        c.raw_stat                                       AS actual_v,
        -- projected_value: only valid for fantasy lens
        CASE
          WHEN %L = 'fantasy' THEN
            COALESCE(c.snap_projection, NULL)
          ELSE NULL
        END                                              AS proj_v,
        -- projection_source
        CASE
          WHEN %L = 'fantasy' AND c.snap_projection IS NOT NULL THEN 'fantasy_snapshot'
          WHEN %L = 'fantasy' AND c.snap_projection IS NULL     THEN 'none'
          ELSE 'none'
        END                                              AS proj_src,
        -- threshold hit
        c.raw_stat >= %L::numeric                        AS hit_thresh,
        -- averages (rounded)
        ROUND(c.recent_form_avg::numeric, 1)             AS rec_avg,
        ROUND(c.l3_avg::numeric, 1)                      AS l3a,
        ROUND(c.l5_avg::numeric, 1)                      AS l5a,
        ROUND(c.season_avg::numeric, 1)                  AS sea_avg
      FROM with_cache c
    )
    SELECT
      c.season::integer,
      c.round::integer,
      c.game_id::integer,
      (c.home_team || ' v ' || c.away_team)::text         AS game_label,
      c.game_date,
      c.home_team::text,
      c.away_team::text,
      c.player_id::integer,
      c.pname::text,
      c.player_team::text,
      c.opponent::text,
      c.ppos::text,
      %L::text                                             AS stat_family,
      c.actual_v::integer,
      c.proj_v::numeric,
      -- projection_delta: only when proj_v is available
      CASE
        WHEN c.proj_v IS NOT NULL THEN
          ROUND((c.actual_v - c.proj_v)::numeric, 1)
        ELSE NULL
      END                                                  AS projection_delta,
      c.proj_src::text,
      %L::numeric                                          AS threshold,
      c.hit_thresh::boolean,
      -- result_label: beat/under only valid for fantasy lens with projection available
      CASE
        WHEN %L = 'fantasy' AND c.proj_v IS NOT NULL THEN
          CASE WHEN c.actual_v >= c.proj_v THEN 'beat_proj' ELSE 'under_proj' END
        ELSE
          CASE WHEN c.hit_thresh THEN 'hit' ELSE 'missed' END
      END                                                  AS result_label,
      c.rec_avg,
      c.l3a,
      c.l5a,
      c.sea_avg,
      -- copy_bullet: no "proj:" for non-fantasy lenses
      CASE
        WHEN %L = 'fantasy' AND c.proj_v IS NOT NULL THEN
          c.pname || ' — ' || c.actual_v::text || ' pts'
          || ' (proj: ' || ROUND(c.proj_v)::text || ', avg: ' || c.sea_avg::text || ')'
        WHEN %L = 'fantasy' THEN
          c.pname || ' — ' || c.actual_v::text || ' pts'
          || ' (avg: ' || c.sea_avg::text || ')'
        ELSE
          c.pname || ' — ' || c.actual_v::text || ' ' || %L
          || ' (avg: ' || c.sea_avg::text || ', L5: ' || c.l5a::text || ')'
      END                                                  AS copy_bullet,
      -- proof_caption_line: clean, no "beat/under projection" for non-fantasy
      CASE
        WHEN %L = 'fantasy' AND c.proj_v IS NOT NULL AND c.actual_v >= c.proj_v THEN
          c.pname || ' scored ' || c.actual_v::text || ' fantasy pts for '
          || c.player_team || ', beat projection of ' || ROUND(c.proj_v)::text || ' pts.'
        WHEN %L = 'fantasy' AND c.proj_v IS NOT NULL THEN
          c.pname || ' scored ' || c.actual_v::text || ' fantasy pts for '
          || c.player_team || ', fell short of ' || ROUND(c.proj_v)::text || ' projected.'
        WHEN %L = 'fantasy' THEN
          c.pname || ' delivered ' || c.actual_v::text || ' fantasy pts for ' || c.player_team || '.'
        ELSE
          c.pname || ' delivered ' || c.actual_v::text || ' ' || %L
          || ' for ' || c.player_team || ' vs ' || c.opponent || '.'
      END                                                  AS proof_caption_line
    FROM computed c
    WHERE c.actual_v IS NOT NULL
    ORDER BY c.actual_v DESC
    LIMIT %L::integer
    $sql$,
    -- positional args:
    v_stat_col,        -- SELECT pg.%I (stat col)
    p_season,          -- pg.season = %L
    v_round,           -- pg.week = %L
    p_match_id,        -- %L IS NULL check
    p_match_id,        -- gr.match_id = %L
    v_stat_col,        -- pg.%I IS NOT NULL
    p_lens,            -- CASE WHEN %L = 'fantasy' (proj_v)
    p_lens,            -- CASE WHEN %L = 'fantasy' (proj_src 1)
    p_lens,            -- CASE WHEN %L = 'fantasy' (proj_src 2)
    p_threshold,       -- raw_stat >= %L
    p_lens,            -- stat_family %L
    p_threshold,       -- threshold %L
    p_lens,            -- result_label CASE
    p_lens,            -- copy_bullet CASE 1
    p_lens,            -- copy_bullet CASE 2
    p_lens,            -- copy_bullet stat name
    p_lens,            -- proof 1
    p_lens,            -- proof 2
    p_lens,            -- proof 3
    p_lens,            -- proof 4 (plain fantasy)
    p_lens,            -- proof 5 (non-fantasy)
    p_limit            -- LIMIT %L
  );
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_content_intel_completed_game(integer, text, numeric, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_content_intel_completed_game(integer, text, numeric, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_intel_completed_game(integer, text, numeric, integer, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_content_intel_completed_game(integer, text, numeric, integer, integer, integer) FROM anon;
