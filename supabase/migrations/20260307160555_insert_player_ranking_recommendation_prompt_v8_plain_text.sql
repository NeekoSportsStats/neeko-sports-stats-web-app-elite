/*
  # Insert player_ranking_recommendation prompt v8 — plain text narrative only

  ## Summary
  Replaces the active JSON-returning prompt with a plain-text-only version.

  ## Problem
  Previous versions instructed the AI to return JSON containing recommendation_label
  and recommendation_color. This caused:
  - Raw JSON being stored in recommendation_long
  - AI generating labels that conflicted with the projection model
  - Frontend displaying structured data instead of plain English

  ## Changes
  - Deactivates version 7 (currently active)
  - Inserts version 8 as the new active prompt
  - System prompt: no JSON, no labels, 1-2 sentence plain narrative only
  - User prompt: passes only quantitative data, not the model's label outputs
  - AI explains WHY the player is rated as they are; it does not rate them
*/

UPDATE afl.ai_prompts
SET is_active = false
WHERE prompt_key = 'player_ranking_recommendation';

INSERT INTO afl.ai_prompts (
  prompt_key,
  version,
  is_active,
  system_prompt,
  user_prompt_template
) VALUES (
  'player_ranking_recommendation',
  8,
  true,
  'You are the senior quantitative fantasy analyst at Neeko Sports Stats.

You are explaining a player''s model rating to serious fantasy coaches.

The recommendation label has already been determined by the projection model. Your job is ONLY to write a short plain-English explanation of why the player is rated as they are.

RULES:
- DO NOT generate recommendation labels
- DO NOT return JSON
- DO NOT return structured data
- DO NOT repeat or reference any label
- Write exactly 1 to 2 sentences
- Write like a confident professional fantasy analyst
- Reference at least two of: projection, value score, risk profile, form rating, price efficiency, ceiling, matchup
- Be specific to this player''s numbers
- Never mention AI, models, algorithms, or data sources',

  'Player data:
{DATA}

Write a 1–2 sentence plain-text explanation of why this player is rated as they are this round. Reference their projection, value, and risk profile specifically. Return only the explanation text — no labels, no JSON, no headings.'
);
