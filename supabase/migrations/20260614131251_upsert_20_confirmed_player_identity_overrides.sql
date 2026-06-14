
INSERT INTO afl.player_identity_overrides
  (player_id, player_name, team_id, team_name, position, notes, is_protected, source, updated_at)
VALUES
  -- Carlton Blues (team_id=3)
  (1906, 'Wade Derksen',          3,  'Carlton Blues',         'DEF', 'Confirmed via Carlton 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2102, 'Jack Ison',             3,  'Carlton Blues',         'FWD', 'Confirmed via Carlton 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Hawthorn Hawks (team_id=8)
  (2086, 'Bodie Ryan',            8,  'Hawthorn Hawks',        'DEF', 'Confirmed via Hawthorn 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2097, 'Cameron Nairn',         8,  'Hawthorn Hawks',        'MID', 'Confirmed via Hawthorn 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2078, 'Jack Dalton',           8,  'Hawthorn Hawks',        'FWD', 'Confirmed via Hawthorn 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Sydney Swans (team_id=14)
  (2085, 'Billy Cootee',          14, 'Sydney Swans',          'FWD', 'Confirmed via Sydney 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2109, 'Harry Kyle',            14, 'Sydney Swans',          'DEF', 'Confirmed via Sydney 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Richmond Tigers (team_id=12)
  (2100, 'Noah Roberts-Thomson',  12, 'Richmond Tigers',       'MID', 'Confirmed via Richmond 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Adelaide Crows (team_id=1)
  (2114, 'Hugo Hall-Kahan',       1,  'Adelaide Crows',        'DEF', 'Confirmed via Adelaide 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2068, 'Charlie Edwards',       1,  'Adelaide Crows',        'MID', 'Confirmed via Adelaide 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Gold Coast Suns (team_id=17)
  (2113, 'Jai Murray',            17, 'Gold Coast Suns',       'MID', 'Confirmed via Gold Coast 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Port Adelaide Power (team_id=11)
  (1815, 'Tom Anastasopoulos',    11, 'Port Adelaide Power',   'FWD', 'Confirmed via Port Adelaide 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2069, 'Mitch Zadow',           11, 'Port Adelaide Power',   'FWD', 'Confirmed via Port Adelaide 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Collingwood Magpies (team_id=4)
  (1725, 'Harvey Harrison',       4,  'Collingwood Magpies',   'FWD', 'Confirmed via Collingwood 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2117, 'Mitch Podhajski',       4,  'Collingwood Magpies',   'FWD', 'Confirmed via Collingwood 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- GWS Giants (team_id=18)
  (2099, 'Harrison Oliver',       18, 'GWS Giants',            'DEF', 'Confirmed via GWS 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Western Bulldogs (team_id=16)
  (950,  'Cody Weightman',        16, 'Western Bulldogs',      'FWD', 'Confirmed via Western Bulldogs 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  -- Melbourne Demons (team_id=9)
  (1843, 'Andy Moniz-Wakefield',  9,  'Melbourne Demons',      'FWD', 'Confirmed via Melbourne 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2087, 'Xavier Taylor',         9,  'Melbourne Demons',      'DEF', 'Confirmed via Melbourne 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now()),
  (2075, 'Luker Kentfield',       9,  'Melbourne Demons',      'FWD', 'Confirmed via Melbourne 2026 squad list and jumper number cross-reference; manual review 2026-06-14', true, 'manual_review_confirmed', now())
ON CONFLICT (player_id) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  team_id      = EXCLUDED.team_id,
  team_name    = EXCLUDED.team_name,
  position     = EXCLUDED.position,
  notes        = EXCLUDED.notes,
  is_protected = EXCLUDED.is_protected,
  source       = EXCLUDED.source,
  updated_at   = EXCLUDED.updated_at;
