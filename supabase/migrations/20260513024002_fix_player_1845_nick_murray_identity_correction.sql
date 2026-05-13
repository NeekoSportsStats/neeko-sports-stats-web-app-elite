/*
  # Fix player_id 1845: rename "Zac Taylor" → "Nick Murray"

  ## Summary
  Deep forensic audit confirmed player_id 1845 is Nick Murray (Adelaide Crows, #9, Defender),
  NOT a second Zac Taylor. The upstream AFL stats API returns the wrong name for this player_id.

  ## Evidence (99% confidence)
  - Official 2026 AFL squad (FootyWire, DraftGuru): jersey #9 = Nick Murray, jersey #19 = Zac Taylor
  - player_id 1845: 9 games, 2 goals, jersey #9 — matches Nick Murray's official 2026 record exactly
  - player_id 1819 (jersey #19, "Zac Taylor") is confirmed correct
  - Both appear simultaneously in 17+ matches with distinct stat lines
  - Root cause: upstream API returns "Zac Taylor" for player_id 1845 — provider-side data error

  ## Tables Updated
  1. afl.players — rename + fix position_group to DEF
  2. afl.players_raw — fix both season records
  3. afl.player_games — fix all historical game records
  4. afl.raw_player_stats — fix player_name column
  5. afl.player_rankings_cache — fix name + clear AI text
  6. public.player_rankings_cache — fix name + clear AI text
  7. afl.player_identity_overrides — update note
  8. public.player_identity_anomalies — mark as resolved
  9. public.ai_player_analysis — clear stale content, force regen
  10. Refresh anomalies
*/

-- STEP 1: Rename in afl.players (source of truth)
UPDATE afl.players
SET 
  player_name    = 'Nick Murray',
  position_group = 'DEF'
WHERE player_id = 1845;

-- STEP 2: Update afl.players_raw (API mirror — override the wrong API name)
UPDATE afl.players_raw
SET 
  player_name = 'Nick Murray',
  raw_json    = jsonb_set(raw_json, '{name}', '"Nick Murray"')
WHERE player_id = 1845;

-- STEP 3: Update afl.player_games (all seasons)
UPDATE afl.player_games
SET player_name = 'Nick Murray'
WHERE player_id = 1845;

-- STEP 4: Update afl.raw_player_stats player_name column (all seasons)
UPDATE afl.raw_player_stats
SET player_name = 'Nick Murray'
WHERE player_id = 1845;

-- STEP 5: Update afl.player_rankings_cache — clear AI text (name was wrong in generated content)
UPDATE afl.player_rankings_cache
SET 
  player_name   = 'Nick Murray',
  ai_summary    = NULL,
  summary_short = NULL,
  summary_long  = NULL
WHERE player_id = 1845;

-- STEP 6: Update public.player_rankings_cache — clear AI text
UPDATE public.player_rankings_cache
SET 
  player_name   = 'Nick Murray',
  summary_short = NULL,
  summary_long  = NULL
WHERE player_id = 1845;

-- STEP 7: Update afl.player_identity_overrides — correct the note
UPDATE afl.player_identity_overrides
SET 
  player_name = 'Nick Murray',
  position    = 'DEF',
  notes       = 'IDENTITY CORRECTED 2026-05-13: player_id 1845 is Nick Murray (#9, DEF, Adelaide Crows). Upstream AFL API returns wrong name "Zac Taylor" for this player_id. Corrected in all tables. player_id 1819 remains Zac Taylor (#19, FWD). No merge needed — distinct players.',
  updated_at  = now()
WHERE player_id = 1845;

-- STEP 8: Mark anomaly as resolved
UPDATE public.player_identity_anomalies
SET 
  status      = 'resolved',
  resolved_at = now(),
  notes       = 'RESOLVED 2026-05-13: player_id 1845 correctly identified as Nick Murray (#9, DEF, Adelaide Crows). Upstream API name error corrected in all tables. Identity gate will clear on next validation run.'
WHERE player_id = 1845 AND anomaly_type = 'dual_identity';

-- STEP 9: Clear stale AI content (name was wrong — force regeneration)
-- ai_player_analysis columns: player_id, player_name, team, analysis, input_hash, generated_at, updated_at, snapshot_id
UPDATE public.ai_player_analysis
SET 
  player_name = 'Nick Murray',
  analysis    = NULL,
  input_hash  = NULL,
  updated_at  = now()
WHERE player_id = 1845;

-- STEP 10: Also update ai_player_analysis.needs_regen if that column exists (guard with DO block)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_player_analysis' AND table_schema = 'public' AND column_name = 'needs_regen'
  ) THEN
    UPDATE public.ai_player_analysis SET needs_regen = true WHERE player_id = 1845;
  END IF;
END $$;

-- STEP 11: Refresh anomalies — recheck will now find 0 dual_identity anomalies
SELECT public.refresh_player_identity_anomalies();
