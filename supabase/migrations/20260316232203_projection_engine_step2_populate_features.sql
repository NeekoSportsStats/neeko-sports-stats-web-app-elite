/*
  # Projection Engine Rebuild — Step 2: Populate Feature Tables

  ## Purpose
  Populate all feature tables from canonical sources only.
  No synthetic values are created. All calculations derive from
  afl.player_games.fantasy_score and afl.games.

  ## Populations

  ### feature_player_form
  - season_avg, last3/5/10 via ordered window frames
  - ceiling = 85th percentile of all scores
  - floor   = 15th percentile of all scores
  - volatility = stddev / avg (coefficient of variation × 100)
  - consistency = 100 - volatility (clamped 0–100)
  - form_score = weighted recency blend (35% last3, 25% last5, 25% last10, 15% season)
  - form_momentum = last3_avg - last10_avg (positive = rising)

  ### feature_matchup
  - matchup_rating = blended avg allowed / league avg (0.85 season + 0.15 last-5)
  - opponent_rank_vs_position = rank within position (1 = hardest matchup for that position)

  ### feature_venue
  - venue_multiplier from v_venue_multiplier (clamped [0.92, 1.08])
  - home_advantage from v_home_ground_advantage joined via player's team

  ### feature_rest
  - rest_days from team-level rest calc (lag game_date per team)
  - short_turnaround_flag = rest_days <= 6

  ### feature_price
  - price from latest afl.player_prices record
  - value_score left NULL (no projection yet; will be updated after projection table is populated)
*/

-- ─────────────────────────────────────────
-- feature_player_form
-- ─────────────────────────────────────────
INSERT INTO afl.feature_player_form (
  player_id,
  games_played,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  ceiling,
  floor,
  volatility,
  consistency,
  form_score,
  form_momentum,
  updated_at
)
WITH ranked_scores AS (
  SELECT
    pg.player_id,
    pg.fantasy_score,
    ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn,
    COUNT(*) FILTER (WHERE pg.fantasy_score > 0)
      OVER (PARTITION BY pg.player_id) AS total_games
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  WHERE pg.fantasy_score > 0
),
aggregated AS (
  SELECT
    player_id,
    MAX(total_games)                                                                    AS games_played,
    ROUND(AVG(fantasy_score)::numeric, 2)                                               AS season_avg,
    ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 3)::numeric, 2)                       AS last3_avg,
    ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)                       AS last5_avg,
    ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 10)::numeric, 2)                      AS last10_avg,
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score)::integer               AS ceiling,
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score)::integer               AS floor,
    ROUND(
      CASE
        WHEN AVG(fantasy_score) = 0 OR AVG(fantasy_score) IS NULL THEN NULL
        ELSE STDDEV(fantasy_score)::numeric / AVG(fantasy_score)::numeric * 100
      END, 2
    )                                                                                   AS volatility
  FROM ranked_scores
  GROUP BY player_id
)
SELECT
  a.player_id,
  COALESCE(a.games_played, 0)::integer                                                AS games_played,
  a.season_avg,
  a.last3_avg,
  a.last5_avg,
  a.last10_avg,
  a.ceiling,
  a.floor,
  a.volatility,
  ROUND(LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(a.volatility, 50.0))), 1)        AS consistency,
  ROUND(
    COALESCE(a.last3_avg,  a.season_avg, 0) * 0.35 +
    COALESCE(a.last5_avg,  a.season_avg, 0) * 0.25 +
    COALESCE(a.last10_avg, a.season_avg, 0) * 0.25 +
    COALESCE(a.season_avg, 0)               * 0.15,
    2
  )                                                                                   AS form_score,
  ROUND(COALESCE(a.last3_avg, a.season_avg, 0) - COALESCE(a.last10_avg, a.season_avg, 0), 2)
                                                                                      AS form_momentum,
  now()
FROM aggregated a
ON CONFLICT (player_id) DO UPDATE SET
  games_played   = EXCLUDED.games_played,
  season_avg     = EXCLUDED.season_avg,
  last3_avg      = EXCLUDED.last3_avg,
  last5_avg      = EXCLUDED.last5_avg,
  last10_avg     = EXCLUDED.last10_avg,
  ceiling        = EXCLUDED.ceiling,
  floor          = EXCLUDED.floor,
  volatility     = EXCLUDED.volatility,
  consistency    = EXCLUDED.consistency,
  form_score     = EXCLUDED.form_score,
  form_momentum  = EXCLUDED.form_momentum,
  updated_at     = now();

-- ─────────────────────────────────────────
-- feature_matchup
-- Populated per player: their position_group × each possible opponent team.
-- matchup_rating = blended_allowed / league_avg (0.85 season + 0.15 last-5)
-- ─────────────────────────────────────────
INSERT INTO afl.feature_matchup (
  player_id,
  opponent_team_id,
  position_group,
  matchup_rating,
  opponent_rank_vs_position,
  updated_at
)
WITH defence AS (
  SELECT
    s.defence_team_id,
    s.position_group,
    s.avg_points_allowed                                                                      AS season_allowed,
    COALESCE(r.avg_points_allowed_last5, s.avg_points_allowed)                               AS recent_allowed,
    l.league_avg
  FROM afl.v_team_defence_vs_position s
  LEFT JOIN afl.v_team_defence_vs_position_last5 r
    ON r.defence_team_id = s.defence_team_id AND r.position_group = s.position_group
  JOIN afl.v_position_league_average l ON l.position_group = s.position_group
),
blended AS (
  SELECT
    defence_team_id,
    position_group,
    league_avg,
    ROUND((season_allowed * 0.85 + recent_allowed * 0.15) / NULLIF(league_avg, 0), 3) AS matchup_rating
  FROM defence
),
ranked AS (
  SELECT
    *,
    RANK() OVER (PARTITION BY position_group ORDER BY matchup_rating ASC) AS opponent_rank_vs_position
  FROM blended
)
SELECT
  p.player_id,
  r.defence_team_id  AS opponent_team_id,
  p.position_group,
  r.matchup_rating,
  r.opponent_rank_vs_position::integer,
  now()
FROM afl.players p
JOIN ranked r ON r.position_group = p.position_group
WHERE p.position_group IS NOT NULL
  AND COALESCE(p.active, p.is_active, false) = true
ON CONFLICT (player_id, opponent_team_id, position_group) DO UPDATE SET
  matchup_rating            = EXCLUDED.matchup_rating,
  opponent_rank_vs_position = EXCLUDED.opponent_rank_vs_position,
  updated_at                = now();

-- ─────────────────────────────────────────
-- feature_venue
-- venue_multiplier from existing view logic (already clamped [0.92, 1.08])
-- home_advantage inherited from team-level delta
-- ─────────────────────────────────────────
INSERT INTO afl.feature_venue (
  player_id,
  venue,
  venue_multiplier,
  home_advantage,
  updated_at
)
WITH player_team AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.team_id
  FROM afl.player_games pg
  ORDER BY pg.player_id, pg.game_id DESC
),
venue_mults AS (
  SELECT vm.venue, vm.position_group, vm.venue_multiplier
  FROM afl.v_venue_multiplier vm
),
home_adv AS (
  SELECT hga.team_id, hga.home_advantage
  FROM afl.v_home_ground_advantage hga
)
SELECT
  p.player_id,
  vm.venue,
  vm.venue_multiplier,
  ha.home_advantage,
  now()
FROM afl.players p
JOIN player_team pt ON pt.player_id = p.player_id
JOIN venue_mults vm ON vm.position_group = p.position_group
LEFT JOIN home_adv ha ON ha.team_id = pt.team_id
WHERE p.position_group IS NOT NULL
ON CONFLICT (player_id, venue) DO UPDATE SET
  venue_multiplier = EXCLUDED.venue_multiplier,
  home_advantage   = EXCLUDED.home_advantage,
  updated_at       = now();

-- ─────────────────────────────────────────
-- feature_rest
-- Derived from canonical afl.games via lag per team,
-- then joined to players via player_games.
-- ─────────────────────────────────────────
INSERT INTO afl.feature_rest (
  player_id,
  game_id,
  rest_days,
  short_turnaround_flag,
  updated_at
)
WITH team_games AS (
  SELECT home_team_id AS team_id, game_id, game_date FROM afl.games
  UNION ALL
  SELECT away_team_id AS team_id, game_id, game_date FROM afl.games
),
rest_calc AS (
  SELECT
    team_id,
    game_id,
    game_date,
    LEAST(
      GREATEST(
        EXTRACT(day FROM game_date - LAG(game_date) OVER (PARTITION BY team_id ORDER BY game_date))::numeric,
        5
      ),
      9
    ) AS rest_days
  FROM team_games
)
SELECT
  pg.player_id,
  pg.game_id,
  rc.rest_days,
  COALESCE(rc.rest_days <= 6, false) AS short_turnaround_flag,
  now()
FROM afl.player_games pg
JOIN afl.games g ON g.game_id = pg.game_id
JOIN rest_calc rc ON rc.team_id = pg.team_id AND rc.game_id = pg.game_id
ON CONFLICT (player_id, game_id) DO UPDATE SET
  rest_days             = EXCLUDED.rest_days,
  short_turnaround_flag = EXCLUDED.short_turnaround_flag,
  updated_at            = now();

-- ─────────────────────────────────────────
-- feature_price
-- Latest price from afl.player_prices (manually imported).
-- value_score populated as NULL until projections exist.
-- ─────────────────────────────────────────
INSERT INTO afl.feature_price (
  player_id,
  price,
  value_score,
  updated_at
)
SELECT
  p.player_id,
  pp.price,
  NULL::numeric AS value_score,
  now()
FROM afl.players p
LEFT JOIN (
  SELECT DISTINCT ON (player_id) player_id, price, updated_at
  FROM afl.player_prices
  ORDER BY player_id, updated_at DESC
) pp ON pp.player_id = p.player_id
ON CONFLICT (player_id) DO UPDATE SET
  price      = EXCLUDED.price,
  updated_at = now();
