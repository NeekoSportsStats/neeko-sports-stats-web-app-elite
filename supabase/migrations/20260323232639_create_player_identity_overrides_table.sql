/*
  # Create player_identity_overrides table

  ## Purpose
  Permanent override layer to correct API mislabelling of player identities.
  When the upstream API delivers wrong player names for a given player_id,
  this table acts as the canonical source of truth that wins over all other sources.

  ## New Table
  - `afl.player_identity_overrides`
    - player_id (PK): the API-assigned player_id (may be mislabelled)
    - player_name: the CORRECT real player name
    - team_id: the correct team id
    - team_name: the correct team name
    - position: the correct position
    - updated_at: last override update timestamp

  ## Security
  - RLS enabled, service_role only for writes
  - Authenticated read allowed (needed by views)

  ## Known Overrides Being Inserted
  - player_id 1944 → Matthew Flynn (West Coast Eagles, RUC)
    The API incorrectly labels this player as "Jonty Faull" in players_raw.
    The real player at WCE is Matthew Flynn.
  - player_id 1942 → Jonty Faull (Richmond Tigers, FWD)
    This is the correct Jonty Faull at Richmond. Confirmed correct identity.
*/

CREATE TABLE IF NOT EXISTS afl.player_identity_overrides (
  player_id   INT PRIMARY KEY,
  player_name TEXT NOT NULL,
  team_id     INT,
  team_name   TEXT,
  position    TEXT,
  notes       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE afl.player_identity_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_overrides"
  ON afl.player_identity_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_overrides"
  ON afl.player_identity_overrides
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "anon_read_overrides"
  ON afl.player_identity_overrides
  FOR SELECT
  TO anon
  USING (true);

INSERT INTO afl.player_identity_overrides (player_id, player_name, team_id, team_name, position, notes)
VALUES
  (1944, 'Matthew Flynn', 15, 'West Coast Eagles', 'RUC',
   'API mislabels this player_id as Jonty Faull. Real player is Matthew Flynn (WCE).'),
  (1942, 'Jonty Faull',   12, 'Richmond Tigers',   'FWD',
   'Confirmed correct identity. Jonty Faull plays for Richmond Tigers.')
ON CONFLICT (player_id) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  team_id     = EXCLUDED.team_id,
  team_name   = EXCLUDED.team_name,
  position    = EXCLUDED.position,
  notes       = EXCLUDED.notes,
  updated_at  = now();
