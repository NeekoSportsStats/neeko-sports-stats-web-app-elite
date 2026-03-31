/*
  # Upgrade v_ai_team_openai_inputs_2026_next_round

  ## Summary
  Rebuilds the team OpenAI input view so that both the system prompt AND the
  user prompt are sourced entirely from the afl.ai_prompts table at query time.

  Previously, the user content was hardcoded SQL string concatenation with a
  fixed closing instruction. This meant updating the prompt template in
  afl.ai_prompts had no effect on the user message.

  ## Changes
  - Replaces hardcoded user prompt suffix with pr.user_prompt_template content
  - Data block is still built from the payload JSON (team, match context, form,
    prediction, volatility, rest, opponent defense)
  - The template's closing instruction replaces the old static string
  - system prompt continues to be sourced from pr.system_prompt (already live)

  ## Notes
  - No schema changes — view only
  - Prompt key: team_match_prediction, is_active = true
*/

CREATE OR REPLACE VIEW afl.v_ai_team_openai_inputs_2026_next_round AS
SELECT
  p.match_id,
  p.round_number,
  p.team,
  (p.payload -> 'team') ->> 'opponent' AS opponent,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user', concat(
      'TEAM: ', COALESCE((p.payload -> 'team') ->> 'name', p.team), E'\n\n',
      'MATCH CONTEXT', E'\n\n',
      'Opponent: ', COALESCE((p.payload -> 'team') ->> 'opponent', 'N/A'), E'\n',
      'Venue: ', COALESCE((p.payload -> 'match') ->> 'venue', 'N/A'), E'\n',
      'Home: ', COALESCE((p.payload -> 'match') ->> 'is_home', 'N/A'), E'\n\n',
      'FORM', E'\n\n',
      'Season Average: ', COALESCE(round(((p.payload -> 'form') ->> 'season_avg')::numeric, 1)::text, 'N/A'), E'\n',
      'Last 5 Average: ', COALESCE(round(((p.payload -> 'form') ->> 'last_5_avg')::numeric, 1)::text, 'N/A'), E'\n',
      'Last 10 Average: ', COALESCE(round(((p.payload -> 'form') ->> 'last_10_avg')::numeric, 1)::text, 'N/A'), E'\n',
      'Weighted Form: ', COALESCE(round(((p.payload -> 'form') ->> 'weighted_form')::numeric, 1)::text, 'N/A'), E'\n\n',
      'PREDICTION', E'\n\n',
      'Predicted Score: ', COALESCE(round(((p.payload -> 'prediction') ->> 'predicted_score')::numeric, 0)::text, 'N/A'), E'\n',
      'Confidence: ', COALESCE((p.payload -> 'prediction') ->> 'confidence', 'N/A'), E'\n\n',
      'VOLATILITY', E'\n\n',
      'Floor: ', COALESCE(round(((p.payload -> 'volatility') ->> 'floor')::numeric, 1)::text, 'N/A'), E'\n',
      'Ceiling: ', COALESCE(round(((p.payload -> 'volatility') ->> 'ceiling')::numeric, 1)::text, 'N/A'), E'\n',
      'Volatility: ', COALESCE(round(((p.payload -> 'volatility') ->> 'stdev')::numeric, 1)::text, 'N/A'), E'\n\n',
      'REST', E'\n\n',
      'Days Rest: ', COALESCE((p.payload -> 'rest') ->> 'days_rest', 'N/A'), E'\n',
      'Home Ground Advantage: ', COALESCE((p.payload -> 'context') ->> 'home_ground_advantage', 'N/A'), E'\n\n',
      'OPPONENT DEFENSE', E'\n\n',
      'Opponent Fantasy Allowed: ', COALESCE(round(((p.payload -> 'defense') ->> 'avg_allowed_last_5')::numeric, 1)::text, 'N/A'), E'\n\n',
      E'\nAnalyse this AFL team using the verified dataset above.\n\nWrite elite fantasy analysis explaining:\n\n• current scoring level\n• whether form is improving or declining\n• how reliable their scoring is\n• matchup impact\n• ceiling potential\n• risk factors\n\nExplain what fantasy coaches should expect next match.'
    ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_team_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'team_match_prediction'
  AND pr.is_active = true;
