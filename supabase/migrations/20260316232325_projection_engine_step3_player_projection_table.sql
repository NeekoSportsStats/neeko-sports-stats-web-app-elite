/*
  # Projection Engine Rebuild — Step 3: player_projection Table

  ## Purpose
  Central projection table. Each row represents one player's projection
  for their next upcoming game. All calculations derive from feature tables.

  ## Columns
  - projection_base: form_score as the base
  - projection_matchup: base × matchup_rating
  - projection_venue: matchup × venue_multiplier
  - projection_pace: venue × pace_multiplier
  - projection_final: capped at base × 1.22
  - floor / ceiling: from feature_player_form
  - risk: LOW / MEDIUM / HIGH based on volatility
  - confidence: 0–100 based on games_played and consistency
  - consistency: from feature_player_form
  - value_score: projection_final / price × 1,000,000 (NULL if no price)
  - neeko_rating: composite rank signal 0–100

  ## Security
  - RLS enabled
  - service_role full access; authenticated + anon read
*/

CREATE TABLE IF NOT EXISTS afl.player_projection (
  player_id            integer       NOT NULL,
  game_id              integer,
  projection_base      numeric(6,2),
  projection_matchup   numeric(6,2),
  projection_venue     numeric(6,2),
  projection_pace      numeric(6,2),
  projection_final     numeric(6,2),
  floor                numeric(6,2),
  ceiling              integer,
  risk                 text,
  confidence           numeric(5,1),
  consistency          numeric(5,1),
  value_score          numeric(8,4),
  neeko_rating         numeric(5,1),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT player_projection_pkey PRIMARY KEY (player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_projection_game_id   ON afl.player_projection (game_id);
CREATE INDEX IF NOT EXISTS idx_player_projection_final     ON afl.player_projection (projection_final DESC);
CREATE INDEX IF NOT EXISTS idx_player_projection_rating    ON afl.player_projection (neeko_rating DESC);

ALTER TABLE afl.player_projection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages player_projection"
  ON afl.player_projection FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read player_projection"
  ON afl.player_projection FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read player_projection"
  ON afl.player_projection FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- Populate player_projection from feature tables
-- ─────────────────────────────────────────
INSERT INTO afl.player_projection (
  player_id,
  game_id,
  projection_base,
  projection_matchup,
  projection_venue,
  projection_pace,
  projection_final,
  floor,
  ceiling,
  risk,
  confidence,
  consistency,
  value_score,
  neeko_rating,
  updated_at
)
WITH next_game AS (
  SELECT DISTINCT ON (ng.team_id)
    ng.team_id,
    ng.game_id,
    ng.game_date,
    ng.venue,
    ng.home_team_id,
    ng.away_team_id
  FROM afl.v_next_games ng
  ORDER BY ng.team_id, ng.game_date ASC
),
player_next AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.team_id,
    ng.game_id,
    ng.game_date,
    ng.venue,
    CASE WHEN ng.home_team_id = pg.team_id THEN ng.away_team_id ELSE ng.home_team_id END AS opponent_team_id,
    CASE WHEN ng.home_team_id = pg.team_id THEN true ELSE false END                       AS is_home
  FROM afl.player_games pg
  JOIN next_game ng ON ng.team_id = pg.team_id
  ORDER BY pg.player_id, pg.game_id DESC
),
pace_mult AS (
  SELECT team_id, COALESCE(pace_multiplier, 1.0)::numeric AS pace_multiplier
  FROM afl.v_match_pace
),
calc AS (
  SELECT
    pn.player_id,
    pn.game_id,
    COALESCE(fpf.form_score, pla.league_avg, 40.0)::numeric                 AS base,
    COALESCE(fm.matchup_rating, 1.0)::numeric                               AS matchup_mult,
    COALESCE(fv.venue_multiplier, 1.0)::numeric                             AS venue_mult,
    COALESCE(pm.pace_multiplier, 1.0)::numeric                              AS pace_mult,
    COALESCE(fpf.floor, 0)::numeric                                         AS proj_floor,
    COALESCE(fpf.ceiling, 0)::integer                                       AS proj_ceiling,
    COALESCE(fpf.volatility, 30.0)::numeric                                 AS volatility,
    COALESCE(fpf.consistency, 50.0)::numeric                                AS consistency,
    fprice.price,
    COALESCE(fpf.games_played, 0)::integer                                  AS games_played,
    COALESCE(fpf.form_momentum, 0.0)::numeric                               AS form_momentum
  FROM player_next pn
  JOIN afl.players p ON p.player_id = pn.player_id
  LEFT JOIN afl.feature_player_form fpf ON fpf.player_id = pn.player_id
  LEFT JOIN afl.feature_matchup fm
    ON fm.player_id = pn.player_id AND fm.opponent_team_id = pn.opponent_team_id
  LEFT JOIN afl.feature_venue fv
    ON fv.player_id = pn.player_id AND fv.venue = pn.venue
  LEFT JOIN pace_mult pm ON pm.team_id = pn.team_id
  LEFT JOIN afl.feature_price fprice ON fprice.player_id = pn.player_id
  LEFT JOIN afl.v_position_league_average pla ON pla.position_group = p.position_group
  WHERE COALESCE(p.active, p.is_active, false) = true
),
projected AS (
  SELECT
    player_id,
    game_id,
    ROUND(base, 2)                                                                    AS projection_base,
    ROUND(base * matchup_mult, 2)                                                     AS projection_matchup,
    ROUND(base * matchup_mult * venue_mult, 2)                                        AS projection_venue,
    ROUND(base * matchup_mult * venue_mult * pace_mult, 2)                            AS projection_pace,
    ROUND(LEAST(base * matchup_mult * venue_mult * pace_mult, base * 1.22), 2)        AS projection_final,
    ROUND(GREATEST(0.0, proj_floor), 2)                                               AS floor,
    proj_ceiling                                                                       AS ceiling,
    CASE
      WHEN volatility >= 45 THEN 'HIGH'
      WHEN volatility >= 28 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                                               AS risk,
    ROUND(LEAST(100.0, GREATEST(0.0,
      CASE
        WHEN games_played >= 10 THEN consistency
        WHEN games_played >= 5  THEN consistency * 0.85
        WHEN games_played >= 3  THEN consistency * 0.70
        ELSE 40.0::numeric
      END
    )), 1)                                                                            AS confidence,
    ROUND(consistency, 1)                                                             AS consistency,
    price,
    games_played,
    form_momentum
  FROM calc
),
with_rank AS (
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY projection_final ASC NULLS FIRST) AS pct_rank
  FROM projected
)
SELECT
  wr.player_id,
  wr.game_id,
  wr.projection_base,
  wr.projection_matchup,
  wr.projection_venue,
  wr.projection_pace,
  wr.projection_final,
  wr.floor,
  wr.ceiling,
  wr.risk,
  wr.confidence,
  wr.consistency,
  CASE
    WHEN wr.price IS NULL OR wr.price = 0 THEN NULL
    ELSE ROUND(wr.projection_final / wr.price::numeric * 1000000.0, 4)
  END AS value_score,
  ROUND(
    LEAST(100.0::numeric, GREATEST(0.0::numeric,
      wr.pct_rank * 100.0 * 0.40 +
      wr.consistency * 0.30 +
      wr.confidence  * 0.20 +
      LEAST(100.0::numeric, GREATEST(0.0::numeric, wr.form_momentum * 3.0 + 50.0)) * 0.10
    ))::numeric,
    1
  ) AS neeko_rating,
  now()
FROM with_rank wr
ON CONFLICT (player_id) DO UPDATE SET
  game_id            = EXCLUDED.game_id,
  projection_base    = EXCLUDED.projection_base,
  projection_matchup = EXCLUDED.projection_matchup,
  projection_venue   = EXCLUDED.projection_venue,
  projection_pace    = EXCLUDED.projection_pace,
  projection_final   = EXCLUDED.projection_final,
  floor              = EXCLUDED.floor,
  ceiling            = EXCLUDED.ceiling,
  risk               = EXCLUDED.risk,
  confidence         = EXCLUDED.confidence,
  consistency        = EXCLUDED.consistency,
  value_score        = EXCLUDED.value_score,
  neeko_rating       = EXCLUDED.neeko_rating,
  updated_at         = now();

-- Back-fill value_score into feature_price now that projections exist
UPDATE afl.feature_price fp
SET
  value_score = CASE
    WHEN fp.price IS NULL OR fp.price = 0 THEN NULL
    ELSE ROUND(pp.projection_final / fp.price::numeric * 1000000.0, 4)
  END,
  updated_at = now()
FROM afl.player_projection pp
WHERE pp.player_id = fp.player_id;
