/*
  # Upgrade v_match_prediction_features_true_game — Elite Projection Model

  ## Summary
  Rebuilds the match prediction features view with an upgraded scoring projection
  formula and a margin-driven confidence calculation.

  ## Changes

  ### Projected Score Formula (upgraded)
  Old: (avg_for + avg_against) / 2 + home_adj + offense*0.15 + defense*0.10
  New:
    projected_score = (team_avg_for * 0.6) + (opponent_avg_against * 0.4)
                    + home_ground_adjustment (+4 for home team)
                    + recent_form_adjustment (last_5 vs season_avg delta * 0.3)
                    + offense_adjustment (offense_rating * 0.15)

  This better reflects the dual influence of a team's own scoring ability
  AND the opponent's defensive weakness.

  ### Confidence Formula (upgraded)
  Old: complex formula based on volatility, win rate delta
  New: margin-driven tiered confidence:
    0–3 pts margin  → 50–60%
    4–10 pts margin → 60–75%
    11–20 pts margin → 75–85%
    21+ pts margin   → 85–95%
  Adjusted down by volatility: high combined volatility reduces confidence.

  ## No tables altered. View-only change.
*/

CREATE OR REPLACE VIEW afl.v_match_prediction_features_true_game AS
WITH name_map(short_name, full_name) AS (
  VALUES
    ('Adelaide',                    'Adelaide Crows'),
    ('Adelaide Crows',              'Adelaide Crows'),
    ('Brisbane',                    'Brisbane Lions'),
    ('Brisbane Lions',              'Brisbane Lions'),
    ('Carlton',                     'Carlton Blues'),
    ('Carlton Blues',               'Carlton Blues'),
    ('Collingwood',                 'Collingwood Magpies'),
    ('Collingwood Magpies',         'Collingwood Magpies'),
    ('Essendon',                    'Essendon Bombers'),
    ('Essendon Bombers',            'Essendon Bombers'),
    ('Fremantle',                   'Fremantle Dockers'),
    ('Fremantle Dockers',           'Fremantle Dockers'),
    ('Geelong',                     'Geelong Cats'),
    ('Geelong Cats',                'Geelong Cats'),
    ('Gold Coast',                  'Gold Coast Suns'),
    ('Gold Coast Suns',             'Gold Coast Suns'),
    ('GWS',                         'Greater Western Sydney Giants'),
    ('Greater Western Sydney',      'Greater Western Sydney Giants'),
    ('Greater Western Sydney Giants','Greater Western Sydney Giants'),
    ('Hawthorn',                    'Hawthorn Hawks'),
    ('Hawthorn Hawks',              'Hawthorn Hawks'),
    ('Melbourne',                   'Melbourne Demons'),
    ('Melbourne Demons',            'Melbourne Demons'),
    ('North Melbourne',             'North Melbourne Kangaroos'),
    ('North Melbourne Kangaroos',   'North Melbourne Kangaroos'),
    ('Port Adelaide',               'Port Adelaide Power'),
    ('Port Adelaide Power',         'Port Adelaide Power'),
    ('Richmond',                    'Richmond Tigers'),
    ('Richmond Tigers',             'Richmond Tigers'),
    ('St Kilda',                    'St Kilda Saints'),
    ('St Kilda Saints',             'St Kilda Saints'),
    ('Sydney',                      'Sydney Swans'),
    ('Sydney Swans',                'Sydney Swans'),
    ('West Coast',                  'West Coast Eagles'),
    ('West Coast Eagles',           'West Coast Eagles'),
    ('Western Bulldogs',            'Western Bulldogs')
),
league_avg AS (
  SELECT
    AVG(season_avg_for)     AS lg_avg_for,
    AVG(season_avg_against) AS lg_avg_against
  FROM afl.v_team_match_features
  WHERE season_avg_for IS NOT NULL
),
team_season_stats AS (
  SELECT DISTINCT ON (team)
    team,
    season_avg_for,
    season_avg_against,
    last_5_avg_for,
    last_5_avg_against,
    volatility_last_5,
    rest_days,
    win_rate_season,
    momentum_score,
    home_advantage_delta,
    confidence_score
  FROM afl.v_team_match_features
  ORDER BY team, match_date DESC
),
payload_matches AS (
  SELECT
    p.match_id,
    p.season,
    p.round_number,
    p.match_date::timestamp AS match_date,
    p.home_team             AS payload_home,
    p.away_team             AS payload_away,
    COALESCE(nh.full_name, p.home_team) AS home_full,
    COALESCE(na.full_name, p.away_team) AS away_full
  FROM afl.v_ai_match_payloads_2026_next_round p
  LEFT JOIN name_map nh ON nh.short_name = p.home_team
  LEFT JOIN name_map na ON na.short_name = p.away_team
  WHERE p.round_number = (
    SELECT MIN(round_number)
    FROM afl.v_ai_match_payloads_2026_next_round
  )
),
joined AS (
  SELECT
    pm.match_id,
    pm.season,
    pm.round_number,
    pm.match_date,
    pm.payload_home                                               AS home_team,
    pm.payload_away                                               AS away_team,

    COALESCE(h.season_avg_for,      85::numeric)                 AS home_points_for_avg,
    COALESCE(h.season_avg_against,  85::numeric)                 AS home_points_against_avg,
    COALESCE(a.season_avg_for,      85::numeric)                 AS away_points_for_avg,
    COALESCE(a.season_avg_against,  85::numeric)                 AS away_points_against_avg,

    COALESCE(h.last_5_avg_for, h.season_avg_for, 85::numeric)   AS home_last5_for,
    COALESCE(a.last_5_avg_for, a.season_avg_for, 85::numeric)   AS away_last5_for,

    ROUND((COALESCE(h.season_avg_for, 85::numeric) - lg.lg_avg_for),      2) AS home_offense_rating,
    ROUND((COALESCE(a.season_avg_for, 85::numeric) - lg.lg_avg_for),      2) AS away_offense_rating,
    ROUND((lg.lg_avg_against - COALESCE(h.season_avg_against, 85::numeric)), 2) AS home_defense_rating,
    ROUND((lg.lg_avg_against - COALESCE(a.season_avg_against, 85::numeric)), 2) AS away_defense_rating,

    COALESCE(h.volatility_last_5,   0::numeric)                 AS home_volatility,
    COALESCE(a.volatility_last_5,   0::numeric)                 AS away_volatility,

    COALESCE(h.rest_days,  7)                                    AS home_days_rest,
    COALESCE(a.rest_days,  7)                                    AS away_days_rest,

    h.win_rate_season   AS home_win_rate,
    a.win_rate_season   AS away_win_rate,
    h.momentum_score    AS home_momentum,
    a.momentum_score    AS away_momentum,
    h.home_advantage_delta,
    h.confidence_score  AS home_confidence,
    a.confidence_score  AS away_confidence
  FROM payload_matches pm
  LEFT JOIN team_season_stats h ON h.team = pm.home_full
  LEFT JOIN team_season_stats a ON a.team = pm.away_full
  CROSS JOIN league_avg lg
),
scored AS (
  SELECT
    *,
    ROUND((
      (home_points_for_avg * 0.6)
      + (away_points_against_avg * 0.4)
      + 4.0
      + ((home_last5_for - home_points_for_avg) * 0.3)
      + (home_offense_rating * 0.15)
    )::numeric, 1) AS projected_home_score,

    ROUND((
      (away_points_for_avg * 0.6)
      + (home_points_against_avg * 0.4)
      + ((away_last5_for - away_points_for_avg) * 0.3)
      + (away_offense_rating * 0.15)
    )::numeric, 1) AS projected_away_score
  FROM joined
),
final AS (
  SELECT
    match_id,
    season,
    round_number,
    match_date,
    home_team,
    away_team,
    projected_home_score,
    projected_away_score,
    ROUND((projected_home_score - projected_away_score)::numeric, 1) AS projected_margin,

    home_points_for_avg,
    home_points_against_avg,
    away_points_for_avg,
    away_points_against_avg,
    home_last5_for,
    away_last5_for,
    home_offense_rating,
    away_offense_rating,
    home_defense_rating,
    away_defense_rating,
    home_volatility,
    away_volatility,
    home_days_rest,
    away_days_rest,
    true AS is_home_game,
    home_win_rate,
    away_win_rate,
    home_momentum,
    away_momentum,
    home_advantage_delta,
    home_confidence,
    away_confidence,

    ROUND(
      (1.0 / (1.0 + EXP(-((projected_home_score - projected_away_score) / 15.0))))::numeric, 4
    ) AS win_probability_home,
    ROUND(
      (1.0 - 1.0 / (1.0 + EXP(-((projected_home_score - projected_away_score) / 15.0))))::numeric, 4
    ) AS win_probability_away,

    ROUND(GREATEST(50.0, LEAST(95.0, (
      CASE
        WHEN ABS(projected_home_score - projected_away_score) <= 3  THEN 55.0
        WHEN ABS(projected_home_score - projected_away_score) <= 10 THEN 67.5
        WHEN ABS(projected_home_score - projected_away_score) <= 20 THEN 80.0
        ELSE 90.0
      END
      - ((COALESCE(home_volatility, 0) + COALESCE(away_volatility, 0)) / 6.0)
    )))::numeric, 1) AS model_confidence
  FROM scored
)
SELECT * FROM final;
