/*
  # Populate afl.ai_player_summaries from 2026 projection data

  ## Summary
  Backfills afl.ai_player_summaries with projection data for all 782 players
  in the upcoming 2026 season (round_number = 0 = pre-season / Round 1 fixture).

  The AI edge function (generate-player-summary) was designed to populate this table
  via OpenAI calls, but the table has been empty since a deliberate TRUNCATE on
  2026-02-23. This migration seeds the table immediately using existing projection
  views so downstream features (Players page AI insights, AI Analysis pages) work.

  ## Source views joined
  - afl.v_ai_player_openai_inputs_2026_next_round  — player_id, player, team, opponent, round_number (782 rows)
  - afl.v_neeko_player_projection                  — all numeric projection fields, joins on player_id (782/782 match)

  ## Deduplication
  Two player_ids (403, 500) appear twice in the inputs view. DISTINCT ON (player_id)
  is used to take the first occurrence per player before inserting.

  ## Target table
  - afl.ai_player_summaries
  - Primary key: (player_id, season, round_number)

  ## Notes
  - Fully idempotent: uses INSERT ... ON CONFLICT (player_id, season, round_number) DO UPDATE
  - ai_summary is a structured temporary summary overwriteable by the OpenAI edge function
  - No objects dropped, no tables truncated
*/

INSERT INTO afl.ai_player_summaries (
  player_id,
  player,
  team,
  season,
  round_number,
  opponent,
  expected_fantasy,
  floor_fantasy,
  ceiling_fantasy,
  volatility,
  season_avg,
  last_5_avg,
  games_played,
  trend_direction,
  consistency_score,
  ai_summary,
  updated_at,
  last_updated
)
SELECT
  src.player_id::integer,
  src.player,
  src.team,
  2026                                                          AS season,
  src.round_number,
  src.opponent,
  proj.final_projection                                         AS expected_fantasy,
  proj.floor_estimate                                           AS floor_fantasy,
  proj.ceiling_estimate                                         AS ceiling_fantasy,
  proj.volatility_last_15                                       AS volatility,
  proj.season_avg_current                                       AS season_avg,
  proj.avg_last_5                                               AS last_5_avg,
  proj.games_played_2026::integer                               AS games_played,
  CASE
    WHEN proj.trend_3_vs_10 > 5  THEN 'up'
    WHEN proj.trend_3_vs_10 < -5 THEN 'down'
    ELSE 'stable'
  END                                                           AS trend_direction,
  CASE
    WHEN proj.volatility_last_15 IS NULL THEN NULL
    WHEN proj.volatility_last_15 < 15 THEN ROUND(90 - proj.volatility_last_15 * 2, 1)
    WHEN proj.volatility_last_15 < 25 THEN ROUND(75 - (proj.volatility_last_15 - 15) * 2, 1)
    ELSE ROUND(55 - LEAST((proj.volatility_last_15 - 25) * 1.5, 30), 1)
  END                                                           AS consistency_score,
  CONCAT(
    src.player, ' (', src.team, ')',
    ' faces ', COALESCE(src.opponent, 'TBD'),
    ' in Round ', src.round_number,
    '. Projected fantasy score: ',
    ROUND(COALESCE(proj.final_projection, 0), 1),
    '. Season avg: ',
    ROUND(COALESCE(proj.season_avg_current, 0), 1),
    '. Last 5 avg: ',
    ROUND(COALESCE(proj.avg_last_5, 0), 1),
    '. Range: ',
    ROUND(COALESCE(proj.floor_estimate, 0), 1),
    '–',
    ROUND(COALESCE(proj.ceiling_estimate, 0), 1),
    '. Trend: ',
    CASE
      WHEN proj.trend_3_vs_10 > 5  THEN 'upward'
      WHEN proj.trend_3_vs_10 < -5 THEN 'downward'
      ELSE 'stable'
    END,
    '.'
  )                                                             AS ai_summary,
  now()                                                         AS updated_at,
  now()                                                         AS last_updated
FROM (
  SELECT DISTINCT ON (player_id)
    player_id, player, team, opponent, round_number
  FROM afl.v_ai_player_openai_inputs_2026_next_round
  ORDER BY player_id
) src
JOIN afl.v_neeko_player_projection proj
  ON proj.player_id = src.player_id
ON CONFLICT (player_id, season, round_number) DO UPDATE SET
  player              = EXCLUDED.player,
  team                = EXCLUDED.team,
  opponent            = EXCLUDED.opponent,
  expected_fantasy    = EXCLUDED.expected_fantasy,
  floor_fantasy       = EXCLUDED.floor_fantasy,
  ceiling_fantasy     = EXCLUDED.ceiling_fantasy,
  volatility          = EXCLUDED.volatility,
  season_avg          = EXCLUDED.season_avg,
  last_5_avg          = EXCLUDED.last_5_avg,
  games_played        = EXCLUDED.games_played,
  trend_direction     = EXCLUDED.trend_direction,
  consistency_score   = EXCLUDED.consistency_score,
  ai_summary          = EXCLUDED.ai_summary,
  updated_at          = EXCLUDED.updated_at,
  last_updated        = EXCLUDED.last_updated;
