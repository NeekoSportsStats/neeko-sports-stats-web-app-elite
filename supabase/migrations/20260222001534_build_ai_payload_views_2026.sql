/*
  # Section 4 — AI Payload Views

  Three JSONB payload views ready for Edge Function consumption:

  1. afl.v_ai_player_payloads_2026_next_round
     One row per player per next-round match — full player AI feature payload.

  2. afl.v_ai_team_payloads_2026_next_round
     One row per team per next-round match — full team AI feature payload.

  3. afl.v_ai_match_payloads_2026_next_round
     Already exists — recreated here to stay in sync with new views.
     One row per match — combined home/away predictions.
*/

-- 1. Player payloads
CREATE OR REPLACE VIEW afl.v_ai_player_payloads_2026_next_round AS
SELECT
  p.match_id,
  p.match_date,
  p.round_number,
  p.player,
  p.team,
  p.opponent,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',    p.match_id,
      'match_date',  p.match_date,
      'round',       p.round_number,
      'venue',       p.venue,
      'is_home',     p.is_home
    ),
    'player', jsonb_build_object(
      'name',     p.player,
      'team',     p.team,
      'opponent', p.opponent,
      'position', p.position
    ),
    'form', jsonb_build_object(
      'season_avg',    p.season_avg,
      'last_5_avg',    p.last_5_avg,
      'last_10_avg',   p.last_10_avg,
      'weighted_form', p.weighted_form,
      'momentum',      p.momentum
    ),
    'volatility', jsonb_build_object(
      'stdev',    p.stdev_last_10,
      'floor',    p.floor_p10,
      'ceiling',  p.ceiling_p90
    ),
    'role', jsonb_build_object(
      'avg_time_on_ground', p.avg_time_on_ground,
      'consistency_score',  p.consistency_score,
      'games_available',    p.games_available
    ),
    'opponent_context', jsonb_build_object(
      'avg_allowed',    p.opponent_avg_allowed,
      'matchup_delta',  p.opponent_matchup_delta
    ),
    'rest', jsonb_build_object(
      'days_rest',             p.days_rest,
      'quick_turnaround',      p.quick_turnaround_flag
    ),
    'prediction', jsonb_build_object(
      'predicted_score',   p.predicted_score,
      'predicted_change',  p.predicted_change,
      'confidence',        p.confidence_bucket
    )
  ) AS payload
FROM afl.v_ai_player_features_2026 p;


-- 2. Team payloads
CREATE OR REPLACE VIEW afl.v_ai_team_payloads_2026_next_round AS
SELECT
  t.match_id,
  t.match_date,
  t.round_number,
  t.team,
  t.opponent,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',   t.match_id,
      'match_date', t.match_date,
      'round',      t.round_number,
      'venue',      t.venue,
      'is_home',    t.is_home
    ),
    'team', jsonb_build_object(
      'name',     t.team,
      'opponent', t.opponent,
      'is_home',  t.is_home
    ),
    'form', jsonb_build_object(
      'season_avg',    t.season_avg,
      'last_5_avg',    t.last_5_avg,
      'last_10_avg',   t.last_10_avg,
      'weighted_form', t.weighted_form,
      'momentum',      t.momentum
    ),
    'defense', jsonb_build_object(
      'avg_allowed_last_5',  t.avg_allowed_last_5,
      'avg_allowed_season',  t.avg_allowed_season
    ),
    'volatility', jsonb_build_object(
      'stdev',    t.stdev_last_10,
      'floor',    t.floor,
      'ceiling',  t.ceiling
    ),
    'rest', jsonb_build_object(
      'days_rest',        t.days_rest,
      'quick_turnaround', t.quick_turnaround_flag
    ),
    'context', jsonb_build_object(
      'home_ground_advantage', t.home_ground_advantage,
      'sample_size',           t.sample_size_used,
      'games_available',       t.total_games_available
    ),
    'prediction', jsonb_build_object(
      'predicted_score',   t.predicted_score,
      'predicted_margin',  t.predicted_margin,
      'confidence',        t.confidence_bucket
    )
  ) AS payload
FROM afl.v_ai_team_features_2026_next_round t;


-- 3. Match payloads (rebuild from new match features view)
CREATE OR REPLACE VIEW afl.v_ai_match_payloads_2026_next_round AS
SELECT
  m.season,
  m.round_number,
  m.match_id,
  m.match_date,
  m.venue,
  m.home_team,
  m.away_team,
  m.predicted_home_score,
  m.predicted_away_score,
  m.predicted_total,
  m.predicted_margin,
  jsonb_build_object(
    'match', jsonb_build_object(
      'match_id',   m.match_id,
      'match_date', m.match_date,
      'round',      m.round_number,
      'venue',      m.venue
    ),
    'home_team', jsonb_build_object(
      'name',                  m.home_team,
      'predicted_score',       m.predicted_home_score,
      'confidence',            m.confidence_home,
      'days_rest',             m.home_days_rest,
      'home_ground_advantage', m.home_ground_advantage,
      'form',                  ht.weighted_form,
      'momentum',              ht.momentum,
      'defense',               ht.avg_allowed_season,
      'volatility',            ht.stdev_last_10
    ),
    'away_team', jsonb_build_object(
      'name',            m.away_team,
      'predicted_score', m.predicted_away_score,
      'confidence',      m.confidence_away,
      'days_rest',       m.away_days_rest,
      'form',            at.weighted_form,
      'momentum',        at.momentum,
      'defense',         at.avg_allowed_season,
      'volatility',      at.stdev_last_10
    ),
    'predictions', jsonb_build_object(
      'home_score',  m.predicted_home_score,
      'away_score',  m.predicted_away_score,
      'margin',      m.predicted_margin,
      'total',       m.predicted_total,
      'favourite',   CASE WHEN m.predicted_margin >= 0 THEN m.home_team ELSE m.away_team END
    )
  ) AS payload
FROM afl.v_ai_match_features_2026_next_round m
LEFT JOIN afl.v_ai_team_features_2026_next_round ht
  ON ht.match_id = m.match_id AND ht.is_home = TRUE
LEFT JOIN afl.v_ai_team_features_2026_next_round at
  ON at.match_id = m.match_id AND at.is_home = FALSE;
