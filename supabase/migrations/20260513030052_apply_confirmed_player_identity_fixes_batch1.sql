
/*
  # Apply Confirmed Manual Player Identity Fixes — Batch 1

  ## Players corrected
  - player_id 1107: Player#1107 → Nic Newman (Carlton Blues, DEF, #24)
  - player_id 2091: Player#2091 → Sam Cumming (Richmond Tigers, MID, #22)
  - player_id 2073: Player#2073 → Patrick Retschko (Richmond Tigers, MID, #33)
  - player_id 2080: Player#2080 → Jye Caldwell (Essendon Bombers, MID, #9)
  - player_id 2074: Player#2074 → Angus Anderson (Collingwood Magpies, FWD, #41)

  ## Changes
  1. afl.players — set correct player_name, position_group, active=true
  2. afl.player_identity_overrides — upsert with confirmed identity data
  3. afl.raw_player_stats — propagate corrected names
  4. afl.player_games — propagate corrected names
  5. afl.players_raw — propagate corrected names where present
  6. public.ai_player_analysis — clear stale AI content
  7. afl.player_rankings_cache — clear stale summaries
  8. public.player_rankings_cache — clear stale summaries
  9. public.player_identity_anomalies — mark resolved

  ## Security
  - No RLS changes; existing policies apply
*/

-- ─── STEP 1: Update afl.players ───────────────────────────────────────────────

UPDATE afl.players SET
  player_name    = 'Nic Newman',
  position_group = 'DEF',
  active         = true,
  manual_status  = NULL
WHERE player_id = 1107;

UPDATE afl.players SET
  player_name    = 'Sam Cumming',
  position_group = 'MID',
  active         = true,
  manual_status  = NULL
WHERE player_id = 2091;

UPDATE afl.players SET
  player_name    = 'Patrick Retschko',
  position_group = 'MID',
  active         = true,
  manual_status  = NULL
WHERE player_id = 2073;

UPDATE afl.players SET
  player_name    = 'Jye Caldwell',
  position_group = 'MID',
  active         = true,
  manual_status  = NULL
WHERE player_id = 2080;

UPDATE afl.players SET
  player_name    = 'Angus Anderson',
  position_group = 'FWD',
  active         = true,
  manual_status  = NULL
WHERE player_id = 2074;

-- ─── STEP 2: Upsert player_identity_overrides ─────────────────────────────────

INSERT INTO afl.player_identity_overrides
  (player_id, player_name, team_id, team_name, position, notes, updated_at)
VALUES
  (1107, 'Nic Newman',       3,  'Carlton Blues',       'DEF', 'Manually confirmed 2026-05-13: Nic Newman (#24, DEF). Source: manual_review_confirmed — 2026 AFL lists + jumper audit.', now()),
  (2091, 'Sam Cumming',      12, 'Richmond Tigers',     'MID', 'Manually confirmed 2026-05-13: Sam Cumming (#22, MID). Source: manual_review_confirmed — 2026 AFL lists + jumper audit.', now()),
  (2073, 'Patrick Retschko', 12, 'Richmond Tigers',     'MID', 'Manually confirmed 2026-05-13: Patrick Retschko (#33, MID). Source: manual_review_confirmed — 2026 AFL lists + jumper audit.', now()),
  (2080, 'Jye Caldwell',     5,  'Essendon Bombers',   'MID', 'Manually confirmed 2026-05-13: Jye Caldwell (#9, MID). Source: manual_review_confirmed — 2026 AFL lists + jumper audit.', now()),
  (2074, 'Angus Anderson',   4,  'Collingwood Magpies', 'FWD', 'Manually confirmed 2026-05-13: Angus Anderson (#41, FWD). Source: manual_review_confirmed — 2026 AFL lists + jumper audit.', now())
ON CONFLICT (player_id) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  team_id     = EXCLUDED.team_id,
  team_name   = EXCLUDED.team_name,
  position    = EXCLUDED.position,
  notes       = EXCLUDED.notes,
  updated_at  = EXCLUDED.updated_at;

-- ─── STEP 3: Propagate corrected names — afl.raw_player_stats ─────────────────

UPDATE afl.raw_player_stats SET player_name = 'Nic Newman'       WHERE player_id = 1107;
UPDATE afl.raw_player_stats SET player_name = 'Sam Cumming'      WHERE player_id = 2091;
UPDATE afl.raw_player_stats SET player_name = 'Patrick Retschko' WHERE player_id = 2073;
UPDATE afl.raw_player_stats SET player_name = 'Jye Caldwell'     WHERE player_id = 2080;
UPDATE afl.raw_player_stats SET player_name = 'Angus Anderson'   WHERE player_id = 2074;

-- ─── STEP 4: Propagate corrected names — afl.player_games ─────────────────────

UPDATE afl.player_games SET player_name = 'Nic Newman'       WHERE player_id = 1107;
UPDATE afl.player_games SET player_name = 'Sam Cumming'      WHERE player_id = 2091;
UPDATE afl.player_games SET player_name = 'Patrick Retschko' WHERE player_id = 2073;
UPDATE afl.player_games SET player_name = 'Jye Caldwell'     WHERE player_id = 2080;
UPDATE afl.player_games SET player_name = 'Angus Anderson'   WHERE player_id = 2074;

-- ─── STEP 5: Propagate corrected names — afl.players_raw ──────────────────────

UPDATE afl.players_raw SET
  player_name = 'Nic Newman',
  raw_json    = jsonb_set(raw_json, '{name}', '"Nic Newman"')
WHERE player_id = 1107;

UPDATE afl.players_raw SET
  player_name = 'Sam Cumming',
  raw_json    = jsonb_set(raw_json, '{name}', '"Sam Cumming"')
WHERE player_id = 2091;

UPDATE afl.players_raw SET
  player_name = 'Patrick Retschko',
  raw_json    = jsonb_set(raw_json, '{name}', '"Patrick Retschko"')
WHERE player_id = 2073;

UPDATE afl.players_raw SET
  player_name = 'Jye Caldwell',
  raw_json    = jsonb_set(raw_json, '{name}', '"Jye Caldwell"')
WHERE player_id = 2080;

UPDATE afl.players_raw SET
  player_name = 'Angus Anderson',
  raw_json    = jsonb_set(raw_json, '{name}', '"Angus Anderson"')
WHERE player_id = 2074;

-- ─── STEP 6: Clear stale AI content — public.ai_player_analysis ───────────────

UPDATE public.ai_player_analysis SET
  player_name = 'Nic Newman',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 1107;

UPDATE public.ai_player_analysis SET
  player_name = 'Sam Cumming',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 2091;

UPDATE public.ai_player_analysis SET
  player_name = 'Patrick Retschko',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 2073;

UPDATE public.ai_player_analysis SET
  player_name = 'Jye Caldwell',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 2080;

UPDATE public.ai_player_analysis SET
  player_name = 'Angus Anderson',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 2074;

-- Guard: stamp needs_regen if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_player_analysis' AND column_name = 'needs_regen'
  ) THEN
    UPDATE public.ai_player_analysis SET needs_regen = true
    WHERE player_id IN (1107, 2091, 2073, 2080, 2074);
  END IF;
END $$;

-- ─── STEP 7: Clear stale summaries — afl.player_rankings_cache ────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
  ) THEN
    UPDATE afl.player_rankings_cache SET
      player_name  = CASE player_id
        WHEN 1107 THEN 'Nic Newman'
        WHEN 2091 THEN 'Sam Cumming'
        WHEN 2073 THEN 'Patrick Retschko'
        WHEN 2080 THEN 'Jye Caldwell'
        WHEN 2074 THEN 'Angus Anderson'
      END,
      ai_summary    = NULL,
      summary_short = NULL,
      summary_long  = NULL
    WHERE player_id IN (1107, 2091, 2073, 2080, 2074);
  END IF;
END $$;

-- ─── STEP 8: Clear stale summaries — public.player_rankings_cache ─────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'player_rankings_cache'
  ) THEN
    UPDATE public.player_rankings_cache SET
      player_name   = CASE player_id
        WHEN 1107 THEN 'Nic Newman'
        WHEN 2091 THEN 'Sam Cumming'
        WHEN 2073 THEN 'Patrick Retschko'
        WHEN 2080 THEN 'Jye Caldwell'
        WHEN 2074 THEN 'Angus Anderson'
      END,
      summary_short = NULL,
      summary_long  = NULL
    WHERE player_id IN (1107, 2091, 2073, 2080, 2074);
  END IF;
END $$;

-- ─── STEP 9: Mark anomalies resolved ──────────────────────────────────────────

UPDATE public.player_identity_anomalies SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(notes, '') || ' | RESOLVED 2026-05-13: identity manually confirmed from 2026 AFL lists + jumper audit.'
WHERE player_id IN (1107, 2091, 2073, 2080, 2074)
  AND status != 'resolved';
