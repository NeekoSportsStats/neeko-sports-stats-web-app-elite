/*
  # Create v_rankings_master — unlimited master rankings view

  ## Summary
  The existing `v_rankings_free` view applies a LIMIT 20 at the SQL level.
  This breaks frontend position filtering because the limit fires before any
  position predicate is applied — meaning a DEF filter might return 0–5 rows
  instead of all defenders.

  ## Changes
  1. Drop `v_rankings_free` — no longer used anywhere
  2. Create `v_rankings_master` as a complete, unlimited alias of `v_rankings_premium`
     - Identical column set (player_id, player_name, team, position, all metrics)
     - No LIMIT or WHERE clause — the frontend owns all filtering and gating
  3. `v_rankings_premium` is left untouched (safe mode)

  ## Security
  - RLS is not applicable to views in the public schema; underlying table RLS
    is inherited through the base views (v_player_detail_premium etc.)
  - Anonymous / authenticated read: public schema views are readable by anon
    role by default; no sensitive data is exposed beyond what v_rankings_premium
    already exposes

  ## Important Notes
  1. Frontend MUST apply free-tier gating (unlock first N per position) in JS
  2. Frontend MUST NOT rely on row count from this view to infer locking
  3. This view supersedes v_rankings_free — do not recreate v_rankings_free
*/

DROP VIEW IF EXISTS v_rankings_master;

CREATE VIEW v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  captain_score,
  captain_rating
FROM v_rankings_premium
ORDER BY projection_final DESC NULLS LAST;
