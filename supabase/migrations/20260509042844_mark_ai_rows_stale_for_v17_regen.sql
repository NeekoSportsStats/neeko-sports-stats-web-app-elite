/*
  # Mark AI rows stale for v17 prompt regeneration

  ## Summary
  Both AI generation prompts have been upgraded to v17 (stats-grounded-first).
  This migration flags existing rows for regeneration under the new prompts.

  ## Changes
  1. Player AI (ai.player_ai_analysis): sets needs_regen = true for all rows.
     The table has no prompt_version column so all rows are flagged.
  2. Team AI (afl.ai_team_summaries): backdates updated_at to 2000-01-01 for rows
     with prompt_version != 'generate-team-ai-summaries-v17', pushing them past the
     6-hour freshness window so the next run regenerates them.

  ## Notes
  - No data is deleted — rows are flagged/backdated for regeneration only
  - Player AI regeneration is driven by needs_regen = true flag
  - Team AI regeneration is driven by freshSet logic checking prompt_version + age
*/

-- Mark ALL Player AI rows as needing regeneration (no prompt_version column available)
UPDATE ai.player_ai_analysis
SET needs_regen = true,
    needs_regen_reason = 'prompt upgraded to v17 stats-grounded-first';

-- Backdate Team AI rows with old prompt version so they regenerate next run
UPDATE afl.ai_team_summaries
SET updated_at = '2000-01-01T00:00:00Z'
WHERE prompt_version IS DISTINCT FROM 'generate-team-ai-summaries-v17';
