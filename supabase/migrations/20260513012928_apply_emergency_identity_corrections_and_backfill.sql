/*
  # Apply Emergency Identity Corrections + Backfill Downstream Tables

  ## What this migration does

  ### 1. Fixes player_id 1846 — Riley Thilthorpe
  - Updates afl.players: name "Joel Freijah" → "Riley Thilthorpe", position FWD, active true
  - Backfills afl.raw_player_stats 2026 with correct name
  - Backfills afl.player_games 2026 with correct name

  ### 2. Fixes player_id 955 — Jamarra Ugle-Hagan
  - Inserts into afl.players (was completely missing, causing Player#955 fallback)
  - Backfills afl.raw_player_stats 2026 with correct name
  - Backfills afl.player_games 2026 with correct name

  ### 3. Fixes 2065/2066/2067 — Matt Hill, Zane Peucker, Christopher Scerri
  - These exist in afl.players with correct names but have early-season
    placeholder rows in raw_player_stats (Week 2). Propagate correct names.

  ### 4. Inserts stub rows for all remaining placeholder player_ids
  - Prevents Player# fallback in fn_sync_player_games_from_raw
  - Stubs carry the placeholder name until real name data arrives

  ### 5. Marks affected players as needing AI regen
  - Any player whose name changed has stale AI content

  ## Notes
  - This is a one-time backfill. Going forward, sync_afl_player_identity()
    runs automatically at the start of every pipeline run.
  - The real Joel Freijah (player_id 1807, Western Bulldogs) is NOT touched.
*/

-- ── Fix 1: player_id 1846 → Riley Thilthorpe ────────────────────────────────

UPDATE afl.players
SET
  player_name    = 'Riley Thilthorpe',
  position_group = 'FWD',
  active         = true
WHERE player_id = 1846;

UPDATE afl.raw_player_stats
SET player_name = 'Riley Thilthorpe'
WHERE player_id = 1846
  AND season = 2026;

UPDATE afl.player_games
SET player_name = 'Riley Thilthorpe'
WHERE player_id = 1846
  AND season = 2026;

-- ── Fix 2: player_id 955 → Jamarra Ugle-Hagan ───────────────────────────────

INSERT INTO afl.players (player_id, player_name, position_group, active)
VALUES (955, 'Jamarra Ugle-Hagan', 'FWD', true)
ON CONFLICT (player_id) DO UPDATE
  SET player_name    = 'Jamarra Ugle-Hagan',
      position_group = 'FWD',
      active         = true;

UPDATE afl.raw_player_stats
SET player_name = 'Jamarra Ugle-Hagan'
WHERE player_id = 955
  AND season = 2026;

UPDATE afl.player_games
SET player_name = 'Jamarra Ugle-Hagan'
WHERE player_id = 955
  AND season = 2026;

-- ── Fix 3: Propagate correct names for 2065/2066/2067 ───────────────────────
-- Matt Hill (2065), Zane Peucker (2066), Christopher Scerri (2067)
-- These have correct names in afl.players but placeholder rows in raw_player_stats

UPDATE afl.raw_player_stats r
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = r.player_id
  AND r.player_id IN (2065, 2066, 2067)
  AND r.season = 2026
  AND r.player_name ILIKE 'Player#%'
  AND p.player_name NOT ILIKE 'Player#%';

UPDATE afl.player_games pg
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = pg.player_id
  AND pg.player_id IN (2065, 2066, 2067)
  AND pg.season = 2026
  AND pg.player_name ILIKE 'Player#%'
  AND p.player_name NOT ILIKE 'Player#%';

-- ── Fix 4: Insert stub rows for all remaining missing player_ids ─────────────
-- These are the 25 player_ids seen in raw_player_stats with no afl.players row.
-- We insert with the placeholder name as-is — at least the FK resolves.
-- Real names come via sync_afl_player_identity() when provider data arrives.

INSERT INTO afl.players (player_id, player_name, position_group, active)
SELECT DISTINCT
  r.player_id,
  r.player_name,
  NULL,
  true
FROM afl.raw_player_stats r
LEFT JOIN afl.players p ON p.player_id = r.player_id
WHERE p.player_id IS NULL
  AND r.season = 2026
ON CONFLICT (player_id) DO NOTHING;

-- ── Fix 5: Propagate all corrected names from afl.players back to raw+games ──
-- Catches any player where afl.players has a real name but raw/games still has placeholder

UPDATE afl.raw_player_stats r
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = r.player_id
  AND r.season = 2026
  AND r.player_name ILIKE 'Player#%'
  AND p.player_name NOT ILIKE 'Player#%'
  AND p.player_name IS NOT NULL;

UPDATE afl.player_games pg
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = pg.player_id
  AND pg.season = 2026
  AND pg.player_name ILIKE 'Player#%'
  AND p.player_name NOT ILIKE 'Player#%'
  AND p.player_name IS NOT NULL;

-- ── Fix 6: Add emergency corrections to player_identity_overrides ────────────
-- Ensures these survive any future full reset of afl.players

INSERT INTO afl.player_identity_overrides (
  player_id, player_name, team_id, team_name, position, notes, updated_at
) VALUES
  (1846, 'Riley Thilthorpe', 1, 'Adelaide Crows', 'FWD',
   'API/seed data incorrectly mapped this provider ID to Joel Freijah. Real Joel Freijah = player_id 1807 (Western Bulldogs). This ID is Riley Thilthorpe, Adelaide Crows FWD/RUC.',
   now()),
  (955, 'Jamarra Ugle-Hagan', 17, 'Gold Coast Suns', 'FWD',
   'Provider ID 955 was missing from afl.players entirely, causing Player#955 fallback. Jamarra Ugle-Hagan returned from injury in Week 7 2026 for Gold Coast Suns.',
   now())
ON CONFLICT (player_id) DO UPDATE
  SET player_name = EXCLUDED.player_name,
      team_id     = EXCLUDED.team_id,
      team_name   = EXCLUDED.team_name,
      position    = EXCLUDED.position,
      notes       = EXCLUDED.notes,
      updated_at  = now();

-- ── Fix 7: Mark name-corrected players as needing AI regen ───────────────────
-- player_id 1846 (Thilthorpe) and 955 (Jamarra) had wrong/missing names in AI content

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ai' AND table_name = 'player_analysis'
  ) THEN
    UPDATE ai.player_analysis
    SET needs_regen   = true,
        generated_at  = NULL,
        ai_summary    = NULL,
        summary_short = NULL,
        input_hash    = NULL
    WHERE player_id IN (955, 1846);
  END IF;
END $$;

-- ── Audit: Log this one-time correction ──────────────────────────────────────
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'player_identity_backfill',
  'migration:apply_emergency_identity_corrections',
  'info',
  'Emergency identity corrections applied: 1846→Riley Thilthorpe, 955→Jamarra Ugle-Hagan. Stubs inserted for remaining placeholder player_ids.',
  jsonb_build_object(
    'corrections', ARRAY['1846=Riley Thilthorpe', '955=Jamarra Ugle-Hagan'],
    'propagated_to', ARRAY['afl.players', 'afl.raw_player_stats', 'afl.player_games', 'afl.player_identity_overrides', 'ai.player_analysis'],
    'applied_at', now()
  )
);
