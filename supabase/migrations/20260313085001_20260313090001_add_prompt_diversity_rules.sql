/*
  # Add AI text diversity instructions to ranking prompts

  ## Problem
  AI recommendation text repeats the same opening sentence structure across players:
  "has a solid projection of X points with a high ceiling of Y"

  ## Changes
  - Upgrade player_ranking_recommendation prompt with diversity rules
  - Strengthen player_ai_analysis prompt with explicit opening sentence rotation rules
*/

UPDATE afl.ai_prompts
SET system_prompt = system_prompt || E'\n---------------------------------------\nOPENING SENTENCE DIVERSITY\n---------------------------------------\n\nNever start the summary or analysis with:\n\n• "has a solid projection"\n• "has a high ceiling"\n• "projects for"\n• "with a projection of"\n• "with a ceiling of"\n\nInstead, open with the MOST INTERESTING metric for this player.\n\nPossible opening angles:\n\n• Form trajectory (rising or falling)\n• Price efficiency or value signal\n• Risk or bust concern\n• Matchup opportunity\n• Consistency track record\n• Ceiling gap vs projection\n• Leverage or breakout angle\n\nRotate across these angles. Each player should feel unique.\n\nAvoid repeating the same opening phrase across players.\n',
updated_at = now()
WHERE prompt_key = 'player_ranking_recommendation'
AND is_active = true;

UPDATE afl.ai_prompts
SET system_prompt = system_prompt || E'\n---------------------------------------\nOPENING SENTENCE ROTATION (MANDATORY)\n---------------------------------------\n\nNever open analysis with these patterns:\n\n• "has a solid projection of"\n• "projects for X points"\n• "with a high ceiling of"\n• "boasts a projection"\n• "carries a projection"\n\nOpen with the player''s MOST DISTINCTIVE characteristic.\n\nVary sentence openings across:\n\n• Form trajectory\n• Price value signal\n• Risk profile\n• Matchup context\n• Ceiling gap\n• Consistency record\n• Leverage factor\n\nFocus on unique metrics: risk_rating, matchup_rating, value_score, leverage_score.\n\nEach analysis must feel written specifically for this player.\n',
updated_at = now()
WHERE prompt_key = 'player_ai_analysis'
AND is_active = true;
