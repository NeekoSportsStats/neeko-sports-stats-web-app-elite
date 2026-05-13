/*
  # Flag Player#1107 — Carlton Blues Jersey #24 — Unknown Identity

  ## Summary
  Deep audit of player_id 1107 found a high-performing Carlton Blues player
  (91.8 avg fantasy, 6 games, weeks 4-9, jersey #24) whose real name was
  never delivered by the source data API. No backend system (raw stats,
  price ingest, fantasy market, staging tables) has a real name for this player.

  ## Audit Findings
  - Team: Carlton Blues
  - Jersey: #24 (unique — no other Carlton player uses this number)
  - Games: 6 (weeks 4-9, 2026 season)
  - Avg fantasy: 91.8 (elite tier — 2nd highest on the Carlton squad)
  - Stat profile: 17.5K / 4.8HB / 7.0M / 0 HO → Key defender / Half-Back Flanker
  - API payload: only {id: 1107, number: 24} — name field was never populated
  - All staging, price, and fantasy market tables: no name record found

  ## Action
  - DO NOT rename without confirmed external evidence
  - Add identity override flagging this as requiring manual identification
  - Log anomaly to system_logs for admin review
  - Operator should cross-reference official Carlton 2026 squad list for jersey #24

  ## Security
  - No RLS changes
  - No player data deleted or modified
*/

-- Add identity override record flagging for manual review
INSERT INTO afl.player_identity_overrides (
  player_id, player_name, team_id, team_name, position, notes, updated_at
)
VALUES (
  1107,
  'Player#1107',
  2,  -- Carlton Blues team_id
  'Carlton Blues',
  'DEF',
  'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Carlton Blues jersey #24. 6 games weeks 4-9, avg fantasy 91.8 (elite). Stat profile: 17.5 kicks / 7.0 marks / 0 hitouts → key defender / HBF. Name was never delivered by the source API — only {id:1107, number:24} present in raw_json. No price ingest, fantasy market, or staging record found with a real name. Operator must cross-reference official Carlton 2026 squad list for jersey #24 to identify this player.',
  now()
)
ON CONFLICT (player_id) DO UPDATE SET
  notes      = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at;

-- Log anomaly to system_logs
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'warn',
  'identity_audit',
  'placeholder_requires_manual_id',
  'Player#1107 (Carlton Blues jersey #24) is a high-scoring placeholder (91.8 avg, 6 games) whose real name was never delivered by the source API. Manual identification required — cross-reference official Carlton 2026 squad for jersey #24.',
  jsonb_build_object(
    'player_id',      1107,
    'team',           'Carlton Blues',
    'jersey_number',  24,
    'games',          6,
    'avg_fantasy',    91.8,
    'weeks_played',   ARRAY[4,5,6,7,8,9],
    'stat_profile',   jsonb_build_object(
      'avg_kicks',    17.5,
      'avg_handballs', 4.8,
      'avg_marks',    7.0,
      'avg_hitouts',  0,
      'avg_disposals', 22.3
    ),
    'position_inference', 'DEF/HBF (key defender profile — high kicks, high marks, zero hitouts)',
    'action',         'flagged_for_manual_review',
    'resolution',     'operator_must_check_carlton_2026_squad_jersey_24',
    'audited_at',     now()::text
  ),
  now()
);
