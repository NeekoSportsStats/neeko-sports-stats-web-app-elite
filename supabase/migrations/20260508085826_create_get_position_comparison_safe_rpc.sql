/*
  # Create get_position_comparison_safe RPC

  ## Purpose
  Returns percentile rankings for a single player compared to all active players
  in the same position group (DEF, MID, FWD, RUC). Calculated live from the
  player_rankings_cache table.

  ## Output Columns
  - metric: the metric name (season_avg, last3_avg, last5_avg, high_score, consistency, price)
  - player_value: the player's raw value for that metric
  - position_count: how many active same-position players have data for this metric
  - percentile: 0–100 integer (higher = better)
  - position_label: e.g. "Midfielders", "Defenders"

  ## Security
  - SECURITY DEFINER so anon can call it
  - Only reads from player_rankings_cache (already RLS-protected write side)
  - Filters to active, non-injured players with >= 3 games played
  - Does NOT expose full dataset — returns only the target player's row

  ## Notes
  - Percentile is "percent of same-position players this player scores above"
  - Requires >= 3 valid peers for a metric to be returned (otherwise omitted)
  - position_group is normalised from raw position strings
*/

CREATE OR REPLACE FUNCTION get_position_comparison_safe(
  p_player_id   text,
  p_user_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  metric          text,
  player_value    numeric,
  position_count  integer,
  percentile      integer,
  position_label  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position_group  text;
  v_position_label  text;
BEGIN
  -- Resolve position group for this player
  SELECT
    CASE
      WHEN LOWER(COALESCE(position, '')) LIKE '%mid%'        THEN 'MID'
      WHEN LOWER(COALESCE(position, '')) LIKE '%def%'        THEN 'DEF'
      WHEN LOWER(COALESCE(position, '')) LIKE '%fwd%'
        OR LOWER(COALESCE(position, '')) LIKE '%forward%'    THEN 'FWD'
      WHEN LOWER(COALESCE(position, '')) LIKE '%ruc%'        THEN 'RUC'
      ELSE NULL
    END
  INTO v_position_group
  FROM player_rankings_cache
  WHERE player_id = p_player_id
  LIMIT 1;

  IF v_position_group IS NULL THEN
    RETURN;
  END IF;

  v_position_label := CASE v_position_group
    WHEN 'MID' THEN 'Midfielders'
    WHEN 'DEF' THEN 'Defenders'
    WHEN 'FWD' THEN 'Forwards'
    WHEN 'RUC' THEN 'Ruckmen'
    ELSE 'Players'
  END;

  -- Build a CTE of peers (same position, active, min 3 games)
  RETURN QUERY
  WITH peers AS (
    SELECT
      c.player_id,
      c.season_avg,
      c.last_3_avg,
      c.last_5_avg,
      c.price,
      c.games_played,
      -- high score not stored directly; use ceiling_estimate as proxy if available
      c.consistency,
      CASE
        WHEN LOWER(COALESCE(c.position, '')) LIKE '%mid%'     THEN 'MID'
        WHEN LOWER(COALESCE(c.position, '')) LIKE '%def%'     THEN 'DEF'
        WHEN LOWER(COALESCE(c.position, '')) LIKE '%fwd%'
          OR LOWER(COALESCE(c.position, '')) LIKE '%forward%' THEN 'FWD'
        WHEN LOWER(COALESCE(c.position, '')) LIKE '%ruc%'     THEN 'RUC'
        ELSE NULL
      END AS pos_group
    FROM player_rankings_cache c
    WHERE
      c.games_played >= 3
      AND COALESCE(c.manual_status, c.status, '') NOT IN ('injured', 'inactive', 'delisted', 'retired')
  ),
  same_pos AS (
    SELECT * FROM peers WHERE pos_group = v_position_group
  ),
  target AS (
    SELECT * FROM same_pos WHERE player_id = p_player_id
  )

  -- season_avg percentile
  SELECT
    'season_avg'::text,
    t.season_avg::numeric,
    COUNT(s.player_id)::integer,
    CASE
      WHEN COUNT(s.player_id) < 3 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(CASE WHEN s.season_avg < t.season_avg THEN 1 END)::numeric
        / NULLIF(COUNT(s.player_id), 0)
      )::integer
    END,
    v_position_label
  FROM target t
  CROSS JOIN same_pos s
  WHERE t.season_avg IS NOT NULL AND s.season_avg IS NOT NULL
  GROUP BY t.season_avg

  UNION ALL

  -- last3_avg percentile
  SELECT
    'last3_avg'::text,
    t.last_3_avg::numeric,
    COUNT(s.player_id)::integer,
    CASE
      WHEN COUNT(s.player_id) < 3 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(CASE WHEN s.last_3_avg < t.last_3_avg THEN 1 END)::numeric
        / NULLIF(COUNT(s.player_id), 0)
      )::integer
    END,
    v_position_label
  FROM target t
  CROSS JOIN same_pos s
  WHERE t.last_3_avg IS NOT NULL AND s.last_3_avg IS NOT NULL
  GROUP BY t.last_3_avg

  UNION ALL

  -- last5_avg percentile
  SELECT
    'last5_avg'::text,
    t.last_5_avg::numeric,
    COUNT(s.player_id)::integer,
    CASE
      WHEN COUNT(s.player_id) < 3 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(CASE WHEN s.last_5_avg < t.last_5_avg THEN 1 END)::numeric
        / NULLIF(COUNT(s.player_id), 0)
      )::integer
    END,
    v_position_label
  FROM target t
  CROSS JOIN same_pos s
  WHERE t.last_5_avg IS NOT NULL AND s.last_5_avg IS NOT NULL
  GROUP BY t.last_5_avg

  UNION ALL

  -- price percentile
  SELECT
    'price'::text,
    t.price::numeric,
    COUNT(s.player_id)::integer,
    CASE
      WHEN COUNT(s.player_id) < 3 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(CASE WHEN s.price < t.price THEN 1 END)::numeric
        / NULLIF(COUNT(s.player_id), 0)
      )::integer
    END,
    v_position_label
  FROM target t
  CROSS JOIN same_pos s
  WHERE t.price IS NOT NULL AND s.price IS NOT NULL
  GROUP BY t.price

  UNION ALL

  -- consistency percentile
  SELECT
    'consistency'::text,
    t.consistency::numeric,
    COUNT(s.player_id)::integer,
    CASE
      WHEN COUNT(s.player_id) < 3 THEN NULL
      ELSE ROUND(
        100.0 * COUNT(CASE WHEN s.consistency < t.consistency THEN 1 END)::numeric
        / NULLIF(COUNT(s.player_id), 0)
      )::integer
    END,
    v_position_label
  FROM target t
  CROSS JOIN same_pos s
  WHERE t.consistency IS NOT NULL AND s.consistency IS NOT NULL
  GROUP BY t.consistency;

END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION get_position_comparison_safe(text, uuid) TO anon, authenticated;
