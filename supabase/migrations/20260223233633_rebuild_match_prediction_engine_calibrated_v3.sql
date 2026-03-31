/*
  # Rebuild Match Prediction Engine — Calibrated v3

  ## Summary
  Replaces the calculation logic inside v_match_prediction_features_true_game
  using CREATE OR REPLACE VIEW to preserve dependent objects (v_ai_match_openai_inputs_2026_next_round).
  No tables, column names, or schema are changed.

  ## Changes to scoring formula
  - Weighted blend: team_avg_for * 0.55 + opp_avg_against * 0.45 (was simple average)
  - Home ground bonus: +8 for home (unchanged)
  - Recent form range expanded: -10..+10 (was -8..+8)
  - Strength adjustment multiplier: 0.35 (was 0.50, which over-compressed scores)

  ## Changes to strength index
  - Bottom 4 ladder penalty: -8 (was -6)
  - recent_form_adj range: -10..+10 (was -8..+8)
  - All other weights unchanged

  ## Changes to confidence
  - Floor: 55 (was 50)
  - Multiplier: 3.0 per strength_diff unit (was 2.5)
  - Ceiling: 95 (unchanged)

  ## Win probability
  - Logistic formula unchanged: 1 / (1 + exp(-strength_diff / 10))

  ## Expected output ranges
  - Weak team: 65–80 pts
  - Average team: 80–95 pts
  - Strong team: 95–115 pts
  - Dominant favourite win prob: 70–85%
  - Moderate favourite win prob: 60–70%
  - Even match win prob: 45–55%
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

season_stats AS (
  SELECT
    team,
    count(*)                          AS games_played,
    round(avg(points_for), 2)         AS avg_for,
    round(avg(points_against), 2)     AS avg_against,
    sum(win::integer)                 AS wins
  FROM afl.team_match_results
  WHERE season = 2025
  GROUP BY team
),

last5 AS (
  SELECT
    sub.team,
    round(avg(sub.points_for), 2)    AS last5_avg_for,
    round(stddev(sub.points_for), 2) AS volatility
  FROM (
    SELECT
      team, points_for,
      row_number() OVER (PARTITION BY team ORDER BY match_date DESC, id DESC) AS rn
    FROM afl.team_match_results
    WHERE season = 2025
  ) sub
  WHERE sub.rn <= 5
  GROUP BY sub.team
),

ladder AS (
  SELECT team, "position"
  FROM afl.v_ladder_2025
  WHERE season = 2025
),

team_strength AS (
  SELECT
    s.team,
    s.games_played,
    s.avg_for,
    s.avg_against,
    s.wins,
    round(s.wins::numeric / NULLIF(s.games_played, 0)::numeric, 3) AS win_rate,
    l5.last5_avg_for,
    l5.volatility,
    ld."position" AS ladder_position,

    -- Recent form adjustment: expanded range -10..+10
    round(
      GREATEST(-10::numeric, LEAST(10::numeric, (l5.last5_avg_for - s.avg_for) * 0.35)),
      2
    ) AS recent_form_adj,

    -- Ladder adjustment: bottom 4 penalty -8 (was -6)
    CASE
      WHEN ld."position" <= 4  THEN 12
      WHEN ld."position" <= 8  THEN 6
      WHEN ld."position" >= 15 THEN -8
      ELSE 0
    END AS ladder_adj,

    -- Strength index: avg_for * 0.7 - avg_against * 0.5 + ladder_adj + recent_form_adj
    round(
      s.avg_for * 0.7
      - s.avg_against * 0.5
      + CASE
          WHEN ld."position" <= 4  THEN 12
          WHEN ld."position" <= 8  THEN 6
          WHEN ld."position" >= 15 THEN -8
          ELSE 0
        END::numeric
      + GREATEST(-10::numeric, LEAST(10::numeric, (l5.last5_avg_for - s.avg_for) * 0.35)),
      2
    ) AS strength_index

  FROM season_stats s
  LEFT JOIN last5 l5 ON l5.team = s.team
  LEFT JOIN ladder ld ON ld.team = s.team
),

league_avg AS (
  SELECT round(avg(avg_for), 2) AS lg_avg
  FROM team_strength
),

payload_matches AS (
  SELECT
    p.match_id,
    p.season,
    p.round_number,
    p.match_date::timestamp without time zone AS match_date,
    p.home_team                              AS payload_home,
    p.away_team                              AS payload_away,
    COALESCE(nh.canonical, p.home_team)      AS home_canonical,
    COALESCE(na.canonical, p.away_team)      AS away_canonical
  FROM afl.v_ai_match_payloads_2026_next_round p
  LEFT JOIN name_map nh ON nh.raw_name = p.home_team
  LEFT JOIN name_map na ON na.raw_name = p.away_team
  WHERE p.round_number = (
    SELECT min(round_number) FROM afl.v_ai_match_payloads_2026_next_round
  )
),

joined AS (
  SELECT
    pm.match_id,
    pm.season,
    pm.round_number,
    pm.match_date,
    pm.payload_home                                    AS home_team,
    pm.payload_away                                    AS away_team,
    COALESCE(h.avg_for,        85::numeric)            AS home_points_for_avg,
    COALESCE(h.avg_against,    85::numeric)            AS home_points_against_avg,
    COALESCE(a.avg_for,        85::numeric)            AS away_points_for_avg,
    COALESCE(a.avg_against,    85::numeric)            AS away_points_against_avg,
    COALESCE(h.last5_avg_for,  h.avg_for, 85::numeric) AS home_last5_for,
    COALESCE(a.last5_avg_for,  a.avg_for, 85::numeric) AS away_last5_for,
    round(COALESCE(h.avg_for,  85::numeric) - lg.lg_avg, 2) AS home_offense_rating,
    round(COALESCE(a.avg_for,  85::numeric) - lg.lg_avg, 2) AS away_offense_rating,
    round(lg.lg_avg - COALESCE(h.avg_against, 85::numeric), 2) AS home_defense_rating,
    round(lg.lg_avg - COALESCE(a.avg_against, 85::numeric), 2) AS away_defense_rating,
    COALESCE(h.volatility,     0::numeric)             AS home_volatility,
    COALESCE(a.volatility,     0::numeric)             AS away_volatility,
    7                                                  AS home_days_rest,
    7                                                  AS away_days_rest,
    COALESCE(h.win_rate,       0.5)                    AS home_win_rate,
    COALESCE(a.win_rate,       0.5)                    AS away_win_rate,
    COALESCE(h.recent_form_adj, 0::numeric)            AS home_momentum,
    COALESCE(a.recent_form_adj, 0::numeric)            AS away_momentum,
    COALESCE(h.strength_index,  0::numeric)            AS home_strength,
    COALESCE(a.strength_index,  0::numeric)            AS away_strength,
    COALESCE(h.recent_form_adj, 0::numeric)            AS home_form_adj,
    COALESCE(a.recent_form_adj, 0::numeric)            AS away_form_adj,
    COALESCE(h.ladder_adj::numeric, 0::numeric)        AS home_ladder_adj,
    COALESCE(a.ladder_adj::numeric, 0::numeric)        AS away_ladder_adj
  FROM payload_matches pm
  LEFT JOIN team_strength h ON h.team = pm.home_canonical
  LEFT JOIN team_strength a ON a.team = pm.away_canonical
  CROSS JOIN league_avg lg
),

scored AS (
  SELECT
    joined.*,

    -- Calibrated projected home score:
    --   team_avg_for * 0.55 + opp_avg_against * 0.45 + home_bonus(+8) + form_adj + strength_adj(0.35)
    round(
      GREATEST(65::numeric, LEAST(130::numeric,
        joined.home_points_for_avg     * 0.55
        + joined.away_points_against_avg * 0.45
        + 8.0
        + joined.home_form_adj
        + (joined.home_strength - joined.away_strength) * 0.35
      )), 1
    ) AS projected_home_score,

    -- Calibrated projected away score:
    --   team_avg_for * 0.55 + opp_avg_against * 0.45 + form_adj - strength_adj(0.35)
    round(
      GREATEST(65::numeric, LEAST(130::numeric,
        joined.away_points_for_avg     * 0.55
        + joined.home_points_against_avg * 0.45
        + joined.away_form_adj
        - (joined.home_strength - joined.away_strength) * 0.35
      )), 1
    ) AS projected_away_score,

    joined.home_strength - joined.away_strength AS strength_diff

  FROM joined
),

final AS (
  SELECT
    scored.match_id,
    scored.season,
    scored.round_number,
    scored.match_date,
    scored.home_team,
    scored.away_team,
    scored.projected_home_score,
    scored.projected_away_score,
    round(scored.projected_home_score - scored.projected_away_score, 1) AS projected_margin,
    scored.home_points_for_avg,
    scored.home_points_against_avg,
    scored.away_points_for_avg,
    scored.away_points_against_avg,
    scored.home_last5_for,
    scored.away_last5_for,
    scored.home_offense_rating,
    scored.away_offense_rating,
    scored.home_defense_rating,
    scored.away_defense_rating,
    scored.home_volatility,
    scored.away_volatility,
    scored.home_days_rest,
    scored.away_days_rest,
    true                           AS is_home_game,
    scored.home_win_rate,
    scored.away_win_rate,
    scored.home_momentum,
    scored.away_momentum,
    scored.home_strength           AS home_advantage_delta,
    NULL::numeric                  AS home_confidence,
    NULL::numeric                  AS away_confidence,

    -- Logistic win probability: 1 / (1 + exp(-strength_diff / 10))
    round(1.0 / (1.0 + exp(-(scored.strength_diff / 10.0))), 4) AS win_probability_home,
    round(1.0 - 1.0 / (1.0 + exp(-(scored.strength_diff / 10.0))), 4) AS win_probability_away,

    -- Calibrated confidence: 55 + abs(strength_diff) * 3, clamped 55–95
    round(GREATEST(55::numeric, LEAST(95::numeric, 55.0 + abs(scored.strength_diff) * 3.0)), 1) AS model_confidence

  FROM scored
)

SELECT
  match_id, season, round_number, match_date,
  home_team, away_team,
  projected_home_score, projected_away_score, projected_margin,
  home_points_for_avg, home_points_against_avg,
  away_points_for_avg, away_points_against_avg,
  home_last5_for, away_last5_for,
  home_offense_rating, away_offense_rating,
  home_defense_rating, away_defense_rating,
  home_volatility, away_volatility,
  home_days_rest, away_days_rest,
  is_home_game,
  home_win_rate, away_win_rate,
  home_momentum, away_momentum,
  home_advantage_delta,
  home_confidence, away_confidence,
  win_probability_home, win_probability_away,
  model_confidence
FROM final;
