/*
  # Rebuild v_match_prediction_features_true_game — Real AFL Score Engine v2

  ## Root Cause Fixed
  Previous view pulled from v_team_match_features which had cumulative rolling
  rows and fantasy-scaled data. Sydney was showing 79 avg_for instead of the
  correct 80.2 from real match scores. The DISTINCT ON was picking inconsistent rows.

  ## New Data Source
  Now uses team_match_results (points_for, points_against per game) aggregated
  to full season 2025 averages — the most accurate end-of-season baseline.

  ## New Scoring Formula
  base_score = (team_avg_for + opponent_avg_against) / 2
  projected = base_score + home_bonus(+8) + recent_form_adj(-8..+8) + strength_adj

  ## New Strength Index
  strength_index = (avg_for * 0.7) - (avg_against * 0.5) + ladder_adj + form_weight
  ladder_adj: top4=+12, top8=+6, bottom4=-6, else=0

  ## New Win Probability
  win_prob = 1 / (1 + exp(-strength_diff / 10))

  ## New Confidence
  confidence = 50 + abs(strength_diff) * 2.5  clamped 50–95

  ## No tables dropped or altered
*/

CREATE OR REPLACE VIEW afl.v_match_prediction_features_true_game AS

WITH name_map(raw_name, canonical) AS (
  VALUES
    ('Adelaide',                        'Adelaide Crows'),
    ('Adelaide Crows',                  'Adelaide Crows'),
    ('Brisbane',                        'Brisbane Lions'),
    ('Brisbane Lions',                  'Brisbane Lions'),
    ('Carlton',                         'Carlton Blues'),
    ('Carlton Blues',                   'Carlton Blues'),
    ('Collingwood',                     'Collingwood Magpies'),
    ('Collingwood Magpies',             'Collingwood Magpies'),
    ('Essendon',                        'Essendon Bombers'),
    ('Essendon Bombers',                'Essendon Bombers'),
    ('Fremantle',                       'Fremantle Dockers'),
    ('Fremantle Dockers',               'Fremantle Dockers'),
    ('Geelong',                         'Geelong Cats'),
    ('Geelong Cats',                    'Geelong Cats'),
    ('Gold Coast',                      'Gold Coast Suns'),
    ('Gold Coast Suns',                 'Gold Coast Suns'),
    ('GWS',                             'Greater Western Sydney Giants'),
    ('Greater Western Sydney',          'Greater Western Sydney Giants'),
    ('Greater Western Sydney Giants',   'Greater Western Sydney Giants'),
    ('Hawthorn',                        'Hawthorn Hawks'),
    ('Hawthorn Hawks',                  'Hawthorn Hawks'),
    ('Melbourne',                       'Melbourne Demons'),
    ('Melbourne Demons',                'Melbourne Demons'),
    ('North Melbourne',                 'North Melbourne Kangaroos'),
    ('North Melbourne Kangaroos',       'North Melbourne Kangaroos'),
    ('Port Adelaide',                   'Port Adelaide Power'),
    ('Port Adelaide Power',             'Port Adelaide Power'),
    ('Richmond',                        'Richmond Tigers'),
    ('Richmond Tigers',                 'Richmond Tigers'),
    ('St Kilda',                        'St Kilda Saints'),
    ('St Kilda Saints',                 'St Kilda Saints'),
    ('Sydney',                          'Sydney Swans'),
    ('Sydney Swans',                    'Sydney Swans'),
    ('West Coast',                      'West Coast Eagles'),
    ('West Coast Eagles',               'West Coast Eagles'),
    ('Western Bulldogs',                'Western Bulldogs')
),

/* ── Real AFL season 2025 scoring averages ── */
season_stats AS (
  SELECT
    team,
    COUNT(*)                            AS games_played,
    ROUND(AVG(points_for),   2)         AS avg_for,
    ROUND(AVG(points_against), 2)       AS avg_against,
    SUM(win::int)                       AS wins
  FROM afl.team_match_results
  WHERE season = 2025
  GROUP BY team
),

/* ── Last-5-game form per team ── */
last5 AS (
  SELECT
    team,
    ROUND(AVG(points_for), 2) AS last5_avg_for,
    ROUND(STDDEV(points_for), 2) AS volatility
  FROM (
    SELECT team, points_for,
           ROW_NUMBER() OVER (PARTITION BY team ORDER BY match_date DESC, id DESC) AS rn
    FROM afl.team_match_results
    WHERE season = 2025
  ) sub
  WHERE rn <= 5
  GROUP BY team
),

/* ── 2025 final ladder ── */
ladder AS (
  SELECT team, position
  FROM afl.v_ladder_2025
  WHERE season = 2025
),

/* ── Build team strength index ── */
team_strength AS (
  SELECT
    s.team,
    s.games_played,
    s.avg_for,
    s.avg_against,
    s.wins,
    ROUND(s.wins::numeric / NULLIF(s.games_played, 0), 3) AS win_rate,
    l5.last5_avg_for,
    l5.volatility,
    ld.position AS ladder_position,

    /* recent form weight: delta last5 vs season avg, clamped -8..+8 */
    ROUND(GREATEST(-8, LEAST(8, (l5.last5_avg_for - s.avg_for) * 0.35))::numeric, 2)
      AS recent_form_adj,

    /* ladder position bonus */
    CASE
      WHEN ld.position <= 4  THEN 12
      WHEN ld.position <= 8  THEN 6
      WHEN ld.position >= 15 THEN -6
      ELSE 0
    END AS ladder_adj,

    /* strength index = (avg_for * 0.7) - (avg_against * 0.5) + ladder_adj + form_weight */
    ROUND((
      (s.avg_for * 0.7)
      - (s.avg_against * 0.5)
      + CASE WHEN ld.position <= 4 THEN 12 WHEN ld.position <= 8 THEN 6 WHEN ld.position >= 15 THEN -6 ELSE 0 END
      + GREATEST(-8, LEAST(8, (l5.last5_avg_for - s.avg_for) * 0.35))
    )::numeric, 2) AS strength_index

  FROM season_stats s
  LEFT JOIN last5 l5 ON l5.team = s.team
  LEFT JOIN ladder ld ON ld.team = s.team
),

league_avg AS (
  SELECT ROUND(AVG(avg_for), 2) AS lg_avg FROM team_strength
),

/* ── Canonical names for payload teams ── */
payload_matches AS (
  SELECT
    p.match_id,
    p.season,
    p.round_number,
    p.match_date::timestamp AS match_date,
    p.home_team             AS payload_home,
    p.away_team             AS payload_away,
    COALESCE(nh.canonical, p.home_team) AS home_canonical,
    COALESCE(na.canonical, p.away_team) AS away_canonical
  FROM afl.v_ai_match_payloads_2026_next_round p
  LEFT JOIN name_map nh ON nh.raw_name = p.home_team
  LEFT JOIN name_map na ON na.raw_name = p.away_team
  WHERE p.round_number = (
    SELECT MIN(round_number) FROM afl.v_ai_match_payloads_2026_next_round
  )
),

joined AS (
  SELECT
    pm.match_id,
    pm.season,
    pm.round_number,
    pm.match_date,
    pm.payload_home  AS home_team,
    pm.payload_away  AS away_team,

    /* scoring averages */
    COALESCE(h.avg_for,      85::numeric) AS home_points_for_avg,
    COALESCE(h.avg_against,  85::numeric) AS home_points_against_avg,
    COALESCE(a.avg_for,      85::numeric) AS away_points_for_avg,
    COALESCE(a.avg_against,  85::numeric) AS away_points_against_avg,

    COALESCE(h.last5_avg_for, h.avg_for, 85::numeric) AS home_last5_for,
    COALESCE(a.last5_avg_for, a.avg_for, 85::numeric) AS away_last5_for,

    /* offense/defense ratings vs league average */
    ROUND((COALESCE(h.avg_for, 85) - lg.lg_avg)::numeric, 2)    AS home_offense_rating,
    ROUND((COALESCE(a.avg_for, 85) - lg.lg_avg)::numeric, 2)    AS away_offense_rating,
    ROUND((lg.lg_avg - COALESCE(h.avg_against, 85))::numeric, 2) AS home_defense_rating,
    ROUND((lg.lg_avg - COALESCE(a.avg_against, 85))::numeric, 2) AS away_defense_rating,

    COALESCE(h.volatility,   0::numeric) AS home_volatility,
    COALESCE(a.volatility,   0::numeric) AS away_volatility,

    7 AS home_days_rest,
    7 AS away_days_rest,

    COALESCE(h.win_rate, 0.5) AS home_win_rate,
    COALESCE(a.win_rate, 0.5) AS away_win_rate,

    COALESCE(h.recent_form_adj, 0) AS home_momentum,
    COALESCE(a.recent_form_adj, 0) AS away_momentum,

    COALESCE(h.strength_index, 0::numeric) AS home_strength,
    COALESCE(a.strength_index, 0::numeric) AS away_strength,

    COALESCE(h.recent_form_adj, 0) AS home_form_adj,
    COALESCE(a.recent_form_adj, 0) AS away_form_adj,

    COALESCE(h.ladder_adj::numeric, 0) AS home_ladder_adj,
    COALESCE(a.ladder_adj::numeric, 0) AS away_ladder_adj

  FROM payload_matches pm
  LEFT JOIN team_strength h ON h.team = pm.home_canonical
  LEFT JOIN team_strength a ON a.team = pm.away_canonical
  CROSS JOIN league_avg lg
),

scored AS (
  SELECT
    *,

    /*
      projected_home_score =
        (home_avg_for + away_avg_against) / 2    <- base
        + 8.0                                    <- home ground bonus
        + home_form_adj                          <- recent form -8..+8
        + strength_diff * 0.5                    <- strength impact on score
    */
    ROUND(GREATEST(65, LEAST(130, (
      (home_points_for_avg + away_points_against_avg) / 2.0
      + 8.0
      + home_form_adj
      + ((home_strength - away_strength) * 0.5)
    )))::numeric, 1) AS projected_home_score,

    ROUND(GREATEST(65, LEAST(130, (
      (away_points_for_avg + home_points_against_avg) / 2.0
      + away_form_adj
      - ((home_strength - away_strength) * 0.5)
    )))::numeric, 1) AS projected_away_score,

    home_strength - away_strength AS strength_diff

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
    home_strength AS home_advantage_delta,
    NULL::numeric AS home_confidence,
    NULL::numeric AS away_confidence,

    /* win probability via logistic on strength_diff / 10 */
    ROUND(
      (1.0 / (1.0 + EXP(-(strength_diff / 10.0))))::numeric, 4
    ) AS win_probability_home,
    ROUND(
      (1.0 - 1.0 / (1.0 + EXP(-(strength_diff / 10.0))))::numeric, 4
    ) AS win_probability_away,

    /* confidence = 50 + abs(strength_diff) * 2.5  clamped 50–95 */
    ROUND(GREATEST(50, LEAST(95,
      50.0 + ABS(strength_diff) * 2.5
    ))::numeric, 1) AS model_confidence

  FROM scored
)

SELECT * FROM final;
