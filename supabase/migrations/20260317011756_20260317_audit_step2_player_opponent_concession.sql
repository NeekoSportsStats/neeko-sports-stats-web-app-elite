
/*
  # Audit Step 2: afl.player_opponent_concession

  ## Purpose
  Measures how many fantasy points each AFL team concedes to opposition
  players broken down by position group. Used to produce a modest
  position-based matchup multiplier for the projection engine.

  ## Source
  afl.player_games — 11,783 rows covering 2025 and 2026 seasons.
  Joined to afl.games to identify the defending (opposing) team.
  Joined to afl.players for position_group.

  ## Output Table: afl.player_opponent_concession
  One row per (defence_team_id, position_group).

  ### Columns
  - defence_team_id         — the team doing the defending
  - defence_team_name       — display name
  - position_group          — DEF / MID / RUC / FWD
  - season_games_sampled    — how many player-games went into the season avg
  - season_avg_conceded     — full season average fantasy pts conceded to this position
  - last5_avg_conceded      — last 5 rounds average (more weight on recent form)
  - league_avg_conceded     — league-wide average conceded to this position (for normalisation)
  - concession_index        — season_avg / league_avg  (1.00 = neutral)
  - concession_index_blended — 0.70 * season + 0.30 * last5 normalised  (primary signal)
  - concession_multiplier   — clamped blended index, range 0.92–1.08
  - updated_at

  ## Clamping
  Multiplier is hard-clamped to [0.92, 1.08] to prevent over-amplification.
  This keeps it as a modest signal only, as specified.

  ## Security
  RLS enabled. Authenticated read. Service role write.
*/

DROP TABLE IF EXISTS afl.player_opponent_concession CASCADE;

CREATE TABLE afl.player_opponent_concession (
  defence_team_id          integer NOT NULL,
  defence_team_name        text,
  position_group           text NOT NULL,
  season_games_sampled     integer,
  season_avg_conceded      numeric,
  last5_avg_conceded       numeric,
  league_avg_conceded      numeric,
  concession_index         numeric,
  concession_index_blended numeric,
  concession_multiplier    numeric,
  updated_at               timestamptz DEFAULT now(),
  PRIMARY KEY (defence_team_id, position_group)
);

ALTER TABLE afl.player_opponent_concession ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read opponent concession"
  ON afl.player_opponent_concession FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can write opponent concession"
  ON afl.player_opponent_concession FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_poc_defence_team ON afl.player_opponent_concession (defence_team_id);
CREATE INDEX idx_poc_position     ON afl.player_opponent_concession (position_group);

/*
  Populate: full season concession per team per position
*/
WITH season_concession AS (
  SELECT
    opponent.team_id    AS defence_team_id,
    opponent.team_name  AS defence_team_name,
    p.position_group,
    COUNT(*)            AS games_sampled,
    round(avg(pg.fantasy_score)::numeric, 2) AS avg_conceded
  FROM afl.player_games pg
  JOIN afl.players p  ON pg.player_id = p.player_id
  JOIN afl.games   g  ON pg.game_id   = g.game_id
  JOIN LATERAL (
    SELECT
      CASE WHEN pg.team_id = g.home_team_id THEN g.away_team_id   ELSE g.home_team_id   END AS team_id,
      CASE WHEN pg.team_id = g.home_team_id THEN g.away_team_name ELSE g.home_team_name END AS team_name
  ) opponent ON true
  WHERE pg.fantasy_score > 0
    AND p.position_group IS NOT NULL
  GROUP BY opponent.team_id, opponent.team_name, p.position_group
),
/*
  Last 5 rounds concession: find the 5 most recent rounds per team/position
*/
last5_rounds AS (
  SELECT DISTINCT ON (g.week, opponent.team_id)
    g.week,
    opponent.team_id AS defence_team_id,
    p.position_group,
    avg(pg.fantasy_score) OVER (
      PARTITION BY opponent.team_id, p.position_group
      ORDER BY g.week DESC
      ROWS BETWEEN CURRENT ROW AND 4 FOLLOWING
    ) AS rolling_avg
  FROM afl.player_games pg
  JOIN afl.players p ON pg.player_id = p.player_id
  JOIN afl.games   g ON pg.game_id   = g.game_id
  JOIN LATERAL (
    SELECT
      CASE WHEN pg.team_id = g.home_team_id THEN g.away_team_id ELSE g.home_team_id END AS team_id
  ) opponent ON true
  WHERE pg.fantasy_score > 0
    AND p.position_group IS NOT NULL
  ORDER BY g.week, opponent.team_id
),
last5_summary AS (
  SELECT defence_team_id, position_group,
    round(avg(rolling_avg)::numeric, 2) AS last5_avg
  FROM last5_rounds
  GROUP BY defence_team_id, position_group
),
league_avg AS (
  SELECT position_group,
    round(avg(avg_conceded)::numeric, 2) AS league_avg
  FROM season_concession
  GROUP BY position_group
),
combined AS (
  SELECT
    sc.defence_team_id,
    sc.defence_team_name,
    sc.position_group,
    sc.games_sampled,
    sc.avg_conceded                                         AS season_avg_conceded,
    COALESCE(l5.last5_avg, sc.avg_conceded)                 AS last5_avg_conceded,
    la.league_avg                                           AS league_avg_conceded,
    round(sc.avg_conceded / NULLIF(la.league_avg, 0), 4)    AS concession_index,
    round(
      (sc.avg_conceded * 0.70 + COALESCE(l5.last5_avg, sc.avg_conceded) * 0.30)
      / NULLIF(la.league_avg, 0), 4
    )                                                       AS concession_index_blended
  FROM season_concession sc
  LEFT JOIN last5_summary l5 ON l5.defence_team_id = sc.defence_team_id
                             AND l5.position_group  = sc.position_group
  LEFT JOIN league_avg    la ON la.position_group   = sc.position_group
)
INSERT INTO afl.player_opponent_concession (
  defence_team_id, defence_team_name, position_group,
  season_games_sampled, season_avg_conceded, last5_avg_conceded,
  league_avg_conceded, concession_index, concession_index_blended,
  concession_multiplier, updated_at
)
SELECT
  defence_team_id,
  defence_team_name,
  position_group,
  games_sampled,
  season_avg_conceded,
  last5_avg_conceded,
  league_avg_conceded,
  concession_index,
  concession_index_blended,
  LEAST(1.08, GREATEST(0.92, concession_index_blended)) AS concession_multiplier,
  now()
FROM combined
ON CONFLICT (defence_team_id, position_group) DO UPDATE SET
  defence_team_name        = EXCLUDED.defence_team_name,
  season_games_sampled     = EXCLUDED.season_games_sampled,
  season_avg_conceded      = EXCLUDED.season_avg_conceded,
  last5_avg_conceded       = EXCLUDED.last5_avg_conceded,
  league_avg_conceded      = EXCLUDED.league_avg_conceded,
  concession_index         = EXCLUDED.concession_index,
  concession_index_blended = EXCLUDED.concession_index_blended,
  concession_multiplier    = EXCLUDED.concession_multiplier,
  updated_at               = now();
