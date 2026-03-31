/*
  # Phase 3: Player Lab Composite Views

  Creates 6 signal-based views for the Player Lab, joining player_rankings_cache
  with player_signal_summary for enriched composite intelligence panels.

  ## Views Created
  1. public.v_player_lab_best_buys       — Top value buy candidates
  2. public.v_player_lab_risky_traps     — High risk / avoid candidates
  3. public.v_player_lab_breakout        — Breakout probability candidates
  4. public.v_player_lab_safe_picks      — Floor-heavy consistent picks
  5. public.v_player_lab_high_upside     — Ceiling-heavy POD/captain options
  6. public.v_player_lab_signals         — Full player signal detail view

  All views are SECURITY DEFINER and anon-readable.
*/

-- ─── 1. Best Buys ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_best_buys;
CREATE OR REPLACE VIEW public.v_player_lab_best_buys
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.projection_final::numeric, r.projection::numeric)  AS projection,
  r.ceiling_estimate                                             AS ceiling,
  r.price,
  r.value_score,
  r.neeko_rating,
  r.form_score,
  r.consistency,
  r.matchup_label,
  r.recommendation_short,
  r.recommendation_color,
  r.confidence_label,
  ss.buy_score,
  ss.risk_score,
  ss.opportunity_score,
  ss.total_score,
  ss.signal_count,
  ss.signal_tags,
  ss.composite_label
FROM afl.player_rankings_cache r
JOIN afl.player_signal_summary ss USING (player_id)
WHERE ss.buy_score >= 55
  AND ss.risk_score < 50
  AND COALESCE(r.price, 0) > 0
ORDER BY ss.buy_score DESC, r.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_player_lab_best_buys TO anon, authenticated;

-- ─── 2. Risky Traps ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_risky_traps;
CREATE OR REPLACE VIEW public.v_player_lab_risky_traps
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.projection_final::numeric, r.projection::numeric)  AS projection,
  r.floor_estimate                                               AS floor,
  r.price,
  r.value_score,
  r.neeko_rating,
  r.form_score,
  r.consistency,
  r.matchup_label,
  r.recommendation_short,
  r.recommendation_color,
  r.confidence_label,
  ss.sell_score,
  ss.risk_score,
  ss.total_score,
  ss.signal_count,
  ss.signal_tags,
  ss.composite_label
FROM afl.player_rankings_cache r
JOIN afl.player_signal_summary ss USING (player_id)
WHERE (ss.sell_score >= 52 OR ss.risk_score >= 55)
  AND COALESCE(r.price, 0) >= 150000
ORDER BY ss.risk_score DESC, ss.sell_score DESC NULLS LAST;

GRANT SELECT ON public.v_player_lab_risky_traps TO anon, authenticated;

-- ─── 3. Breakout Candidates ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_breakout;
CREATE OR REPLACE VIEW public.v_player_lab_breakout
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.projection_final::numeric, r.projection::numeric)  AS projection,
  r.ceiling_estimate                                             AS ceiling,
  r.price,
  r.value_score,
  r.neeko_rating,
  r.form_score,
  r.upside_pct,
  r.matchup_label,
  r.recommendation_short,
  r.recommendation_color,
  bm.breakout_probability,
  bm.breakout_index,
  bm.ceiling_hit_rate,
  bm.recent_trend,
  ss.buy_score,
  ss.opportunity_score,
  ss.risk_score,
  ss.total_score,
  ss.signal_tags,
  ss.composite_label
FROM afl.player_rankings_cache r
JOIN afl.player_signal_summary ss USING (player_id)
LEFT JOIN afl.player_breakout_model bm USING (player_id)
WHERE (
  'breakout_candidate' = ANY(ss.signal_tags)
  OR 'breakout_value' = ANY(ss.signal_tags)
)
AND COALESCE(bm.breakout_probability, 0) >= 0.30
ORDER BY bm.breakout_probability DESC NULLS LAST, ss.opportunity_score DESC;

GRANT SELECT ON public.v_player_lab_breakout TO anon, authenticated;

-- ─── 4. Safe Picks ────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_safe_picks;
CREATE OR REPLACE VIEW public.v_player_lab_safe_picks
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.projection_final::numeric, r.projection::numeric)  AS projection,
  r.ceiling_estimate                                             AS ceiling,
  r.floor_estimate                                               AS floor,
  r.price,
  r.neeko_rating,
  r.consistency,
  r.form_score,
  r.matchup_label,
  r.recommendation_short,
  r.recommendation_color,
  r.confidence_label,
  ss.risk_score,
  ss.buy_score,
  ss.total_score,
  ss.signal_count,
  ss.signal_tags,
  ss.composite_label
FROM afl.player_rankings_cache r
JOIN afl.player_signal_summary ss USING (player_id)
WHERE (
  'floor_heavy' = ANY(ss.signal_tags)
  OR 'high_consistency' = ANY(ss.signal_tags)
)
AND ss.risk_score < 40
AND COALESCE(r.consistency, 0) >= 0.55
ORDER BY r.consistency DESC NULLS LAST, r.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_player_lab_safe_picks TO anon, authenticated;

-- ─── 5. High Upside ───────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_high_upside;
CREATE OR REPLACE VIEW public.v_player_lab_high_upside
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.projection_final::numeric, r.projection::numeric)  AS projection,
  r.ceiling_estimate                                             AS ceiling,
  r.price,
  r.neeko_rating,
  r.upside_pct,
  r.captain_score,
  r.captain_rating,
  r.form_score,
  r.matchup_label,
  r.recommendation_short,
  r.recommendation_color,
  ss.buy_score,
  ss.opportunity_score,
  ss.risk_score,
  ss.total_score,
  ss.signal_tags,
  ss.composite_label
FROM afl.player_rankings_cache r
JOIN afl.player_signal_summary ss USING (player_id)
WHERE 'ceiling_heavy' = ANY(ss.signal_tags)
  AND ss.buy_score >= 45
ORDER BY r.upside_pct DESC NULLS LAST, r.ceiling_estimate DESC NULLS LAST;

GRANT SELECT ON public.v_player_lab_high_upside TO anon, authenticated;

-- ─── 6. Signal Detail View ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_player_lab_signals;
CREATE OR REPLACE VIEW public.v_player_lab_signals
WITH (security_invoker = false)
AS
SELECT
  ps.id,
  ps.player_id,
  r.player_name,
  r.team,
  r.position,
  ps.signal_type,
  ps.signal_score,
  ps.signal_strength,
  ps.signal_direction,
  ps.explanation,
  ps.confidence,
  ps.metadata,
  ps.created_at
FROM afl.player_signals ps
JOIN afl.player_rankings_cache r USING (player_id)
WHERE ps.snapshot_id IS NULL
   OR ps.snapshot_id = (
     SELECT snapshot_id FROM admin.snapshots WHERE is_live = true
     ORDER BY created_at DESC LIMIT 1
   )
ORDER BY ps.player_id, ps.signal_type;

GRANT SELECT ON public.v_player_lab_signals TO anon, authenticated;
