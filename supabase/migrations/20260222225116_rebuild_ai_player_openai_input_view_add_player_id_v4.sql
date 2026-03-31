/*
  # Rebuild v_ai_player_openai_inputs_2026_next_round — add player_id (drop + recreate)

  ## Summary
  DROP + CREATE to add player_id as a new column. Postgres does not allow prepending
  columns via CREATE OR REPLACE VIEW — drop is required. All existing columns and
  logic are preserved exactly. player_id is appended after existing columns.

  ## Changes
  - DROP VIEW afl.v_ai_player_openai_inputs_2026_next_round
  - CREATE VIEW with same columns + player_id appended at the end
  - LEFT JOIN afl.players r on player_name + team

  ## Notes
  - LEFT JOIN ensures no rows are dropped if a player is absent from afl.players
  - player_id appended (not prepended) to satisfy Postgres column-order constraint
*/

DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round;

CREATE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS SELECT p.match_id, p.round_number, p.player, p.team, p.opponent, jsonb_build_object('system', pr.system_prompt, 'user', replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(pr.user_prompt_template, '{player}'::text, COALESCE(p.player, ''::text)), '{expected}'::text, COALESCE(round(s.expected_fantasy, 1)::text, 'N/A'::text)), '{floor_fantasy}'::text, COALESCE(round(s.floor_fantasy, 1)::text, 'N/A'::text)), '{ceiling_fantasy}'::text, COALESCE(round(s.ceiling_fantasy, 1)::text, 'N/A'::text)), '{season_avg}'::text, COALESCE(round(s.season_avg, 1)::text, 'N/A'::text)), '{last_3_avg}'::text, COALESCE(round(s.last_3_avg, 1)::text, 'N/A'::text)), '{last_5_avg}'::text, COALESCE(round(s.last_5_avg, 1)::text, 'N/A'::text)), '{volatility}'::text, COALESCE(round(s.volatility, 2)::text, 'N/A'::text)), '{risk_tier}'::text, COALESCE(s.risk_tier, 'N/A'::text)), '{consistency_score}'::text, COALESCE(s.consistency_score::text, 'N/A'::text)), '{matchup_delta}'::text, COALESCE(round(s.matchup_delta, 2)::text, 'N/A'::text)), '{matchup_label}'::text, COALESCE(s.matchup_label, 'N/A'::text)), '{prob_100_plus}'::text, COALESCE(round(s.prob_100_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{prob_120_plus}'::text, COALESCE(round(s.prob_120_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{prob_140_plus}'::text, COALESCE(round(s.prob_140_plus * 100::numeric, 1)::text || '%'::text, 'N/A'::text)), '{games_played}'::text, COALESCE(s.games_played::text, 'N/A'::text)), '{trend_direction}'::text, COALESCE(s.trend_direction, 'N/A'::text)), 'payload', p.payload) AS final_openai_input, r.player_id FROM afl.v_ai_player_payloads_2026_next_round p JOIN afl.ai_prompts pr ON pr.prompt_key = 'player_round_summary'::text AND pr.is_active = true LEFT JOIN afl.v_ai_player_summary_input_2026 s ON s.player = p.player AND s.team = p.team LEFT JOIN afl.players r ON r.player_name = p.player AND r.team = p.team;
