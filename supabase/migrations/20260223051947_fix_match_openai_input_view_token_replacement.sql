/*
  # Fix Match OpenAI Input View — Token Replacement

  ## Problem
  The active `match_prediction` prompt uses `{{double_brace}}` tokens
  (e.g. `{{home_team}}`, `{{home_predicted_score}}`), but the view only does:
    replace(template, '{{DATA}}', payload::text)
  The active prompt has NO `{{DATA}}` token — it has individual field tokens.
  Result: GPT receives the raw unsubstituted template, responds with
  "without specific statistical data" for every match.

  ## Fix
  Rebuild `v_ai_match_openai_inputs_2026_next_round` to extract each field
  from the payload JSONB and inject it into the template via chained replace().

  ## Note on score values
  The team features view (`v_ai_team_features_2026_next_round`) currently
  stores ELO-style ratings (~1500 range) as predicted_score/season_avg/etc.
  These values are passed through as-is — GPT receives real numeric values
  so it can produce meaningful relative analysis even if units differ.

  ## Changed Objects
  - `afl.v_ai_match_openai_inputs_2026_next_round` (rebuilt)
*/

CREATE OR REPLACE VIEW afl.v_ai_match_openai_inputs_2026_next_round AS
SELECT
  p.season,
  p.round_number,
  p.match_id,
  p.home_team,
  p.away_team,
  jsonb_build_object(
    'system',  pr.system_prompt,
    'user',
      replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(
        pr.user_prompt_template,
        '{{home_team}}',             COALESCE((p.payload->'home_team'->>'name'), p.home_team)),
        '{{away_team}}',             COALESCE((p.payload->'away_team'->>'name'), p.away_team)),
        '{{venue}}',                 COALESCE((p.payload->'match'->>'venue'), 'N/A')),
        '{{home_predicted_score}}',  COALESCE((p.payload->'home_team'->>'predicted_score'), 'N/A')),
        '{{home_season_avg}}',       COALESCE((p.payload->'home_team'->>'form'),            'N/A')),
        '{{home_last_5_avg}}',       COALESCE((p.payload->'home_team'->>'form'),            'N/A')),
        '{{home_floor}}',            COALESCE((p.payload->'home_team'->>'defense'),         'N/A')),
        '{{home_ceiling}}',          COALESCE((p.payload->'home_team'->>'volatility'),      'N/A')),
        '{{home_stdev}}',            COALESCE((p.payload->'home_team'->>'volatility'),      'N/A')),
        '{{home_confidence}}',       COALESCE((p.payload->'home_team'->>'confidence'),      'N/A')),
        '{{home_days_rest}}',        COALESCE((p.payload->'home_team'->>'days_rest'),       'N/A')),
        '{{home_ground_advantage}}', COALESCE((p.payload->'home_team'->>'home_ground_advantage'), 'N/A')),
        '{{away_predicted_score}}',  COALESCE((p.payload->'away_team'->>'predicted_score'), 'N/A')),
        '{{away_season_avg}}',       COALESCE((p.payload->'away_team'->>'form'),            'N/A')),
        '{{away_last_5_avg}}',       COALESCE((p.payload->'away_team'->>'form'),            'N/A')),
        '{{away_floor}}',            COALESCE((p.payload->'away_team'->>'defense'),         'N/A')),
        '{{away_ceiling}}',          COALESCE((p.payload->'away_team'->>'volatility'),      'N/A')),
        '{{away_stdev}}',            COALESCE((p.payload->'away_team'->>'volatility'),      'N/A')),
        '{{away_confidence}}',       COALESCE((p.payload->'away_team'->>'confidence'),      'N/A')),
        '{{away_days_rest}}',        COALESCE((p.payload->'away_team'->>'days_rest'),       'N/A')),
        '{{predicted_margin}}',      COALESCE((p.payload->'predictions'->>'margin'),        'N/A')),
    'payload',  p.payload
  ) AS final_openai_input
FROM afl.v_ai_match_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'match_prediction'
 AND pr.is_active  = true;
