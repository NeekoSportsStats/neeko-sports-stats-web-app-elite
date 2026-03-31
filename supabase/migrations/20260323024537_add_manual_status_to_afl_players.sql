
/*
  # Add manual_status to afl.players

  ## Summary
  Adds an admin-controlled injury/availability override to the canonical player table.

  ## New Column
  - `afl.players.manual_status` (text, nullable)
    Allowed values: 'OUT', 'INJURED', 'TEST', NULL (= available / no override)
    NULL is the default — no override.

  ## Behaviour
  - When set, manual_status takes priority over API-ingested status
  - Does NOT affect AI input_hash — never triggers AI regeneration
  - Admin writes via admin-command edge function

  ## Security
  - RLS already enabled on afl.players
  - Only service_role (admin-command) can write to this column
*/

ALTER TABLE afl.players
ADD COLUMN IF NOT EXISTS manual_status text;

-- Constraint: only allow valid values (or NULL)
ALTER TABLE afl.players
DROP CONSTRAINT IF EXISTS chk_players_manual_status;

ALTER TABLE afl.players
ADD CONSTRAINT chk_players_manual_status
CHECK (manual_status IN ('OUT', 'INJURED', 'TEST') OR manual_status IS NULL);

-- Index for fast lookups of non-available players
CREATE INDEX IF NOT EXISTS idx_players_manual_status_non_null
ON afl.players (manual_status)
WHERE manual_status IS NOT NULL;
