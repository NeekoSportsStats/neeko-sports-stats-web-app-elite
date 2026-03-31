/*
  # Freemium Gating Layer — Public Schema Views

  ## Summary
  Creates six public-schema views to power frontend freemium gating.
  No existing tables, views, or objects are modified.

  ## New Views

  ### Rankings (from afl.v_neeko_player_projection_final)
  1. public.v_rankings_free
     - Top 20 players by projection_final
     - Premium metrics (ceiling, floor, trend, matchup, consistency) returned as NULL
     - is_premium_locked = TRUE

  2. public.v_rankings_premium
     - All players, all metrics exposed
     - is_premium_unlocked = TRUE

  ### Player Detail (from afl.ai_player_summaries, season = 2026)
  3. public.v_player_detail_free
     - expected_fantasy visible; ai_summary + premium metrics returned as NULL
     - is_premium_locked = TRUE

  4. public.v_player_detail_premium
     - All columns exposed
     - is_premium_unlocked = TRUE

  ### Insights (from afl.v_neeko_player_projection_final)
  5. public.v_insights_free    — Top 10 rows
  6. public.v_insights_premium — All rows

  ## Security Notes
  - All views are in the public schema and rely on calling-role RLS from upstream tables/views
  - No RLS is applied directly to views (views are not tables)
  - Frontend must enforce access by calling the appropriate view based on subscription tier
*/

-- ─── 1. FREE RANKINGS ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  NULL::numeric  AS ceiling_estimate,
  NULL::numeric  AS floor_estimate,
  NULL::numeric  AS trend_3_vs_10,
  NULL::numeric  AS matchup_delta,
  NULL::integer  AS consistency_score,
  FALSE          AS is_premium_locked
FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC
LIMIT 20;

-- ─── 2. PREMIUM RANKINGS ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_rankings_premium AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  trend_3_vs_10,
  matchup_delta,
  consistency_score,
  TRUE AS is_premium_unlocked
FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC;

-- ─── 3. FREE PLAYER DETAIL ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_detail_free AS
SELECT
  player_id,
  player,
  team,
  expected_fantasy,
  NULL::text     AS ai_summary,
  NULL::numeric  AS ceiling_fantasy,
  NULL::numeric  AS floor_fantasy,
  NULL::numeric  AS consistency_score,
  NULL::numeric  AS volatility,
  FALSE          AS is_premium_locked
FROM afl.ai_player_summaries
WHERE season = 2026;

-- ─── 4. PREMIUM PLAYER DETAIL ────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_player_detail_premium AS
SELECT
  player_id,
  player,
  team,
  expected_fantasy,
  ai_summary,
  ceiling_fantasy,
  floor_fantasy,
  consistency_score,
  volatility,
  TRUE AS is_premium_unlocked
FROM afl.ai_player_summaries
WHERE season = 2026;

-- ─── 5. FREE INSIGHTS ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_insights_free AS
SELECT *
FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC
LIMIT 10;

-- ─── 6. PREMIUM INSIGHTS ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_insights_premium AS
SELECT *
FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC;
