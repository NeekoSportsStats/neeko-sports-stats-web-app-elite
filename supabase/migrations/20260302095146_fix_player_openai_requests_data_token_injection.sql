/*
  # Fix afl.v_ai_player_openai_requests_2026_next_round — {DATA} token injection

  ## Problem
  The view was calling replace(template, '{{DATA}}', payload::text) but the
  active prompt template uses single-brace {DATA}. The replace never matched,
  so every generated prompt contained the literal string "{DATA}" with no
  player data injected.

  ## Fix
  Apply replace() twice in sequence:
    1. replace(template, '{DATA}', payload::text)     — handles single-brace templates
    2. replace(result,   '{{DATA}}', payload::text)   — handles double-brace templates
  This supports both forms going forward regardless of which style is stored in ai_prompts.

  ## Changes
  - CREATE OR REPLACE VIEW afl.v_ai_player_openai_requests_2026_next_round
  - No table changes, no RLS changes
*/

CREATE OR REPLACE VIEW afl.v_ai_player_openai_requests_2026_next_round AS
SELECT
  replace(
    replace(p.user_prompt_template, '{DATA}', pl.payload::text),
    '{{DATA}}', pl.payload::text
  ) AS user_prompt,
  jsonb_build_object(
    'system', p.system_prompt,
    'user', replace(
      replace(p.user_prompt_template, '{DATA}', pl.payload::text),
      '{{DATA}}', pl.payload::text
    )
  ) AS final_openai_input
FROM afl.v_ai_player_payloads_2026_next_round pl
JOIN afl.ai_prompts p
  ON p.prompt_key = 'player_round_summary' AND p.is_active = true;
