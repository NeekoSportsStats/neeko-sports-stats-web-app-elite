/*
  # Step 1 — Fix run_afl_processing_pipeline() Stale Plan

  ## Problem
  The daily cron job `afl_processing_pipeline` (jobid 136) has been failing since
  2026-03-14 with:
    "column "created_at" of relation "player_rankings_cache" does not exist"

  The column `created_at` WAS added to `afl.player_rankings_cache` but the compiled
  plan for `afl.populate_rankings_cache_from_source()` was cached before the column
  existed. Recreating (DROP + CREATE) the function clears the stale plan.

  ## Fix
  - DROP and re-CREATE `afl.populate_rankings_cache_from_source()` with identical
    logic to force PostgreSQL to recompile the function plan.
  - The function body is byte-for-byte identical to the existing version — only the
    plan cache is being cleared. No formula or logic changes.

  ## Impact
  - Clears stale compiled plan
  - Daily pipeline will succeed at Stage 3 from next run
  - Stage 4 (market watch + edge board) will also resume running
*/

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr.position_group,
    nr.position_group,
    nr.projection::numeric,
    nr.projection::numeric,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    nr.neeko_rating::double precision,
    nr.price::integer,
    nr.value_score::double precision,
    NULL::text,
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END,
    LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::double precision,
    LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0) * 100))::double precision,
    COALESCE(met.matchup_rating, 'Neutral'),
    LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0) * 100))::double precision,
    LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))::double precision,
    CASE
      WHEN met.captain_score >= 70 THEN 'Elite'
      WHEN met.captain_score >= 50 THEN 'Strong'
      WHEN met.captain_score >= 30 THEN 'Viable'
      ELSE 'Avoid'
    END,
    COALESCE(reco.recommendation_label, aic.recommendation),
    COALESCE(reco.recommendation_color, CASE
      WHEN aic.recommendation = 'BUY'  THEN 'green'
      WHEN aic.recommendation = 'SELL' THEN 'red'
      WHEN aic.recommendation = 'SIT'  THEN 'yellow'
      ELSE 'grey'
    END),
    COALESCE(reco.recommendation_short, aic.why),
    COALESCE(reco.recommendation_short, aic.why),
    aic.summary,
    aic.generated_at,
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END,
    0,
    now(),
    now()
  FROM afl.v_neeko_rating nr
  LEFT JOIN afl.v_ai_player_metrics         met  ON met.player_id  = nr.player_id
  LEFT JOIN public.ai_player_content        aic  ON aic.player_id  = nr.player_id
  LEFT JOIN public.ai_rankings_player_recos reco ON reco.player_id = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$$;
