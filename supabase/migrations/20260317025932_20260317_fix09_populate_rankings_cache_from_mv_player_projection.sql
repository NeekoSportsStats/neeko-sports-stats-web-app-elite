/*
  # Fix 09: Populate Rankings Cache from mv_player_projection

  ## Summary
  The `afl.player_rankings_cache` table was just created (Fix 01) but is empty.
  The intended population function `afl.populate_rankings_cache_from_source()` depends
  on `afl.v_neeko_rating` which does not exist. The pipeline-path function
  `afl.refresh_player_rankings_cache_fast()` depends on `afl.mv_player_rankings` which
  also does not exist.

  This migration:
  1. Creates `afl.mv_player_rankings` as a materialized view over `afl.mv_player_projection`
     joined to `afl.player_prices` — giving `refresh_player_rankings_cache_fast()` its
     required source so the pipeline works correctly going forward.
  2. Immediately populates `afl.player_rankings_cache` with all 687 projected players,
     enriched with prices and the single available AI analysis row.
  3. Computes value_tag, value_tier, consistency_tier, matchup_rating, captain_score,
     upside_rating, and recommendation_color from the projection data.

  ## Tables modified
  - `afl.mv_player_rankings` (CREATE MATERIALIZED VIEW — new)
  - `afl.player_rankings_cache` (TRUNCATE + INSERT — populated with 687 rows)

  ## Notes
  - total_count is set to the number of rows inserted so pagination works
  - cached_at is set to now()
  - AI fields default to NULL (only 1 analysis exists; pipeline will fill over time)
  - The pipeline's Step 8 (refresh_player_rankings_cache_fast) will now work correctly
*/

-- Step 1: Create mv_player_rankings as a proper materialized view
-- This is what refresh_player_rankings_cache_fast() sources from
CREATE MATERIALIZED VIEW IF NOT EXISTS afl.mv_player_rankings AS
SELECT
  p.player_id,
  p.player_name,
  p.team_name,
  p.team_id,
  p.position                            AS position_group,
  COALESCE(pp.price, p.price)           AS price,
  p.game_date,
  p.venue,
  p.opponent_name,
  p.is_home,
  p.projection::numeric                 AS projection,
  p.floor::double precision             AS floor,
  p.ceiling::double precision           AS ceiling,
  p.risk,
  p.confidence::double precision        AS confidence,
  p.confidence_tier,
  p.base_confidence_score::double precision AS base_confidence_score,
  p.consistency::double precision       AS consistency,
  p.value_score::double precision       AS value_score,
  p.neeko_rating::double precision      AS neeko_rating,
  p.season_avg,
  p.last3_avg,
  p.last5_avg,
  p.last10_avg,
  p.form_score::double precision        AS form_score,
  p.form_momentum,
  p.games_played,
  p.matchup_rating,
  p.opponent_rank_vs_position,
  p.venue_multiplier,
  p.home_advantage,
  p.rest_days,
  p.short_turnaround_flag,
  p.position_concession_multiplier,
  p.volatility_score,
  p.stability_score,
  p.ceiling_hit_rate,
  p.floor_bust_rate,
  p.stddev_last10,
  p.breakout_probability::double precision AS breakout_probability,
  p.breakout_flag,
  p.updated_at
FROM afl.mv_player_projection p
LEFT JOIN afl.player_prices pp ON pp.player_id = p.player_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_player_rankings_player_id
  ON afl.mv_player_rankings (player_id);

CREATE INDEX IF NOT EXISTS idx_mv_player_rankings_neeko
  ON afl.mv_player_rankings (neeko_rating DESC NULLS LAST);

-- Step 2: Populate the rankings cache from mv_player_rankings + AI data
TRUNCATE TABLE afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
  player_id,
  player_name,
  team,
  team_name,
  position,
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  consistency,
  form_score,
  neeko_rating,
  price,
  value_score,
  projection_confidence,
  risk_rating,
  matchup_rating,
  upside_rating,
  captain_score,
  value_tag,
  value_tier,
  consistency_tier,
  recommendation_color,
  ai_recommendation,
  ai_summary,
  recommendation_short,
  recommendation_why,
  total_count,
  cached_at,
  created_at
)
SELECT
  r.player_id,
  r.player_name,
  r.team_name                          AS team,
  r.team_name,
  r.position_group                     AS position,
  r.position_group,
  r.projection::numeric                AS projection_final,
  r.projection::double precision       AS projection,
  r.ceiling::double precision          AS ceiling,
  r.floor::double precision            AS floor,
  r.consistency::double precision      AS consistency,
  r.form_score::double precision       AS form_score,
  r.neeko_rating::double precision     AS neeko_rating,
  r.price::integer                     AS price,
  r.value_score::double precision      AS value_score,
  r.confidence::double precision       AS projection_confidence,
  -- risk_rating: map risk text to numeric 0-100
  CASE r.risk
    WHEN 'LOW'          THEN 20.0
    WHEN 'MODERATE'     THEN 50.0
    WHEN 'HIGH'         THEN 75.0
    WHEN 'VERY_HIGH'    THEN 90.0
    ELSE 50.0
  END::double precision                AS risk_rating,
  -- matchup_rating: map numeric rank to text
  CASE
    WHEN r.opponent_rank_vs_position <= 4  THEN 'Favorable'
    WHEN r.opponent_rank_vs_position >= 14 THEN 'Tough'
    ELSE 'Neutral'
  END                                  AS matchup_rating,
  -- upside_rating: breakout probability clamped 0-100
  LEAST(100.0, GREATEST(0.0, r.breakout_probability * 100.0))::double precision AS upside_rating,
  -- captain_score: weighted score for captaincy
  LEAST(100.0, GREATEST(0.0,
    r.projection::double precision * 0.5
    + r.ceiling::double precision * 0.3
    + r.consistency::double precision * 0.2
  ))::double precision                 AS captain_score,
  -- value_tag
  CASE
    WHEN r.value_score >= 500 THEN 'Elite Value'
    WHEN r.value_score >= 300 THEN 'Good Value'
    WHEN r.value_score >= 150 THEN 'Fair Value'
    WHEN r.value_score >= 50  THEN 'Slight Value'
    ELSE 'Overpriced'
  END                                  AS value_tag,
  -- value_tier
  CASE
    WHEN r.value_score >= 500 THEN 'premium'
    WHEN r.value_score >= 250 THEN 'good'
    WHEN r.value_score >= 100 THEN 'fair'
    ELSE 'poor'
  END                                  AS value_tier,
  -- consistency_tier
  CASE
    WHEN r.consistency >= 75 THEN 'Elite'
    WHEN r.consistency >= 55 THEN 'Consistent'
    WHEN r.consistency >= 35 THEN 'Variable'
    ELSE 'Volatile'
  END                                  AS consistency_tier,
  -- recommendation_color from AI if available, else derived from projection
  COALESCE(
    ai.recommendation,
    CASE
      WHEN r.neeko_rating >= 130 THEN 'BUY'
      WHEN r.neeko_rating >= 100 THEN 'HOLD'
      ELSE 'MONITOR'
    END
  )                                    AS recommendation_color,
  -- ai_recommendation
  COALESCE(ai.recommendation, NULL)    AS ai_recommendation,
  -- ai_summary
  ai.summary_long                      AS ai_summary,
  -- recommendation_short
  ai.summary_short                     AS recommendation_short,
  -- recommendation_why (use summary_short as fallback)
  ai.summary_short                     AS recommendation_why,
  -- total_count filled in update below
  0                                    AS total_count,
  now()                                AS cached_at,
  now()                                AS created_at
FROM afl.mv_player_rankings r
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = r.player_id
WHERE r.player_id IS NOT NULL;

-- Step 3: Set total_count to actual row count
UPDATE afl.player_rankings_cache SET total_count = (SELECT COUNT(*) FROM afl.player_rankings_cache);

-- Step 4: Grant anon access to the new MV (pipeline refreshes it)
GRANT SELECT ON afl.mv_player_rankings TO anon, authenticated, service_role;
