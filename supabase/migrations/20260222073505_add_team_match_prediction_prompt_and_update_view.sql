
/*
  # Add team_match_prediction prompt and update team OpenAI input view

  ## New Prompt
  - prompt_key: team_match_prediction
  - version: 1
  - is_active: true
  - Separate from team_season_summary — match-specific analysis prompt

  ## View Update
  - afl.v_ai_team_openai_inputs_2026_next_round now joins on
    prompt_key = 'team_match_prediction' instead of 'team_season_summary'

  ## No existing prompts modified
  ## No tables modified
*/

INSERT INTO afl.ai_prompts (prompt_key, version, system_prompt, user_prompt_template, is_active)
VALUES (
  'team_match_prediction',
  1,
  'You are an elite AFL fantasy analyst writing match-specific team analysis for Neeko Sports Stats.

Your role is to analyse a team''s upcoming match using statistical evidence.

Focus on:

• scoring outlook
• recent form
• volatility and risk
• matchup difficulty
• opponent defense
• predicted fantasy performance

Write elite professional analysis.

Be concise and authoritative.

Never mention AI or models.',
  'Analyse this AFL team for their upcoming match using this verified dataset:

{DATA}

Write professional fantasy analysis explaining:

• expected scoring
• volatility
• matchup impact
• upside and risks',
  true
);


CREATE OR REPLACE VIEW afl.v_ai_team_openai_inputs_2026_next_round AS
SELECT
  p.match_id,
  p.round_number,
  p.team,
  (p.payload -> 'team' ->> 'opponent') AS opponent,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user', concat(
      'TEAM: ', COALESCE(p.payload -> 'team' ->> 'name', p.team),             E'\n\n',
      'MATCH CONTEXT',                                                          E'\n\n',
      'Opponent: ',            COALESCE(p.payload -> 'team' ->> 'opponent',                               'N/A'), E'\n',
      'Venue: ',               COALESCE(p.payload -> 'match' ->> 'venue',                                 'N/A'), E'\n',
      'Home: ',                COALESCE(p.payload -> 'match' ->> 'is_home',                               'N/A'), E'\n\n',
      'FORM',                                                                   E'\n\n',
      'Season Average: ',      COALESCE(ROUND((p.payload -> 'form' ->> 'season_avg')::numeric,    1)::text, 'N/A'), E'\n',
      'Last 5 Average: ',      COALESCE(ROUND((p.payload -> 'form' ->> 'last_5_avg')::numeric,    1)::text, 'N/A'), E'\n',
      'Last 10 Average: ',     COALESCE(ROUND((p.payload -> 'form' ->> 'last_10_avg')::numeric,   1)::text, 'N/A'), E'\n',
      'Weighted Form: ',       COALESCE(ROUND((p.payload -> 'form' ->> 'weighted_form')::numeric, 1)::text, 'N/A'), E'\n\n',
      'PREDICTION',                                                             E'\n\n',
      'Predicted Score: ',     COALESCE(ROUND((p.payload -> 'prediction' ->> 'predicted_score')::numeric, 0)::text, 'N/A'), E'\n',
      'Confidence: ',          COALESCE(p.payload -> 'prediction' ->> 'confidence',                      'N/A'), E'\n\n',
      'VOLATILITY',                                                             E'\n\n',
      'Floor: ',               COALESCE(ROUND((p.payload -> 'volatility' ->> 'floor')::numeric,   1)::text, 'N/A'), E'\n',
      'Ceiling: ',             COALESCE(ROUND((p.payload -> 'volatility' ->> 'ceiling')::numeric, 1)::text, 'N/A'), E'\n',
      'Volatility: ',          COALESCE(ROUND((p.payload -> 'volatility' ->> 'stdev')::numeric,   1)::text, 'N/A'), E'\n\n',
      'REST',                                                                   E'\n\n',
      'Days Rest: ',           COALESCE(p.payload -> 'rest' ->> 'days_rest',                              'N/A'), E'\n',
      'Home Ground Advantage: ', COALESCE(p.payload -> 'context' ->> 'home_ground_advantage',            'N/A'), E'\n\n',
      'OPPONENT DEFENSE',                                                       E'\n\n',
      'Opponent Fantasy Allowed: ', COALESCE(ROUND((p.payload -> 'defense' ->> 'avg_allowed_last_5')::numeric, 1)::text, 'N/A'), E'\n\n',
      'Write elite professional fantasy team analysis.'
    ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_team_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'team_match_prediction'
 AND pr.is_active = true;
