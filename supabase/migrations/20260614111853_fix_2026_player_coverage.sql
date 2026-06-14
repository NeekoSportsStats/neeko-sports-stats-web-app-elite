
-- ================================================================
-- 2026 Player Coverage Fix
-- Fixes: inactive flags, missing projection rows, wrong player names
-- Safe UPSERTs only — no deletion of raw data, no fake projections
-- Fingerprint-conflict duplicates (#2080, #1909) intentionally excluded
-- ================================================================


-- ── 1. Insert players present in 2026 raw stats but missing from afl.players ──

INSERT INTO afl.players (player_id, player_name, position_group, active)
SELECT DISTINCT ON (r.player_id)
  r.player_id,
  MAX(r.player_name) OVER (PARTITION BY r.player_id),
  NULL,
  true
FROM afl.raw_player_stats r
WHERE r.season = 2026
  AND r.player_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM afl.players p WHERE p.player_id = r.player_id)
ON CONFLICT (player_id) DO NOTHING;


-- ── 2. Fix wrong player name for identity-overridden players ─────────────────
-- Only update afl.players entries that have incorrect/placeholder names
-- where the override confirms the real identity

UPDATE afl.players pl
SET player_name    = ov.player_name,
    position_group = COALESCE(ov.position, pl.position_group)
FROM afl.player_identity_overrides ov
WHERE ov.player_id = pl.player_id
  AND ov.player_name IS NOT NULL
  AND ov.player_name NOT LIKE 'Player#%'
  AND (pl.player_name LIKE 'Player#%' OR pl.player_name != ov.player_name)
  -- Only apply when override was set via confirmed manual review
  AND ov.source IN ('seed_correction', 'manual_review_confirmed', 'manual_verified', 'manual_admin', 'unknown_review')
  -- Never overwrite correct names for identity-conflict duplicates
  AND pl.player_id NOT IN (2080);


-- ── 3. Reactivate players with ≥ 5 confirmed 2026 games ─────────────────────
-- Skips identity-conflict duplicate #1909 (Tom Hanily dupe of #1872)

UPDATE afl.players
SET active = true
WHERE player_id IN (
  SELECT r.player_id
  FROM afl.raw_player_stats r
  WHERE r.season = 2026
  GROUP BY r.player_id
  HAVING COUNT(*) >= 5
)
AND active = false
AND COALESCE(manual_status, '') NOT IN ('delisted', 'retired')
AND player_id NOT IN (1909);


-- ── 4. Update stale projections that are too low for the > 30 cache filter ───
-- Only where projection_final < 30 but the player has solid 2026 form
-- This fixes players like Harry Sharp (proj=25.93, avg=60) being dropped

UPDATE afl.player_projection pp
SET projection_final  = ROUND(fpf.form_score::numeric, 1),
    form_rating       = ROUND(fpf.form_score::numeric, 1),
    ceiling           = GREATEST(COALESCE(pp.ceiling, 0), COALESCE(fpf.ceiling, 0)),
    floor             = LEAST(
                          COALESCE(pp.floor, fpf.floor::numeric),
                          COALESCE(fpf.floor::numeric, pp.floor)
                        ),
    volatility_score  = COALESCE(fpf.volatility, pp.volatility_score),
    stability_score   = ROUND(
                          LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(fpf.volatility::numeric, 50.0))),
                          1
                        ),
    generated_at      = now()
FROM afl.feature_player_form fpf
JOIN afl.players pl ON pl.player_id = fpf.player_id AND pl.active = true
WHERE fpf.player_id = pp.player_id
  AND pp.projection_final < 30
  AND fpf.form_score::numeric >= 30
  AND fpf.games_played >= 3;


-- ── 5. Bootstrap player_projection for active players with form but no row ───
-- Sources projection_final from form_score (form-weighted season avg)
-- Confidence scaled by games played; pipeline engine will refine on next run
-- Excludes #2080 (Caldwell) — active duplicate of #1567, would create duplicate entry

INSERT INTO afl.player_projection (
  player_id, projection_final, ceiling, floor,
  form_rating, consistency_score, risk_rating, projection_confidence,
  volatility_score, stability_score, generated_at
)
SELECT
  fpf.player_id,
  ROUND(fpf.form_score::numeric, 1)                                           AS projection_final,
  COALESCE(fpf.ceiling, ROUND(fpf.form_score::numeric * 1.3)::integer)        AS ceiling,
  COALESCE(fpf.floor::numeric, ROUND(fpf.form_score::numeric * 0.7, 0))       AS floor,
  ROUND(fpf.form_score::numeric, 1)                                           AS form_rating,
  ROUND(COALESCE(fpf.consistency::numeric, 50.0), 1)                          AS consistency_score,
  'MEDIUM'                                                                    AS risk_rating,
  CASE
    WHEN fpf.games_played >= 8 THEN 55.0
    WHEN fpf.games_played >= 5 THEN 45.0
    WHEN fpf.games_played >= 3 THEN 35.0
    ELSE 25.0
  END                                                                         AS projection_confidence,
  COALESCE(fpf.volatility::numeric, 50.0)                                     AS volatility_score,
  ROUND(
    LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(fpf.volatility::numeric, 50.0))),
    1
  )                                                                           AS stability_score,
  now()
FROM afl.feature_player_form fpf
JOIN afl.players pl ON pl.player_id = fpf.player_id AND pl.active = true
JOIN afl.v_current_player_team vcpt ON vcpt.player_id = fpf.player_id
WHERE NOT EXISTS (
  SELECT 1 FROM afl.player_projection pp WHERE pp.player_id = fpf.player_id
)
AND fpf.form_score IS NOT NULL
AND fpf.games_played >= 1
-- Exclude fingerprint-conflict duplicate (Caldwell dupe of #1567)
AND fpf.player_id NOT IN (2080)
ON CONFLICT (player_id) DO NOTHING;


-- ── 6. Refresh materialized views and cache (non-concurrent, safe in migration)

DO $$
BEGIN
  EXECUTE 'REFRESH MATERIALIZED VIEW afl.mv_player_projection';
  EXECUTE 'REFRESH MATERIALIZED VIEW afl.mv_player_rankings';
  PERFORM public.fn_populate_player_rankings_cache();
  INSERT INTO public.system_logs (event_type, source, log_level, message, created_at)
  VALUES (
    'coverage_fix', 'migration_fix_2026_player_coverage', 'info',
    '2026 player coverage fix applied and cache refreshed successfully',
    now()
  ) ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message, created_at)
  VALUES (
    'coverage_fix', 'migration_fix_2026_player_coverage', 'warn',
    '2026 coverage fix applied; deferred cache refresh — ' || SQLERRM,
    now()
  ) ON CONFLICT DO NOTHING;
END $$;
