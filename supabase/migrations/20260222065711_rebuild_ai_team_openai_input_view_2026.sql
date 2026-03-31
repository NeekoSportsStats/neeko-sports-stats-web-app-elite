
/*
  # Rebuild v_ai_team_openai_inputs_2026_next_round (drop and recreate)

  ## Summary
  Drops and recreates the team OpenAI input view with full placeholder substitution.

  ## Source joins
  - afl.v_ai_team_payloads_2026_next_round     →  match/team context + payload
  - afl.v_ai_team_features_2026_next_round     →  season_avg, total_games_available, season
  - afl.ai_prompts (prompt_key = team_season_summary, is_active = true)  →  prompt templates

  ## Placeholder substitutions
  {team}, {season}, {games_played}, {fantasy_avg}, {disposals_avg}, {goals_avg}

  ## Notes
  - disposals_avg and goals_avg are not available in the 2026 team features pipeline yet.
    They are substituted with 'N/A' until the data layer is extended.
  - fantasy_avg is sourced from season_avg in v_ai_team_features_2026_next_round.
*/

DROP VIEW IF EXISTS afl.v_ai_team_openai_inputs_2026_next_round;

CREATE VIEW afl.v_ai_team_openai_inputs_2026_next_round AS
SELECT
  p.match_id,
  p.round_number,
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
                        pr.user_prompt_template,
                        '{team}',          COALESCE(p.team, '')
                      ),
                      '{season}',          COALESCE(f.season::text, '2026')
                    ),
                    '{games_played}',      COALESCE(f.total_games_available::text, 'N/A')
                  ),
                  '{fantasy_avg}',         COALESCE(ROUND(f.season_avg::numeric, 1)::text, 'N/A')
                ),
                '{disposals_avg}',         'N/A'
              ),
              '{goals_avg}',               'N/A'
            ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_team_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'team_season_summary'
 AND pr.is_active = true
LEFT JOIN afl.v_ai_team_features_2026_next_round f
  ON f.team     = p.team
 AND f.match_id = p.match_id;
