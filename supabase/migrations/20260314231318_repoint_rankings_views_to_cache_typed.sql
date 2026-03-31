
/*
  # Repoint public rankings views to afl.player_rankings_cache

  ## Root Cause of Timeout (confirmed)
  public.v_rankings_final → public.v_player_rankings_full → afl.v_neeko_rating
  → afl.v_player_value_engine → afl.v_projection_engine

  v_projection_engine contains two full CTEs that scan all of afl.player_games
  (11,783 rows) on every request, plus v_player_form_normalised which does a
  third window-function scan of the same table. This reliably hits the statement
  timeout.

  ## Fix Strategy
  Repoint both public views to read from afl.player_rankings_cache — a flat table
  with a unique index on player_id. Query becomes a single O(736) index scan,
  under 5ms.

  The cache is refreshed every 6 hours via cron, after each data ingest, and
  after each AI generation run.

  ## Type Alignment
  v_player_rankings_full has strict column types (numeric, integer, bigint).
  The cache stores double precision. We cast explicitly to match.

  ## Steps
  1. Drop v_player_rankings_full (safe — only queried by v_rankings_final wrapper)
  2. Recreate v_player_rankings_full backed by cache with correct types
  3. Recreate v_rankings_final backed by cache with correct types
  4. Repopulate cache immediately
*/

-- Step 1: Drop dependent views so we can recreate with new types
DROP VIEW IF EXISTS public.v_rankings_final CASCADE;
DROP VIEW IF EXISTS public.v_player_rankings_full CASCADE;

-- Step 2: Recreate v_player_rankings_full from cache with type-matched columns
CREATE VIEW public.v_player_rankings_full AS
SELECT
  player_id::integer,
  player_name::text,
  team::text,
  position::text,
  team_name::text,
  position_group::text,

  projection_final::numeric,
  ceiling::numeric::integer                         AS ceiling,
  floor::numeric,
  consistency::numeric                              AS consistency_score,
  form_score::numeric                               AS form_rating,
  neeko_rating::numeric,
  price::integer,
  value_score::numeric,

  ai_summary::text,
  ai_recommendation::text                           AS recommendation,
  recommendation_short::text,
  ai_updated_at,

  projection_confidence::numeric,
  risk_rating::numeric,
  matchup_rating::text,
  upside_rating::numeric,
  captain_score::numeric,
  captain_rating::text,
  value_tag::text,
  value_tier::text,
  consistency_tier::text,
  total_count::bigint
FROM afl.player_rankings_cache;

GRANT SELECT ON public.v_player_rankings_full TO anon, authenticated;

-- Step 3: Recreate v_rankings_final from cache with all frontend-expected columns
CREATE VIEW public.v_rankings_final AS
SELECT
  player_id::integer,
  player_name::text,
  team::text,
  position::text,
  team_name::text,
  position_group::text,

  projection_final::numeric,
  ceiling::numeric::integer                         AS ceiling,
  floor::numeric,
  ceiling::numeric::integer                         AS ceiling_estimate,
  floor::numeric                                    AS floor_estimate,
  consistency::numeric                              AS consistency_score,
  form_score::numeric                               AS form_rating,
  neeko_rating::numeric,
  price::integer,
  value_score::numeric,
  value_tag::text,
  value_tier::text,

  ai_recommendation::text,
  recommendation_short::text,
  recommendation_why::text,
  recommendation_color::text,
  ai_summary::text,
  ai_updated_at,

  projection_confidence::numeric,
  risk_rating::numeric,
  matchup_rating::text,
  upside_rating::numeric,
  captain_score::numeric,
  captain_rating::text,
  consistency_tier::text,
  total_count::bigint,
  cached_at
FROM afl.player_rankings_cache;

GRANT SELECT ON public.v_rankings_final TO anon, authenticated;

-- Step 4: Repopulate cache immediately so views return data
SELECT afl.refresh_player_rankings_cache();
