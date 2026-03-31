/*
  # Fix Match Prediction — Name Normalisation + Round Filter + Type Fix

  ## Summary
  - Drops and recreates v_match_prediction_features_true_game to fix:
    1. Team name mismatch (short vs full names) via a name_map lookup
    2. match_date type conflict (timestamptz vs timestamp)
    3. Pulls directly from payload matches rather than features-based join
  - Rebuilds v_ai_match_openai_inputs_2026_next_round without round = 0 restriction

  ## Data Safety
  No tables are dropped or modified. Only views are recreated.
*/

-- Drop dependent view first, then feature view
DROP VIEW IF EXISTS afl.v_ai_match_openai_inputs_2026_next_round;
DROP VIEW IF EXISTS afl.v_match_prediction_features_true_game;


-- =========================================================
-- 1. Rebuild true game features view with name normalisation
-- =========================================================
CREATE VIEW afl.v_match_prediction_features_true_game AS
WITH name_map (short_name, full_name) AS (
  VALUES
    ('Adelaide',                     'Adelaide Crows'),
    ('Adelaide Crows',               'Adelaide Crows'),
    ('Brisbane',                     'Brisbane Lions'),
    ('Brisbane Lions',               'Brisbane Lions'),
    ('Carlton',                      'Carlton Blues'),
    ('Carlton Blues',                'Carlton Blues'),
    ('Collingwood',                  'Collingwood Magpies'),
    ('Collingwood Magpies',          'Collingwood Magpies'),
    ('Essendon',                     'Essendon Bombers'),
    ('Essendon Bombers',             'Essendon Bombers'),
    ('Fremantle',                    'Fremantle Dockers'),
    ('Fremantle Dockers',            'Fremantle Dockers'),
    ('Geelong',                      'Geelong Cats'),
    ('Geelong Cats',                 'Geelong Cats'),
    ('Gold Coast',                   'Gold Coast Suns'),
    ('Gold Coast Suns',              'Gold Coast Suns'),
    ('GWS',                          'Greater Western Sydney Giants'),
    ('Greater Western Sydney',       'Greater Western Sydney Giants'),
    ('Greater Western Sydney Giants','Greater Western Sydney Giants'),
    ('Hawthorn',                     'Hawthorn Hawks'),
    ('Hawthorn Hawks',               'Hawthorn Hawks'),
    ('Melbourne',                    'Melbourne Demons'),
    ('Melbourne Demons',             'Melbourne Demons'),
    ('North Melbourne',              'North Melbourne Kangaroos'),
    ('North Melbourne Kangaroos',    'North Melbourne Kangaroos'),
    ('Port Adelaide',                'Port Adelaide Power'),
    ('Port Adelaide Power',          'Port Adelaide Power'),
    ('Richmond',                     'Richmond Tigers'),
    ('Richmond Tigers',              'Richmond Tigers'),
    ('St Kilda',                     'St Kilda Saints'),
    ('St Kilda Saints',              'St Kilda Saints'),
    ('Sydney',                       'Sydney Swans'),
    ('Sydney Swans',                 'Sydney Swans'),
    ('West Coast',                   'West Coast Eagles'),
    ('West Coast Eagles',            'West Coast Eagles'),
    ('Western Bulldogs',             'Western Bulldogs')
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
    p.home_team                                AS payload_home,
    p.away_team                                AS payload_away,
    COALESCE(nh.full_name, p.home_team)       AS home_full,
    COALESCE(na.full_name, p.away_team)       AS away_full
  FROM afl.v_ai_match_payloads_2026_next_round p
  LEFT JOIN name_map nh ON nh.short_name = p.home_team
  LEFT JOIN name_map na ON na.short_name = p.away_team
),
joined AS (
  SELECT
    pm.match_id,
    pm.season,
    pm.round_number,
    pm.match_date,
    pm.payload_home                                  AS home_team,
    pm.payload_away                                  AS away_team,
    COALESCE(h.season_avg_for, 85)                  AS home_points_for_avg,
    COALESCE(h.season_avg_against, 85)              AS home_points_against_avg,
    COALESCE(a.season_avg_for, 85)                  AS away_points_for_avg,
    COALESCE(a.season_avg_against, 85)              AS away_points_against_avg,
    COALESCE(h.last_5_avg_for, h.season_avg_for, 85) AS home_last5_for,
    COALESCE(a.last_5_avg_for, a.season_avg_for, 85) AS away_last5_for,
    ROUND((COALESCE(h.season_avg_for, 85) - lg.lg_avg_for)::numeric, 2)         AS home_offense_rating,
    ROUND((COALESCE(a.season_avg_for, 85) - lg.lg_avg_for)::numeric, 2)         AS away_offense_rating,
    ROUND((lg.lg_avg_against - COALESCE(h.season_avg_against, 85))::numeric, 2) AS home_defense_rating,
    ROUND((lg.lg_avg_against - COALESCE(a.season_avg_against, 85))::numeric, 2) AS away_defense_rating,
    COALESCE(h.volatility_last_5, 0)                AS home_volatility,
    COALESCE(a.volatility_last_5, 0)                AS away_volatility,
    COALESCE(h.rest_days, 7)                        AS home_days_rest,
    COALESCE(a.rest_days, 7)                        AS away_days_rest,
    h.win_rate_season                               AS home_win_rate,
    a.win_rate_season                               AS away_win_rate,
    h.momentum_score                                AS home_momentum,
    a.momentum_score                                AS away_momentum,
    h.home_advantage_delta,
    h.confidence_score                              AS home_confidence,
    a.confidence_score                              AS away_confidence
  FROM payload_matches pm
  LEFT JOIN team_season_stats h ON h.team = pm.home_full
  LEFT JOIN team_season_stats a ON a.team = pm.away_full
  CROSS JOIN league_avg lg
),
scored AS (
  SELECT
    *,
    ROUND((
      (home_points_for_avg + away_points_against_avg) / 2.0
      + 3.0
      + home_offense_rating * 0.15
      + home_defense_rating * 0.10
    )::numeric, 1) AS projected_home_score,
    ROUND((
      (away_points_for_avg + home_points_against_avg) / 2.0
      + away_offense_rating * 0.15
      + away_defense_rating * 0.10
    )::numeric, 1) AS projected_away_score
  FROM joined
)
SELECT
  match_id, season, round_number, match_date, home_team, away_team,
  projected_home_score,
  projected_away_score,
  ROUND((projected_home_score - projected_away_score)::numeric, 1) AS projected_margin,
  home_points_for_avg, home_points_against_avg,
  away_points_for_avg, away_points_against_avg,
  home_last5_for, away_last5_for,
  home_offense_rating, away_offense_rating,
  home_defense_rating, away_defense_rating,
  home_volatility, away_volatility,
  home_days_rest, away_days_rest,
  TRUE::boolean AS is_home_game,
  home_win_rate, away_win_rate,
  home_momentum, away_momentum,
  home_advantage_delta, home_confidence, away_confidence,
  ROUND((1.0 / (1.0 + EXP(-(projected_home_score - projected_away_score) / 15.0)))::numeric, 4) AS win_probability_home,
  ROUND((1.0 - 1.0 / (1.0 + EXP(-(projected_home_score - projected_away_score) / 15.0)))::numeric, 4) AS win_probability_away,
  ROUND(LEAST(95, GREATEST(50,
    65
    + ABS(projected_home_score - projected_away_score) * 0.5
    - (home_volatility + away_volatility) / 4.0
    + ABS(COALESCE(home_win_rate, 0.5) - COALESCE(away_win_rate, 0.5)) * 20
  ))::numeric, 1) AS model_confidence
FROM scored;


-- =========================================================
-- 2. Rebuild input view — all upcoming rounds
-- =========================================================
CREATE VIEW afl.v_ai_match_openai_inputs_2026_next_round AS
WITH base AS (
  SELECT
    g.season, g.round_number, g.match_id, g.home_team, g.away_team,
    pr.system_prompt,
    pr.user_prompt_template,
    COALESCE(raw.payload->'match'->>'venue', 'N/A')       AS venue,
    g.home_points_for_avg, g.home_points_against_avg,
    g.away_points_for_avg, g.away_points_against_avg,
    g.home_last5_for, g.away_last5_for,
    g.home_offense_rating, g.away_offense_rating,
    g.home_defense_rating, g.away_defense_rating,
    g.home_volatility, g.away_volatility,
    g.home_days_rest, g.away_days_rest,
    g.home_win_rate, g.away_win_rate,
    g.home_momentum, g.away_momentum,
    g.projected_home_score, g.projected_away_score,
    g.projected_margin,
    g.win_probability_home, g.win_probability_away,
    g.model_confidence,
    g.home_confidence, g.away_confidence
  FROM afl.v_match_prediction_features_true_game g
  LEFT JOIN afl.v_ai_match_payloads_2026_next_round raw ON raw.match_id = g.match_id
  JOIN afl.ai_prompts pr ON pr.prompt_key = 'match_prediction' AND pr.is_active = true
),
r1  AS (SELECT *, replace(user_prompt_template, '{{home_team}}', home_team) AS p FROM base),
r2  AS (SELECT *, replace(p, '{{away_team}}', away_team) AS p2 FROM r1),
r3  AS (SELECT *, replace(p2, '{{venue}}', venue) AS p3 FROM r2),
r4  AS (SELECT *, replace(p3, '{{home_points_for_avg}}',     ROUND(home_points_for_avg::numeric,1)::text) AS p4 FROM r3),
r5  AS (SELECT *, replace(p4, '{{home_points_against_avg}}', ROUND(home_points_against_avg::numeric,1)::text) AS p5 FROM r4),
r6  AS (SELECT *, replace(p5, '{{away_points_for_avg}}',     ROUND(away_points_for_avg::numeric,1)::text) AS p6 FROM r5),
r7  AS (SELECT *, replace(p6, '{{away_points_against_avg}}', ROUND(away_points_against_avg::numeric,1)::text) AS p7 FROM r6),
r8  AS (SELECT *, replace(p7, '{{home_last5_avg}}',          ROUND(home_last5_for::numeric,1)::text) AS p8 FROM r7),
r9  AS (SELECT *, replace(p8, '{{away_last5_avg}}',          ROUND(away_last5_for::numeric,1)::text) AS p9 FROM r8),
r10 AS (SELECT *, replace(p9,  '{{home_offense_rating}}',    ROUND(home_offense_rating::numeric,1)::text) AS p10 FROM r9),
r11 AS (SELECT *, replace(p10, '{{away_offense_rating}}',    ROUND(away_offense_rating::numeric,1)::text) AS p11 FROM r10),
r12 AS (SELECT *, replace(p11, '{{home_defense_rating}}',    ROUND(home_defense_rating::numeric,1)::text) AS p12 FROM r11),
r13 AS (SELECT *, replace(p12, '{{away_defense_rating}}',    ROUND(away_defense_rating::numeric,1)::text) AS p13 FROM r12),
r14 AS (SELECT *, replace(p13, '{{home_volatility}}',        ROUND(home_volatility::numeric,1)::text) AS p14 FROM r13),
r15 AS (SELECT *, replace(p14, '{{away_volatility}}',        ROUND(away_volatility::numeric,1)::text) AS p15 FROM r14),
r16 AS (SELECT *, replace(p15, '{{home_days_rest}}',         home_days_rest::text) AS p16 FROM r15),
r17 AS (SELECT *, replace(p16, '{{away_days_rest}}',         away_days_rest::text) AS p17 FROM r16),
r18 AS (SELECT *, replace(p17, '{{home_win_rate}}',          ROUND((COALESCE(home_win_rate,0.5)*100)::numeric,0)::text) AS p18 FROM r17),
r19 AS (SELECT *, replace(p18, '{{away_win_rate}}',          ROUND((COALESCE(away_win_rate,0.5)*100)::numeric,0)::text) AS p19 FROM r18),
r20 AS (SELECT *, replace(p19, '{{home_projected_score}}',   projected_home_score::text) AS p20 FROM r19),
r21 AS (SELECT *, replace(p20, '{{away_projected_score}}',   projected_away_score::text) AS p21 FROM r20),
r22 AS (SELECT *, replace(p21, '{{projected_margin}}',       projected_margin::text) AS p22 FROM r21),
r23 AS (SELECT *, replace(p22, '{{win_probability_home}}',   ROUND((win_probability_home*100)::numeric,0)::text) AS p23 FROM r22),
r24 AS (SELECT *, replace(p23, '{{win_probability_away}}',   ROUND((win_probability_away*100)::numeric,0)::text) AS p24 FROM r23),
r25 AS (SELECT *, replace(p24, '{{model_confidence}}',       model_confidence::text) AS p25 FROM r24),
r26 AS (SELECT *, replace(p25, '{{home_momentum}}',          ROUND(COALESCE(home_momentum,0)::numeric,1)::text) AS p26 FROM r25),
resolved AS (SELECT *, replace(p26, '{{away_momentum}}',     ROUND(COALESCE(away_momentum,0)::numeric,1)::text) AS resolved_prompt FROM r26)
SELECT
  season, round_number, match_id, home_team, away_team,
  jsonb_build_object(
    'system',  system_prompt,
    'user',    resolved_prompt,
    'payload', jsonb_build_object(
      'match', jsonb_build_object('match_id', match_id, 'round', round_number, 'season', season, 'venue', venue),
      'home_team', jsonb_build_object(
        'name', home_team, 'is_home', true,
        'points_for_avg', home_points_for_avg, 'points_against_avg', home_points_against_avg,
        'offense_rating', home_offense_rating, 'defense_rating', home_defense_rating,
        'volatility', home_volatility, 'days_rest', home_days_rest,
        'win_rate', home_win_rate, 'momentum', home_momentum,
        'projected_score', projected_home_score, 'confidence', home_confidence
      ),
      'away_team', jsonb_build_object(
        'name', away_team, 'is_home', false,
        'points_for_avg', away_points_for_avg, 'points_against_avg', away_points_against_avg,
        'offense_rating', away_offense_rating, 'defense_rating', away_defense_rating,
        'volatility', away_volatility, 'days_rest', away_days_rest,
        'win_rate', away_win_rate, 'momentum', away_momentum,
        'projected_score', projected_away_score, 'confidence', away_confidence
      ),
      'predictions', jsonb_build_object(
        'home_score', projected_home_score, 'away_score', projected_away_score,
        'margin', projected_margin,
        'total', ROUND((projected_home_score + projected_away_score)::numeric, 1),
        'favourite', CASE WHEN projected_home_score >= projected_away_score THEN home_team ELSE away_team END,
        'win_probability_home', win_probability_home, 'win_probability_away', win_probability_away,
        'model_confidence', model_confidence
      )
    )
  ) AS final_openai_input
FROM resolved;
