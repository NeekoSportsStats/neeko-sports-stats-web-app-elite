
/*
  # Create afl.refresh_player_role_signals() and initial backfill

  ## Summary
  Computes per-game stat rates (kicks, tackles, marks) comparing last 5 games
  to full season average to detect role changes.

  ## Formula
  - kick_rate    = kicks / GREATEST(disposals, 1)  (proportion of disposals that are kicks)
  - tackle_rate  = tackles per game (raw average)
  - mark_rate    = marks / GREATEST(disposals, 1)  (proportion of disposals that are marks)

  Using rates rather than raw counts normalises for games with different
  disposal volumes, making shifts more meaningful.

  - usage_change_index = |kick_delta| + |tackle_delta| + |mark_delta|
  - role_change_score  = CLAMP(usage_change_index * 10, 0, 100)
  - role_change_flag   = role_change_score > 25

  ## Notes
  - Backfill runs immediately after function creation
  - Safe to call repeatedly (upsert)
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_role_signals()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count        integer;
  v_flagged      integer;
BEGIN
  INSERT INTO afl.player_role_signals (
    player_id,
    games_sample,
    kick_rate_last5,
    kick_rate_season,
    tackle_rate_last5,
    tackle_rate_season,
    mark_rate_last5,
    mark_rate_season,
    usage_change_index,
    role_change_score,
    role_change_flag,
    updated_at
  )
  WITH ranked AS (
    SELECT
      pg.player_id,
      pg.kicks,
      pg.tackles,
      pg.marks,
      pg.disposals,
      ROW_NUMBER() OVER (
        PARTITION BY pg.player_id
        ORDER BY g.game_date DESC, pg.game_id DESC
      ) AS rn,
      COUNT(*) OVER (PARTITION BY pg.player_id) AS total_games
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.disposals > 0
  ),
  agg AS (
    SELECT
      player_id,
      MAX(total_games)::integer AS games_sample,

      -- kick rate: kicks as proportion of disposals
      ROUND(AVG(
        CASE WHEN rn <= 5
          THEN kicks::numeric / GREATEST(disposals, 1)
        END
      ), 4) AS kick_rate_last5,
      ROUND(AVG(
        kicks::numeric / GREATEST(disposals, 1)
      ), 4) AS kick_rate_season,

      -- tackle rate: raw tackles per game
      ROUND(AVG(
        CASE WHEN rn <= 5 THEN tackles::numeric END
      ), 2) AS tackle_rate_last5,
      ROUND(AVG(tackles::numeric), 2) AS tackle_rate_season,

      -- mark rate: marks as proportion of disposals
      ROUND(AVG(
        CASE WHEN rn <= 5
          THEN marks::numeric / GREATEST(disposals, 1)
        END
      ), 4) AS mark_rate_last5,
      ROUND(AVG(
        marks::numeric / GREATEST(disposals, 1)
      ), 4) AS mark_rate_season

    FROM ranked
    GROUP BY player_id
  ),
  scored AS (
    SELECT
      player_id,
      games_sample,
      kick_rate_last5,
      kick_rate_season,
      tackle_rate_last5,
      tackle_rate_season,
      mark_rate_last5,
      mark_rate_season,
      ROUND(
        ABS(COALESCE(kick_rate_last5,   kick_rate_season,   0) - COALESCE(kick_rate_season,   0))
        + ABS(COALESCE(tackle_rate_last5, tackle_rate_season, 0) - COALESCE(tackle_rate_season, 0))
        + ABS(COALESCE(mark_rate_last5,   mark_rate_season,   0) - COALESCE(mark_rate_season,   0))
      , 4) AS usage_change_index
    FROM agg
  )
  SELECT
    player_id,
    games_sample,
    kick_rate_last5,
    kick_rate_season,
    tackle_rate_last5,
    tackle_rate_season,
    mark_rate_last5,
    mark_rate_season,
    usage_change_index,
    GREATEST(0, LEAST(100, ROUND(usage_change_index * 10, 2))) AS role_change_score,
    GREATEST(0, LEAST(100, ROUND(usage_change_index * 10, 2))) > 25 AS role_change_flag,
    now()
  FROM scored
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    kick_rate_last5     = EXCLUDED.kick_rate_last5,
    kick_rate_season    = EXCLUDED.kick_rate_season,
    tackle_rate_last5   = EXCLUDED.tackle_rate_last5,
    tackle_rate_season  = EXCLUDED.tackle_rate_season,
    mark_rate_last5     = EXCLUDED.mark_rate_last5,
    mark_rate_season    = EXCLUDED.mark_rate_season,
    usage_change_index  = EXCLUDED.usage_change_index,
    role_change_score   = EXCLUDED.role_change_score,
    role_change_flag    = EXCLUDED.role_change_flag,
    updated_at          = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT COUNT(*) INTO v_flagged
  FROM afl.player_role_signals
  WHERE role_change_flag = true;

  RETURN 'Role signals computed for ' || v_count || ' players. Flagged role changes: ' || v_flagged;
END;
$$;

-- Initial backfill
SELECT afl.refresh_player_role_signals();
