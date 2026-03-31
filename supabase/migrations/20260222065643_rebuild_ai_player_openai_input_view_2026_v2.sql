
/*
  # Rebuild v_ai_player_openai_inputs_2026_next_round (drop and recreate)

  ## Summary
  Drops and recreates the player OpenAI input view with full placeholder substitution.
  The existing view had an incompatible column signature (missing round_number, team, opponent).

  ## New column set
  - match_id
  - round_number
  - player
  - team
  - opponent
  - final_openai_input (jsonb): { system, user, payload }

  ## Source joins
  - afl.v_ai_player_payloads_2026_next_round  →  match/player context + payload
  - afl.v_ai_player_summary_input_2026        →  all stat fields for placeholder substitution
  - afl.ai_prompts (prompt_key = player_round_summary, is_active = true)  →  prompt templates

  ## All placeholders substituted
  {player}, {expected}, {floor_fantasy}, {ceiling_fantasy},
  {season_avg}, {last_3_avg}, {last_5_avg}, {volatility},
  {risk_tier}, {consistency_score}, {matchup_delta}, {matchup_label},
  {prob_100_plus}, {prob_120_plus}, {prob_140_plus},
  {games_played}, {trend_direction}
*/

DROP VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round;

CREATE VIEW afl.v_ai_player_openai_inputs_2026_next_round AS
SELECT
  p.match_id,
  p.round_number,
  p.player,
  p.team,
  p.opponent,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user', REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(
                              REPLACE(
                                REPLACE(
                                  REPLACE(
                                    REPLACE(
                                      REPLACE(
                                        REPLACE(
                                          REPLACE(
                                            REPLACE(
                                              pr.user_prompt_template,
                                              '{player}',           COALESCE(p.player, '')
                                            ),
                                            '{expected}',           COALESCE(ROUND(s.expected_fantasy::numeric, 1)::text, 'N/A')
                                          ),
                                          '{floor_fantasy}',        COALESCE(ROUND(s.floor_fantasy::numeric, 1)::text, 'N/A')
                                        ),
                                        '{ceiling_fantasy}',        COALESCE(ROUND(s.ceiling_fantasy::numeric, 1)::text, 'N/A')
                                      ),
                                      '{season_avg}',               COALESCE(ROUND(s.season_avg::numeric, 1)::text, 'N/A')
                                    ),
                                    '{last_3_avg}',                 COALESCE(ROUND(s.last_3_avg::numeric, 1)::text, 'N/A')
                                  ),
                                  '{last_5_avg}',                   COALESCE(ROUND(s.last_5_avg::numeric, 1)::text, 'N/A')
                                ),
                                '{volatility}',                     COALESCE(ROUND(s.volatility::numeric, 2)::text, 'N/A')
                              ),
                              '{risk_tier}',                        COALESCE(s.risk_tier, 'N/A')
                            ),
                            '{consistency_score}',                  COALESCE(s.consistency_score::text, 'N/A')
                          ),
                          '{matchup_delta}',                        COALESCE(ROUND(s.matchup_delta::numeric, 2)::text, 'N/A')
                        ),
                        '{matchup_label}',                          COALESCE(s.matchup_label, 'N/A')
                      ),
                      '{prob_100_plus}',                            COALESCE(ROUND(s.prob_100_plus::numeric * 100, 1)::text || '%', 'N/A')
                    ),
                    '{prob_120_plus}',                              COALESCE(ROUND(s.prob_120_plus::numeric * 100, 1)::text || '%', 'N/A')
                  ),
                  '{prob_140_plus}',                                COALESCE(ROUND(s.prob_140_plus::numeric * 100, 1)::text || '%', 'N/A')
                ),
                '{games_played}',                                   COALESCE(s.games_played::text, 'N/A')
              ),
              '{trend_direction}',                                  COALESCE(s.trend_direction, 'N/A')
            ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_player_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'player_round_summary'
 AND pr.is_active = true
LEFT JOIN afl.v_ai_player_summary_input_2026 s
  ON s.player = p.player
 AND s.team   = p.team;
