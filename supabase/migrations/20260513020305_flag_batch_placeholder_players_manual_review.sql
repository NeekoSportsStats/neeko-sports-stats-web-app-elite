/*
  # Flag Batch Placeholder Players for Manual Review

  ## Summary
  Deep audit of 5 high-priority placeholder players found that names were
  never delivered by the source data API across all records — raw_json contains
  only {id, number} with no name fields. No staging, price ingest, or fantasy
  market table holds a real name for any of these players.

  ## Players Audited
  All 5 confirmed: names unknown, API source gap, manual identification required.

  1. Player#740   — Essendon Bombers #13 — 6 games, avg 12.5 — active wks 8-9
  2. Player#2073  — Richmond Tigers  #33 — 5 games, avg 55.6 — active wks 6-9
  3. Player#2074  — Collingwood      #41 — 6 games, avg 54.5 — active wks 5-9
  4. Player#2080  — Essendon Bombers #9  — 5 games, avg 53.6 — active wks 5-9
  5. Player#2091  — Richmond Tigers  #22 — 3 games, avg 57.7 — active wks 7-9

  ## Action
  - No renames applied (confidence = 0% for all)
  - Insert/update identity override records with full audit notes
  - Log all 5 to system_logs for admin tracking

  ## Security
  - No RLS changes, no data deleted or modified
*/

-- Insert override records for all 5 placeholder players
INSERT INTO afl.player_identity_overrides (
  player_id, player_name, team_id, team_name, position, notes, updated_at
)
VALUES
  (
    740,
    'Player#740',
    4,
    'Essendon Bombers',
    'FWD',
    'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Essendon Bombers jersey #13. 6 games wks 4-9, avg fantasy 12.5 (active only wks 8-9, DNP wks 4-7). Stat profile: 4.0K/5.0HB/2.5M/0HO/1.0G — small forward or MID fringe. Jersey #13 is unique to this player on the Essendon 2026 squad. Name never delivered by source API (raw_json = {id:740, number:13}). Operator must cross-reference official Essendon 2026 squad list for jersey #13.',
    now()
  ),
  (
    2073,
    'Player#2073',
    15,
    'Richmond Tigers',
    'MID',
    'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Richmond Tigers jersey #33. 5 games wks 5-9, avg fantasy 55.6 (DNP wk5, active wks 6-9). Stat profile: 8.4K/7.1HB/4.5M/0HO — balanced MID or HBF. Jersey #33 is unique to this player on the Richmond 2026 squad. Name never delivered by source API (raw_json = {id:2073, number:33}). Operator must cross-reference official Richmond 2026 squad list for jersey #33.',
    now()
  ),
  (
    2074,
    'Player#2074',
    3,
    'Collingwood Magpies',
    'FWD',
    'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Collingwood Magpies jersey #41. 6 games wks 4-9, avg fantasy 54.5 (DNP wk4, active wks 5-9). Stat profile: 8.3K/4.3HB/2.6M/0HO/4.2 tackles/1.0G — forward or forward-mid with high tackles. Jersey #41 is unique to this player on the Collingwood 2026 squad. Name never delivered by source API (raw_json = {id:2074, number:41}). Operator must cross-reference official Collingwood 2026 squad list for jersey #41.',
    now()
  ),
  (
    2080,
    'Player#2080',
    4,
    'Essendon Bombers',
    'MID',
    'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Essendon Bombers jersey #9. 5 games wks 5-9, avg fantasy 53.6. Stat profile: 6.8K/6.4HB/2.6M/0HO/2.2 clr/0.6G — classic midfielder (balanced kicks/handballs, clearances). Jersey #9 is unique to this player on the Essendon 2026 squad. Name never delivered by source API (raw_json = {id:2080, number:9}). Operator must cross-reference official Essendon 2026 squad list for jersey #9.',
    now()
  ),
  (
    2091,
    'Player#2091',
    15,
    'Richmond Tigers',
    'MID',
    'UNKNOWN IDENTITY — REQUIRES MANUAL REVIEW (2026-05-13): Richmond Tigers jersey #22. 3 games wks 7-9, avg fantasy 57.7. Stat profile: 7.3K/7.3HB/1.7M/0HO/3.0 clr/0.7G — inside midfielder (high clearances, equal kicks/handballs). Jersey #22 is unique to this player on the Richmond 2026 squad. Name never delivered by source API (raw_json = {id:2091, number:22}). Operator must cross-reference official Richmond 2026 squad list for jersey #22.',
    now()
  )
ON CONFLICT (player_id) DO UPDATE SET
  notes      = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at;

-- Log all 5 to system_logs as a batch
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'warn',
  'identity_audit',
  'batch_placeholder_manual_review',
  'Batch audit of 5 high-priority placeholder players completed. All 5 require manual identification — names were never delivered by source API. No renames applied. Operators must cross-reference official club 2026 squad lists using jersey numbers.',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('player_id', 740,  'team', 'Essendon Bombers', 'jersey', 13, 'avg_fantasy', 12.5, 'games', 6,  'position_inference', 'FWD/MID fringe', 'active_weeks', '8-9'),
      jsonb_build_object('player_id', 2073, 'team', 'Richmond Tigers',  'jersey', 33, 'avg_fantasy', 55.6, 'games', 5,  'position_inference', 'MID/HBF', 'active_weeks', '6-9'),
      jsonb_build_object('player_id', 2074, 'team', 'Collingwood Magpies', 'jersey', 41, 'avg_fantasy', 54.5, 'games', 6, 'position_inference', 'FWD/MID', 'active_weeks', '5-9'),
      jsonb_build_object('player_id', 2080, 'team', 'Essendon Bombers', 'jersey', 9,  'avg_fantasy', 53.6, 'games', 5,  'position_inference', 'MID', 'active_weeks', '5-9'),
      jsonb_build_object('player_id', 2091, 'team', 'Richmond Tigers',  'jersey', 22, 'avg_fantasy', 57.7, 'games', 3,  'position_inference', 'MID inside', 'active_weeks', '7-9')
    ),
    'root_cause',  'source_api_omits_player_names_all_clubs',
    'resolution',  'operator_must_check_official_squad_lists_by_jersey_number',
    'action',      'flagged_for_manual_review_no_rename',
    'audited_at',  now()::text
  ),
  now()
);
