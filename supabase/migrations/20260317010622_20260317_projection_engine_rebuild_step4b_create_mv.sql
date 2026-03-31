
/*
  # Projection Engine Rebuild — Step 4b: Create afl.mv_player_projection

  Materialized view joining player_projection (calculated scores) with
  identity, form, matchup, venue, rest, price and next-game data.
  All joins use player_id. No player_name joins.
*/

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH agg_matchup AS (
  SELECT player_id,
    round(avg(matchup_rating), 1) AS matchup_rating,
    round(avg(opponent_rank_vs_position))::integer AS opponent_rank_vs_position
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT player_id,
    round(avg(venue_multiplier), 4) AS venue_multiplier,
    round(avg(home_advantage), 4)   AS home_advantage
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id, rest_days, short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group AS position,
  fp.price,
  ng.game_date,
  COALESCE(ng.venue, '') AS venue,
  opp_t.team_name AS opponent_name,
  CASE WHEN ng.home_team_id = cpt.team_id THEN true ELSE false END AS is_home,
  pp.projection_final AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating AS risk,
  pp.projection_confidence AS confidence,
  pp.consistency_score AS consistency,
  fp.value_score,
  round(
    pp.projection_final * 0.40
    + pp.projection_confidence * 0.25
    + pp.consistency_score * 0.20
    + COALESCE(fp.value_score, 50.0) * 0.15,
    1
  ) AS neeko_rating,
  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,
  am.matchup_rating,
  am.opponent_rank_vs_position,
  av.venue_multiplier,
  av.home_advantage,
  lr.rest_days,
  lr.short_turnaround_flag,
  pp.generated_at AS updated_at
FROM afl.player_projection pp
JOIN afl.players p ON p.player_id = pp.player_id
JOIN afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price fp ON fp.player_id = pp.player_id
LEFT JOIN agg_matchup am ON am.player_id = pp.player_id
LEFT JOIN agg_venue av ON av.player_id = pp.player_id
LEFT JOIN latest_rest lr ON lr.player_id = pp.player_id
LEFT JOIN afl.v_next_games ng ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t ON opp_t.team_id = CASE
  WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
  ELSE ng.home_team_id
END
ORDER BY neeko_rating DESC NULLS LAST;

CREATE UNIQUE INDEX mv_player_projection_player_id_idx
  ON afl.mv_player_projection (player_id);
