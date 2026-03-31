
/*
  # Upgrade player_match_prediction prompt v2 — value and price aware

  ## Summary
  Inserts a new version 2 of the player_match_prediction prompt that
  instructs the AI to assess fantasy value (price vs projection) in
  every player analysis. Deactivates v1.

  ## Changes
  - Adds Price, Value Score, Value Tier fields to user prompt template
  - System prompt explicitly requires value assessment paragraph
  - Adds BUY / HOLD / AVOID coaching signal
*/

update afl.ai_prompts
set is_active = false
where prompt_key = 'player_match_prediction' and is_active = true;

insert into afl.ai_prompts (prompt_key, version, is_active, system_prompt, user_prompt_template)
values (
  'player_match_prediction',
  2,
  true,
  'You are an elite AFL fantasy analyst writing for serious fantasy coaches.

Write concise, decisive analysis. Always include a value assessment based on the player''s price vs projection.

DO NOT mention AI or algorithms. Write like a professional human analyst.',

  'Analyse this AFL fantasy player for the upcoming round.

Player: {player}
Team: {team}
Opponent: {opponent}

Season Average: {season_avg}
Last 5 Average: {last_5_avg}
Projected Score: {predicted_score}
Ceiling: {ceiling}
Floor: {floor}
Volatility: {stdev}
Price: {price}
Value Score: {value_score}
Value Tier: {value_tier}

Write elite fantasy analysis covering:
• Expected scoring outlook this round
• Ceiling vs floor reliability
• Matchup impact
• Risk level and volatility

REQUIRED — Value Assessment paragraph:
• State whether this player is ELITE VALUE, GOOD VALUE, or POOR VALUE based on their price and projected score
• Give a clear BUY, HOLD, or AVOID signal for fantasy coaches
• Explain the price efficiency in plain language

Be decisive and professional. 150–220 words.'
);
