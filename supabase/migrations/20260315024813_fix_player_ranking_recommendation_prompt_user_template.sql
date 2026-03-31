/*
  # Fix player_ranking_recommendation Prompt — Restore user_prompt_template

  ## Problem
  The `player_ranking_recommendation` prompt in `afl.ai_prompts` has
  `user_prompt_template = NULL`. The `generate-ai-worker` edge function calls
  `.replace("{DATA}", ...)` on this null value, producing:
    "Cannot read properties of null (reading 'replace')"
  This is why all 20 pending `player_analysis` jobs fail with 0 tokens used.

  ## Fix
  Restore the `user_prompt_template` to the standard injection template that
  the worker expects: `{DATA}` for the player payload, `{LABEL}` for the
  recommendation label hint.

  ## Notes
  - The system_prompt already exists and is correct
  - Only the user_prompt_template is being set here
  - The worker will now successfully inject payload data and call OpenAI
*/

UPDATE afl.ai_prompts
SET user_prompt_template = 'Analyse this AFL fantasy player and provide a recommendation.

Player Data:
{DATA}

Recommended label hint: {LABEL}

Return your full analysis in plain text. Start with the recommendation (BUY / SIT / SELL) on the first line, then provide a 4-5 sentence analytical summary.'
WHERE prompt_key = 'player_ranking_recommendation'
  AND is_active = true;
