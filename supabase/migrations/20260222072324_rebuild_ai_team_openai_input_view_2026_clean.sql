
/*
  # Rebuild v_ai_team_openai_inputs_2026_next_round — Clean Final Version

  ## Summary
  Replaces the interim version with a clean, maintainable view.
  User prompt is built via concat() extracting all metric fields directly
  from the payload JSONB. No REPLACE chains needed since all values are
  read from structured JSONB rather than a template string with placeholders.

  ## All metrics included
  Team name, opponent, venue, home/away, season_avg, last_5_avg, last_10_avg,
  weighted_form, predicted_score, confidence, floor, ceiling, stdev (volatility),
  days_rest, home_ground_advantage, avg_allowed_last_5 (opponent defense).

  ## Data source
  afl.v_ai_team_payloads_2026_next_round (payload JSONB only — no extra joins required)
  afl.ai_prompts (team_season_summary, is_active = true)
*/

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
  ON pr.prompt_key = 'team_season_summary'
 AND pr.is_active = true;
