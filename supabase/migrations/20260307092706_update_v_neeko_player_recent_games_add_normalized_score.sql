/*
  # Update afl.v_neeko_player_recent_games — Add normalized_score and position

  ## Changes
  1. Added `position` column — derived from players_canonical using 4-group taxonomy
     (DEF/MID/FWD/RUC). New columns appended AFTER all existing columns to preserve
     column ordinal positions for any downstream consumers relying on column order.

  2. Added `normalized_score` column — fantasy_points / matchup_multiplier from
     v_position_matchup_multiplier_2025. Defaults to raw fantasy_points (multiplier=1.0)
     when no matchup data exists.

  ## Existing column order preserved exactly
  player_id, player_name, team, season, round_number, match_index,
  opponent, fantasy_points, row_num — unchanged in order and semantics.

  ## New columns appended at end
  position, normalized_score
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_recent_games AS
WITH player_positions AS (
    SELECT DISTINCT ON (player_name)
        player_name,
        CASE
            WHEN position ILIKE '%defender%' THEN 'DEF'
            WHEN position ILIKE '%mid%'      THEN 'MID'
            WHEN position ILIKE '%forward%'  THEN 'FWD'
            WHEN position ILIKE '%ruck%'     THEN 'RUC'
            ELSE NULL
        END AS position_group
    FROM afl.players_canonical
    WHERE position IS NOT NULL
    ORDER BY player_name, season DESC
),
all_games AS (
    SELECT
        p.player_id,
        p.player_name,
        p.team AS current_team,
        h.season,
        h.round_number,
        h.match_index,
        h.opponent,
        h.fantasy_points
    FROM afl.v_player_round_canonical_2025 h
    JOIN afl.players p ON p.player_name = h.player
    WHERE h.played = true AND h.fantasy_points IS NOT NULL

    UNION ALL

    SELECT
        p.player_id,
        p.player_name,
        p.team AS current_team,
        c.season,
        c.round_number,
        c.match_index,
        c.opponent_canonical AS opponent,
        c.fantasy_points::integer AS fantasy_points
    FROM afl.player_round_stats_2025_canonical_tbl c
    JOIN afl.players p ON p.player_name = c.player
    WHERE c.season = 2026 AND c.fantasy_points IS NOT NULL
),
ranked AS (
    SELECT
        g.player_id,
        g.player_name,
        g.current_team AS team,
        g.season,
        g.round_number,
        g.match_index,
        g.opponent,
        g.fantasy_points,
        pp.position_group AS position_group,
        row_number() OVER (
            PARTITION BY g.player_id
            ORDER BY g.season DESC, g.round_number DESC, g.match_index DESC
        ) AS row_num
    FROM all_games g
    LEFT JOIN player_positions pp ON pp.player_name = g.player_name
)
SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.season,
    r.round_number,
    r.match_index,
    r.opponent,
    r.fantasy_points,
    r.row_num,
    r.position_group                                          AS position,
    round(
        r.fantasy_points::numeric
            / NULLIF(COALESCE(m.matchup_multiplier, 1.0), 0),
        2
    )                                                         AS normalized_score
FROM ranked r
LEFT JOIN afl.v_position_matchup_multiplier_2025 m
    ON m.opponent_team = r.opponent
    AND m.position     = r.position_group;
