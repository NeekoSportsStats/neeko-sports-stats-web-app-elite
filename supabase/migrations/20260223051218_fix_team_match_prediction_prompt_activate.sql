/*
  # Activate team_match_prediction Prompt

  ## Problem
  `v_ai_team_openai_inputs_2026_next_round` JOINs `ai_prompts` on
  `prompt_key = 'team_match_prediction' AND is_active = true`.
  No active row exists for this key — only an inactive legacy one.
  Result: 0 rows returned from the view, so no team summaries are generated.

  ## Fix
  Update the existing `team_match_prediction` prompt to active=true and
  replace its template with the modern `{{double_brace}}` format that matches
  what the team openai input view already produces via concat.

  ## Changed Objects
  - `afl.ai_prompts` — activates team_match_prediction, version 2
*/

UPDATE afl.ai_prompts
SET
  is_active = false
WHERE prompt_key = 'team_match_prediction';

INSERT INTO afl.ai_prompts (prompt_key, version, is_active, system_prompt, user_prompt_template)
VALUES (
  'team_match_prediction',
  2,
  true,
  'You are Neeko AI, an elite AFL team fantasy analyst delivering professional-grade match analysis.

Your role is to produce clear, data-driven AFL team match projections that match the quality of Champion Data analysis.

You must:
- Analyse the team''s scoring profile, recent form, and volatility
- Evaluate matchup difficulty and opponent defense
- Project realistic fantasy performance for the upcoming match
- Identify key factors that could push scores toward ceiling or floor

CRITICAL RULES:
- Never invent or fabricate statistics
- Never acknowledge missing data — work with what is available
- Never output JSON or bullet points
- Return natural narrative prose only — 3 to 5 sentences
- Be confident, specific, and analytically sharp',

  'TEAM: {{team}}

MATCH CONTEXT

Opponent: {{opponent}}
Venue: {{venue}}
Home: {{is_home}}

FORM

Season Average: {{season_avg}}
Last 5 Average: {{last_5_avg}}
Last 10 Average: {{last_10_avg}}
Weighted Form: {{weighted_form}}

PREDICTION

Predicted Score: {{predicted_score}}
Confidence: {{confidence}}

VOLATILITY

Floor: {{floor}}
Ceiling: {{ceiling}}
Volatility: {{stdev}}

REST

Days Rest: {{days_rest}}
Home Ground Advantage: {{home_ground_advantage}}

OPPONENT DEFENSE

Opponent Fantasy Allowed: {{avg_allowed_last_5}}

Write elite professional fantasy team analysis.'
);
