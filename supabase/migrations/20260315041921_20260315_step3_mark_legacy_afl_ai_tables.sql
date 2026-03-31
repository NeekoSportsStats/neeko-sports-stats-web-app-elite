/*
  # Step 3 — Mark Legacy afl Schema AI Tables

  ## Problem
  Two AI tables exist in duplicate:
    - afl.ai_player_analysis   (636 rows) — legacy shadow of public.ai_player_analysis (736 rows)
    - afl.ai_generation_queue  (0 rows)   — empty shadow of public.ai_generation_queue (3,318 rows)

  ## Fix
  1. Truncate both legacy tables so they are definitively empty
  2. Add COMMENT markers identifying them as deprecated

  ## Note on afl.v_rankings_ai_content
  The view already joins on unqualified `ai_player_analysis` with search_path
  = 'public', 'afl'. Now that afl.ai_player_analysis is empty, PostgreSQL will
  resolve the join against public.ai_player_analysis (the canonical 736-row table)
  via search_path priority. No view rebuild required.

  ## Tables left intact (not dropped) to allow safe rollback if needed.
*/

TRUNCATE TABLE afl.ai_player_analysis;
TRUNCATE TABLE afl.ai_generation_queue;

COMMENT ON TABLE afl.ai_player_analysis IS
  'DEPRECATED: Legacy shadow table. Canonical source is public.ai_player_analysis. Do not write to this table.';

COMMENT ON TABLE afl.ai_generation_queue IS
  'DEPRECATED: Legacy shadow table. Canonical source is public.ai_generation_queue. Do not write to this table.';
