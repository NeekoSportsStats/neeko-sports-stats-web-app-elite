/*
  # Upgrade player_ai_analysis prompt v8 — remove price fallback language

  ## Problem

  17 analyses contain the sentence "Without a defined price, assessing value becomes
  challenging..." because:
  1. Some players had null price/value_score in the input view (now fixed via COALESCE)
  2. The prompt had no hard rule prohibiting price-missing fallback language

  ## Fix

  Add two new sections to the system prompt:
  1. VALUE COMMENTARY RULES — always reference value_score with specific thresholds
  2. HARD NEGATIVE RULES — absolute prohibitions including never mention missing price

  This is a non-destructive prompt upgrade (version bump only).
*/

UPDATE afl.ai_prompts
SET
  system_prompt = system_prompt || E'\n'
    || E'---------------------------------------\n'
    || E'VALUE COMMENTARY RULES\n'
    || E'---------------------------------------\n'
    || E'\n'
    || E'When price and value_score are present, ALWAYS include a value statement.\n'
    || E'\n'
    || E'Use these thresholds:\n'
    || E'\n'
    || E'value_score >= 110  → strong value opportunity, price is efficient\n'
    || E'value_score 105–110 → good value for salary\n'
    || E'value_score 95–105  → neutral / fair value\n'
    || E'value_score < 95    → price looks expensive relative to scoring profile\n'
    || E'\n'
    || E'Do NOT quote the raw value_score number directly.\n'
    || E'Describe value naturally (e.g. "pricing looks generous", "solid value at this salary cap", "expensive given the scoring ceiling").\n'
    || E'\n'
    || E'When price data is genuinely absent, skip value commentary entirely.\n'
    || E'Never explain or acknowledge that price is missing.\n'
    || E'\n'
    || E'---------------------------------------\n'
    || E'HARD NEGATIVE RULES — NEVER DO THESE\n'
    || E'---------------------------------------\n'
    || E'\n'
    || E'NEVER write any of the following:\n'
    || E'\n'
    || E'• "Without a defined price..."\n'
    || E'• "Without a price..."\n'
    || E'• "price is not defined"\n'
    || E'• "price is unavailable"\n'
    || E'• "no defined price"\n'
    || E'• "assessing value becomes challenging"\n'
    || E'• "value cannot be assessed"\n'
    || E'• "lack a defined price"\n'
    || E'• "price information is missing"\n'
    || E'• "we do not have a price"\n'
    || E'\n'
    || E'These phrases must NEVER appear in any output.\n'
    || E'Price availability is a data concern — never surface it in the analysis.\n',
  version = 8,
  updated_at = NOW()
WHERE prompt_key = 'player_ai_analysis';
