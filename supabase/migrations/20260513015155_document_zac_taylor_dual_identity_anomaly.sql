/*
  # Document Zac Taylor Dual Identity Anomaly

  ## Summary
  Deep audit confirmed two distinct real players named "Zac Taylor" both active for
  Adelaide Crows in the 2026 AFL season. These are NOT duplicates — they are separate
  individuals identified by different jersey numbers appearing simultaneously in the
  same matches with materially different stat lines.

  ## Audit Evidence
  - player_id 1819: jersey #19, weeks 3–9, avg ~55.3 season fantasy
  - player_id 1845: jersey #9, weeks 1–9, avg ~49.1 season fantasy
  - Both IDs appear in the SAME games (weeks 3–9) with different statistics
  - Physically impossible for one player to produce two separate stat lines in the same match
  - Conclusion: TWO REAL DISTINCT PLAYERS. DO NOT MERGE.

  ## Actions
  1. Insert operator override records for both IDs in afl.player_identity_overrides
  2. Log the anomaly to system_logs for audit trail

  ## Security
  - No RLS changes required (afl schema, service role only)
  - No player data deleted or deactivated
*/

-- Insert identity override records documenting both distinct players
INSERT INTO afl.player_identity_overrides (player_id, player_name, team_id, team_name, position, notes, updated_at)
VALUES
  (1819, 'Zac Taylor', 1, 'Adelaide Crows', 'FWD',
   'DUAL IDENTITY CONFIRMED 2026-05-13: Two real players named Zac Taylor play for Adelaide Crows. This player wears jersey #19. Active weeks 3-9. DO NOT MERGE with player_id 1845 (jersey #9). Both IDs confirmed by simultaneous appearance in same match with distinct stat lines.',
   now()),
  (1845, 'Zac Taylor', 1, 'Adelaide Crows', 'FWD',
   'DUAL IDENTITY CONFIRMED 2026-05-13: Two real players named Zac Taylor play for Adelaide Crows. This player wears jersey #9. Active weeks 1-9. DO NOT MERGE with player_id 1819 (jersey #19). Both IDs confirmed by simultaneous appearance in same match with distinct stat lines.',
   now())
ON CONFLICT (player_id) DO UPDATE SET
  notes      = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at;

-- Log anomaly to system_logs for audit trail
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'warn',
  'identity_audit',
  'dual_identity_confirmed',
  'Two distinct players named Zac Taylor (IDs 1819 and 1845) confirmed active for Adelaide Crows in 2026 season. Identified by jersey numbers #19 and #9 appearing simultaneously in the same matches with different stat profiles. No merge action taken.',
  jsonb_build_object(
    'player_ids',     ARRAY[1819, 1845],
    'player_name',    'Zac Taylor',
    'team',           'Adelaide Crows',
    'jersey_1819',    19,
    'jersey_1845',    9,
    'evidence',       'simultaneous_same_match_different_stats',
    'action',         'documented_no_merge',
    'audited_at',     now()::text
  ),
  now()
);
