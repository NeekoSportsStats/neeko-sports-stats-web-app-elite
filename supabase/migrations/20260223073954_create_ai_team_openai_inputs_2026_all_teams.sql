/*
  # Create afl.v_ai_team_openai_inputs_2026_all_teams

  ## Purpose
  Provides fully-resolved OpenAI system+user prompt pairs for all 18 AFL teams,
  independent of which teams have an upcoming fixture.

  ## Source
  - afl.v_ai_team_payloads_2026_all_teams  (always 18 rows)
  - afl.ai_prompts WHERE prompt_key = 'team_season_summary' AND is_active = true

  ## Prompt key
  Uses 'team_season_summary' — the stable season-level prompt that does not
  require opponent/fixture context. This is correct for an all-teams view because
  many teams will have no upcoming opponent at any given time.

  ## Token resolution
  All tokens are resolved inline via concat() extracting fields directly from
  the payload JSONB. No edge-function template processing required — the edge
  function reads final_openai_input.system and final_openai_input.user directly.

  ## Output columns
  - team, season, round_number
  - final_openai_input (jsonb): { system, user, payload }
*/

CREATE OR REPLACE VIEW afl.v_ai_team_openai_inputs_2026_all_teams AS
SELECT
  p.team,
  p.season,
  p.round_number,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user', concat(
      'TEAM: ', p.team,                                                         E'\n\n',
      'SEASON FORM PROFILE',                                                    E'\n\n',
      'Season Average: ',      COALESCE(ROUND(p.season_avg::numeric,    1)::text, 'N/A'), E'\n',
      'Last 5 Average: ',      COALESCE(ROUND(p.last_5_avg::numeric,    1)::text, 'N/A'), E'\n',
      'Last 10 Average: ',     COALESCE(ROUND(p.last_10_avg::numeric,   1)::text, 'N/A'), E'\n',
      'Weighted Form: ',       COALESCE(ROUND(p.weighted_form::numeric, 1)::text, 'N/A'), E'\n',
      'Games Sampled: ',       COALESCE(p.total_games_available::text,           'N/A'), E'\n\n',
      'PREDICTION',                                                             E'\n\n',
      'Projected Score: ',     COALESCE(ROUND(p.predicted_score::numeric, 0)::text, 'N/A'), E'\n',
      'Confidence: ',          COALESCE(p.confidence_bucket,                    'N/A'), E'\n\n',
      'VOLATILITY',                                                             E'\n\n',
      'Floor (P10): ',         COALESCE(ROUND(p.floor::numeric,    1)::text, 'N/A'), E'\n',
      'Ceiling (P90): ',       COALESCE(ROUND(p.ceiling::numeric,  1)::text, 'N/A'), E'\n',
      'Volatility (StDev): ',  COALESCE(ROUND(p.stdev_last_10::numeric, 1)::text, 'N/A'), E'\n\n',
      'OPPONENT DEFENSE CONTEXT',                                               E'\n\n',
      'Avg Fantasy Allowed (Last 5): ', COALESCE(ROUND(p.avg_allowed_last_5::numeric, 1)::text, 'N/A'), E'\n',
      'Avg Fantasy Allowed (Season): ', COALESCE(ROUND(p.avg_allowed_season::numeric, 1)::text, 'N/A'), E'\n\n',
      'Write elite professional AFL fantasy team season analysis.'
    ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_team_payloads_2026_all_teams p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'team_season_summary'
 AND pr.is_active  = true;
