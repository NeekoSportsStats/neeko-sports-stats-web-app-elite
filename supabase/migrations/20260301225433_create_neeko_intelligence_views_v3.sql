/*
  # Neeko Intel Phase 2 — Intelligence Engine Views (final)

  Five specialist views on v_rankings_master:
    v_neeko_matchup_difficulty
    v_neeko_volatility
    v_neeko_captain_tiers
    v_neeko_breakout_engine
    v_neeko_avoid_traps

  Plus v_neeko_intel_master_v2 which merges them all.

  NOTE: v_neeko_intel_master already contains matchup_rating via SELECT *.
  The sub-views are kept lightweight; only NEW derived columns are pulled
  into master_v2 to avoid duplicate-column errors.
*/

-- ── 1. Matchup Difficulty ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_matchup_difficulty
WITH (security_invoker = false)
AS
SELECT
  player_id,
  CASE
    WHEN matchup_rating::numeric >= 80 THEN 'VERY EASY'
    WHEN matchup_rating::numeric >= 65 THEN 'EASY'
    WHEN matchup_rating::numeric >= 50 THEN 'NEUTRAL'
    WHEN matchup_rating::numeric >= 35 THEN 'HARD'
    ELSE 'VERY HARD'
  END AS matchup_difficulty
FROM public.v_rankings_master
WHERE matchup_rating IS NOT NULL;

GRANT SELECT ON public.v_neeko_matchup_difficulty TO anon, authenticated;


-- ── 2. Volatility ──────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_volatility
WITH (security_invoker = false)
AS
SELECT
  player_id,
  ROUND((ceiling_estimate::numeric - floor_estimate::numeric), 1) AS volatility_score,
  CASE
    WHEN (ceiling_estimate::numeric - floor_estimate::numeric) >= 50 THEN 'EXTREME'
    WHEN (ceiling_estimate::numeric - floor_estimate::numeric) >= 35 THEN 'HIGH'
    WHEN (ceiling_estimate::numeric - floor_estimate::numeric) >= 25 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS volatility_level
FROM public.v_rankings_master
WHERE ceiling_estimate IS NOT NULL AND floor_estimate IS NOT NULL;

GRANT SELECT ON public.v_neeko_volatility TO anon, authenticated;


-- ── 3. Captain Tiers ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_captain_tiers
WITH (security_invoker = false)
AS
SELECT
  player_id,
  CASE
    WHEN captain_score::numeric >= 125 THEN 'ELITE'
    WHEN captain_score::numeric >= 110 THEN 'STRONG'
    WHEN captain_score::numeric >= 95  THEN 'SAFE'
    ELSE 'RISKY'
  END AS captain_tier
FROM public.v_rankings_master
WHERE captain_score IS NOT NULL;

GRANT SELECT ON public.v_neeko_captain_tiers TO anon, authenticated;


-- ── 4. Breakout Engine ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_breakout_engine
WITH (security_invoker = false)
AS
SELECT
  player_id,
  CASE
    WHEN upside_rating::numeric >= 18
     AND projection_confidence::numeric >= 55
    THEN true ELSE false
  END AS breakout_flag
FROM public.v_rankings_master;

GRANT SELECT ON public.v_neeko_breakout_engine TO anon, authenticated;


-- ── 5. Avoid Traps ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_avoid_traps
WITH (security_invoker = false)
AS
SELECT
  player_id,
  CASE
    WHEN risk_rating::numeric >= 70
     AND projection_confidence::numeric <= 50
    THEN true ELSE false
  END AS avoid_flag
FROM public.v_rankings_master;

GRANT SELECT ON public.v_neeko_avoid_traps TO anon, authenticated;


-- ── 6. Master V2 ──────────────────────────────────────────────────────────
-- Adds only the NEW derived columns; base columns come from m.*

CREATE OR REPLACE VIEW public.v_neeko_intel_master_v2
WITH (security_invoker = false)
AS
SELECT
  m.*,
  COALESCE(d.matchup_difficulty, 'NEUTRAL') AS matchup_difficulty,
  v.volatility_score,
  COALESCE(v.volatility_level, 'LOW')       AS volatility_level,
  COALESCE(c.captain_tier, 'RISKY')         AS captain_tier,
  COALESCE(b.breakout_flag, false)           AS breakout_flag,
  COALESCE(a.avoid_flag,    false)           AS avoid_flag
FROM public.v_neeko_intel_master m
LEFT JOIN public.v_neeko_matchup_difficulty d USING (player_id)
LEFT JOIN public.v_neeko_volatility          v USING (player_id)
LEFT JOIN public.v_neeko_captain_tiers       c USING (player_id)
LEFT JOIN public.v_neeko_breakout_engine     b USING (player_id)
LEFT JOIN public.v_neeko_avoid_traps         a USING (player_id);

GRANT SELECT ON public.v_neeko_intel_master_v2 TO anon, authenticated;
