
/*
  # Create v_ai_match_openai_inputs_2026_next_round

  ## Summary
  Creates the match-level OpenAI input view, which did not previously exist.

  ## Source joins
  - afl.v_ai_match_payloads_2026_next_round     →  match context + full JSONB payload
  - afl.ai_prompts (prompt_key = match_prediction, is_active = true)  →  prompt templates

  ## Structure
  The match prompt uses {{DATA}} as a single injection point (not named field placeholders).
  The full payload is serialised as text and injected into the user prompt.

  ## Output columns
  - season
  - round_number
  - match_id
  - home_team
  - away_team
  - final_openai_input (jsonb): { system, user, payload }
*/

CREATE VIEW afl.v_ai_match_openai_inputs_2026_next_round AS
SELECT
  p.season,
  p.round_number,
  p.match_id,
  p.home_team,
  p.away_team,
  jsonb_build_object(
    'system', pr.system_prompt,
    'user',   REPLACE(
                pr.user_prompt_template,
                '{{DATA}}',
                p.payload::text
              ),
    'payload', p.payload
  ) AS final_openai_input
FROM afl.v_ai_match_payloads_2026_next_round p
JOIN afl.ai_prompts pr
  ON pr.prompt_key = 'match_prediction'
 AND pr.is_active = true;
