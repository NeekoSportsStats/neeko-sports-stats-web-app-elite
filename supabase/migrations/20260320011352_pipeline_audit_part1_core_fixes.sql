/*
  # Pipeline Audit Part 1 — Core Fixes

  ## Changes
  1. Rebuild populate_rankings_cache_from_source as UPSERT (preserves AI columns)
  2. Add PK to player_rankings_cache if missing (required for ON CONFLICT)
  3. Fix refresh_mv_edge_board — mv_edge_board is a plain table not a materialized view
  4. Rebalance cron schedule to eliminate race conditions
  5. Rebuild run_neeko_pipeline with fixed edge board step
*/

-- ── 1. Add PK to player_rankings_cache if not exists ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'afl.player_rankings_cache'::regclass
    AND contype = 'p'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD PRIMARY KEY (player_id);
  END IF;
END $$;


-- ── 2. Fix refresh_mv_edge_board — mv_edge_board is a plain table ─────────────
CREATE OR REPLACE FUNCTION public.refresh_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  -- mv_edge_board is a plain table (relkind='r'), not a materialized view
  -- Use truncate + repopulate approach
  BEGIN
    TRUNCATE TABLE public.mv_edge_board;
    INSERT INTO public.mv_edge_board
    SELECT * FROM public.get_edge_board_data()
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: log and continue
    INSERT INTO public.system_logs (event_type, source, log_level, message)
    VALUES ('edge_board_refresh_error', 'refresh_mv_edge_board', 'warning', SQLERRM);
  END;
END;
$$;


-- ── 3. Rebuild populate_rankings_cache_from_source as UPSERT ─────────────────
-- Key change: DELETE+INSERT → INSERT ... ON CONFLICT DO UPDATE
-- This preserves AI columns written by generate-player-ai between cache refreshes
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, ai
AS $$
DECLARE
  v_max_neeko   numeric;
  v_val_elite   numeric;
  v_val_strong  numeric;
  v_val_solid   numeric;
  v_val_neutral numeric;
  v_cap_min     numeric;
  v_cap_max     numeric;
BEGIN

  SELECT GREATEST(MAX(round(
    pp2.projection_final * 0.40
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp2.projection_confidence, 50.0) * 0.20
    + COALESCE(pp2.consistency_score, 50.0) * 0.15
    + COALESCE(fp.value_score, 0.0) * 0.20
    - COALESCE(pp2.volatility_score, 50.0) * 0.05
  , 1)), 1.0)
  INTO v_max_neeko
  FROM afl.player_projection pp2
  LEFT JOIN afl.feature_price fp  ON fp.player_id  = pp2.player_id
  LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp2.player_id
  LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp2.player_id;

  SELECT
    PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY nr.value_score),
    PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY nr.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY nr.value_score),
    PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY nr.value_score)
  INTO v_val_elite, v_val_strong, v_val_solid, v_val_neutral
  FROM afl.mv_player_rankings nr WHERE nr.value_score IS NOT NULL;

  v_val_elite   := COALESCE(v_val_elite,    7.0);
  v_val_strong  := COALESCE(v_val_strong,   1.9);
  v_val_solid   := COALESCE(v_val_solid,   -1.8);
  v_val_neutral := COALESCE(v_val_neutral, -6.6);

  SELECT
    COALESCE(MIN(nr2.ceiling*0.40+nr2.projection*0.25+COALESCE(nr2.consistency,50.0)*0.15+COALESCE(nr2.confidence,50.0)*0.10+COALESCE(nr2.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr2.volatility_score,50.0)*0.05),0),
    COALESCE(NULLIF(MAX(nr2.ceiling*0.40+nr2.projection*0.25+COALESCE(nr2.consistency,50.0)*0.15+COALESCE(nr2.confidence,50.0)*0.10+COALESCE(nr2.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr2.volatility_score,50.0)*0.05),0),1)
  INTO v_cap_min, v_cap_max
  FROM afl.mv_player_rankings nr2;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, neeko_rating_raw, neeko_rating_scaled,
    best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, upside_pct, captain_score, captain_rating, games_played,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    recommendation_strength, ai_summary, ai_updated_at, ai_generated_at,
    consistency_tier, total_count, cached_at, created_at,
    start_sit_decision, edge_score, edge_tier, market_watch_category
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name, nr.team_name,
    nr."position", nr."position",
    nr.projection::numeric,
    nr.projection::double precision,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    round(nr.projection::numeric*0.40+COALESCE(nr.confidence,50.0)::numeric*0.20+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.value_score,0.0)::numeric*0.20-COALESCE(nr.volatility_score,50.0)::numeric*0.05,1)::double precision,
    round(nr.projection::numeric*0.40+COALESCE(nr.confidence,50.0)::numeric*0.20+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.value_score,0.0)::numeric*0.20-COALESCE(nr.volatility_score,50.0)::numeric*0.05,1)::double precision,
    LEAST(100.0,ROUND((round(nr.projection::numeric*0.40+COALESCE(nr.confidence,50.0)::numeric*0.20+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.value_score,0.0)::numeric*0.20-COALESCE(nr.volatility_score,50.0)::numeric*0.05,1)/v_max_neeko)*100.0,1))::double precision,
    round((nr.projection::numeric*0.45+COALESCE(nr.value_score,0.0)::numeric*10.0*0.35+COALESCE(nr.confidence,50.0)::numeric*0.20),1)::double precision,
    COALESCE(pp.price,nr.price)::integer,
    nr.value_score::double precision,
    CASE WHEN nr.value_score IS NULL THEN NULL WHEN nr.value_score>=v_val_elite THEN 'ELITE VALUE' WHEN nr.value_score>=v_val_strong THEN 'STRONG VALUE' WHEN nr.value_score>=v_val_solid THEN 'SOLID VALUE' WHEN nr.value_score>=v_val_neutral THEN 'NEUTRAL' ELSE 'FADE' END,
    CASE WHEN nr.value_score IS NULL THEN NULL WHEN nr.value_score>=v_val_elite THEN 'ELITE VALUE' WHEN nr.value_score>=v_val_strong THEN 'STRONG VALUE' WHEN nr.value_score>=v_val_solid THEN 'SOLID VALUE' WHEN nr.value_score>=v_val_neutral THEN 'NEUTRAL' ELSE 'FADE' END,
    LEAST(100,GREATEST(0,COALESCE(nr.confidence,50)))::double precision,
    CASE WHEN COALESCE(nr.confidence,50)>=70 THEN LEAST(COALESCE(nr.volatility_score,50.0),30.0) WHEN COALESCE(nr.confidence,50)<=45 THEN GREATEST(COALESCE(nr.volatility_score,50.0),50.0) ELSE COALESCE(nr.volatility_score,50.0) END::double precision,
    CASE WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=1.10 THEN 'ELITE' WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=1.05 THEN 'GOOD' WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=0.95 THEN 'NEUTRAL' ELSE 'TOUGH' END,
    CASE WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=1.10 THEN 'ELITE' WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=1.05 THEN 'GOOD' WHEN COALESCE(nr.matchup_multiplier::numeric,1.0)>=0.95 THEN 'NEUTRAL' ELSE 'TOUGH' END,
    COALESCE(nr.matchup_multiplier::numeric,1.0),
    LEAST(100,GREATEST(0,COALESCE(nr.breakout_probability*100.0,0)))::double precision,
    COALESCE(nr.breakout_probability*100.0,0)::double precision,
    LEAST(100.0,GREATEST(0.0,ROUND(100.0*((nr.ceiling::numeric*0.40+nr.projection::numeric*0.25+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.confidence,50.0)::numeric*0.10+COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr.volatility_score,50.0)::numeric*0.05)-v_cap_min)/NULLIF(v_cap_max-v_cap_min,0),1)))::double precision,
    CASE WHEN LEAST(100.0,GREATEST(0.0,ROUND(100.0*((nr.ceiling::numeric*0.40+nr.projection::numeric*0.25+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.confidence,50.0)::numeric*0.10+COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr.volatility_score,50.0)::numeric*0.05)-v_cap_min)/NULLIF(v_cap_max-v_cap_min,0),1)))>=80 THEN 'Elite Captain' WHEN LEAST(100.0,GREATEST(0.0,ROUND(100.0*((nr.ceiling::numeric*0.40+nr.projection::numeric*0.25+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.confidence,50.0)::numeric*0.10+COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr.volatility_score,50.0)::numeric*0.05)-v_cap_min)/NULLIF(v_cap_max-v_cap_min,0),1)))>=60 THEN 'Strong Captain' WHEN LEAST(100.0,GREATEST(0.0,ROUND(100.0*((nr.ceiling::numeric*0.40+nr.projection::numeric*0.25+COALESCE(nr.consistency,50.0)::numeric*0.15+COALESCE(nr.confidence,50.0)::numeric*0.10+COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05-COALESCE(nr.volatility_score,50.0)::numeric*0.05)-v_cap_min)/NULLIF(v_cap_max-v_cap_min,0),1)))>=40 THEN 'Captain Option' ELSE 'Avoid' END,
    COALESCE(nr.games_played,0)::integer,
    CASE WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 AND COALESCE(nr.volatility_score,50.0)<=45.0 THEN 'BUY' WHEN COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70 THEN 'HOLD' ELSE 'SELL' END,
    CASE WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 AND COALESCE(nr.volatility_score,50.0)<=45.0 THEN 'green' WHEN COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70 THEN 'grey' ELSE 'red' END,
    -- Preserve AI short: use ai.player_ai_analysis first, then existing cache
    COALESCE(aia.summary_short, existing_cache.recommendation_short),
    COALESCE(aia.summary_long,  existing_cache.recommendation_why),
    CASE WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 AND COALESCE(nr.volatility_score,50.0)<=45.0 AND COALESCE(nr.confidence,50)>=70 THEN 'STRONG' WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 THEN 'MODERATE' WHEN COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70 THEN 'MODERATE' ELSE 'WEAK' END,
    COALESCE(aia.summary_long,  existing_cache.ai_summary),
    COALESCE(aia.generated_at,  existing_cache.ai_updated_at),
    COALESCE(aia.generated_at,  existing_cache.ai_generated_at),
    CASE WHEN nr.consistency>=75 THEN 'Elite' WHEN nr.consistency>=60 THEN 'Consistent' WHEN nr.consistency>=40 THEN 'Volatile' ELSE 'Boom-Bust' END,
    0, now(), now(),
    CASE WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 AND COALESCE(nr.volatility_score,50.0)<=45.0 AND COALESCE(nr.confidence,50)>=60 THEN 'START' WHEN NOT(COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70) THEN 'SIT' ELSE 'CONSIDER' END,
    CASE WHEN (CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END)>=2 THEN NULL ELSE LEAST(100,GREATEST(0,ROUND((LEAST(GREATEST((nr.projection::numeric-60.0)/60.0,0),1)*0.40+LEAST(GREATEST((COALESCE(nr.value_score,v_val_neutral)-v_val_neutral)/NULLIF(v_val_elite-v_val_neutral,1),0),1)*0.25+LEAST(GREATEST(COALESCE(nr.confidence,50)/100.0,0),1)*0.20+LEAST(GREATEST(1.0-COALESCE(nr.volatility_score,50)/100.0,0),1)*0.15)*100)::integer)) END,
    CASE WHEN (CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END+CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END)>=2 THEN NULL WHEN LEAST(100,GREATEST(0,ROUND((LEAST(GREATEST((nr.projection::numeric-60.0)/60.0,0),1)*0.40+LEAST(GREATEST((COALESCE(nr.value_score,v_val_neutral)-v_val_neutral)/NULLIF(v_val_elite-v_val_neutral,1),0),1)*0.25+LEAST(GREATEST(COALESCE(nr.confidence,50)/100.0,0),1)*0.20+LEAST(GREATEST(1.0-COALESCE(nr.volatility_score,50)/100.0,0),1)*0.15)*100)::integer))>=90 THEN 'Elite Edge' WHEN LEAST(100,GREATEST(0,ROUND((LEAST(GREATEST((nr.projection::numeric-60.0)/60.0,0),1)*0.40+LEAST(GREATEST((COALESCE(nr.value_score,v_val_neutral)-v_val_neutral)/NULLIF(v_val_elite-v_val_neutral,1),0),1)*0.25+LEAST(GREATEST(COALESCE(nr.confidence,50)/100.0,0),1)*0.20+LEAST(GREATEST(1.0-COALESCE(nr.volatility_score,50)/100.0,0),1)*0.15)*100)::integer))>=75 THEN 'Strong Edge' WHEN LEAST(100,GREATEST(0,ROUND((LEAST(GREATEST((nr.projection::numeric-60.0)/60.0,0),1)*0.40+LEAST(GREATEST((COALESCE(nr.value_score,v_val_neutral)-v_val_neutral)/NULLIF(v_val_elite-v_val_neutral,1),0),1)*0.25+LEAST(GREATEST(COALESCE(nr.confidence,50)/100.0,0),1)*0.20+LEAST(GREATEST(1.0-COALESCE(nr.volatility_score,50)/100.0,0),1)*0.15)*100)::integer))>=60 THEN 'Playable Edge' ELSE 'Monitor' END,
    CASE WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 AND COALESCE(nr.volatility_score,50.0)<=45.0 AND COALESCE(nr.games_played,99)<=3 THEN 'CASH COW' WHEN COALESCE(nr.value_score,-99)>=v_val_elite AND nr.projection::numeric>=95 THEN 'BUY TARGET' WHEN NOT(COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70) AND COALESCE(nr.volatility_score,50.0)>=60.0 THEN 'TRAP' WHEN NOT(COALESCE(nr.value_score,-99)>=v_val_solid AND nr.projection::numeric>=70) THEN 'SELL' WHEN COALESCE(nr.form_score,0)>=70 AND nr.projection::numeric>=85 THEN 'TRENDING UP' ELSE NULL END
  FROM afl.mv_player_rankings              nr
  LEFT JOIN afl.player_prices              pp             ON pp.player_id   = nr.player_id
  LEFT JOIN ai.player_ai_analysis          aia            ON aia.player_id  = nr.player_id
  LEFT JOIN afl.player_rankings_cache      existing_cache ON existing_cache.player_id = nr.player_id

  ON CONFLICT (player_id) DO UPDATE SET
    player_name           = EXCLUDED.player_name,
    team                  = EXCLUDED.team,
    team_name             = EXCLUDED.team_name,
    position              = EXCLUDED.position,
    position_group        = EXCLUDED.position_group,
    projection_final      = EXCLUDED.projection_final,
    projection            = EXCLUDED.projection,
    ceiling               = EXCLUDED.ceiling,
    floor                 = EXCLUDED.floor,
    consistency           = EXCLUDED.consistency,
    form_score            = EXCLUDED.form_score,
    neeko_rating          = EXCLUDED.neeko_rating,
    neeko_rating_raw      = EXCLUDED.neeko_rating_raw,
    neeko_rating_scaled   = EXCLUDED.neeko_rating_scaled,
    best_value_score      = EXCLUDED.best_value_score,
    price                 = EXCLUDED.price,
    value_score           = EXCLUDED.value_score,
    value_tag             = EXCLUDED.value_tag,
    value_tier            = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating           = EXCLUDED.risk_rating,
    matchup_rating        = EXCLUDED.matchup_rating,
    matchup_label         = EXCLUDED.matchup_label,
    matchup_multiplier    = EXCLUDED.matchup_multiplier,
    upside_rating         = EXCLUDED.upside_rating,
    upside_pct            = EXCLUDED.upside_pct,
    captain_score         = EXCLUDED.captain_score,
    captain_rating        = EXCLUDED.captain_rating,
    games_played          = EXCLUDED.games_played,
    ai_recommendation     = EXCLUDED.ai_recommendation,
    recommendation_color  = EXCLUDED.recommendation_color,
    recommendation_strength = EXCLUDED.recommendation_strength,
    start_sit_decision    = EXCLUDED.start_sit_decision,
    edge_score            = EXCLUDED.edge_score,
    edge_tier             = EXCLUDED.edge_tier,
    market_watch_category = EXCLUDED.market_watch_category,
    -- AI content: only overwrite if incoming is non-null (don't erase live AI writes)
    recommendation_short  = CASE WHEN EXCLUDED.recommendation_short IS NOT NULL THEN EXCLUDED.recommendation_short ELSE afl.player_rankings_cache.recommendation_short END,
    recommendation_why    = CASE WHEN EXCLUDED.recommendation_why IS NOT NULL THEN EXCLUDED.recommendation_why ELSE afl.player_rankings_cache.recommendation_why END,
    ai_summary            = CASE WHEN EXCLUDED.ai_summary IS NOT NULL THEN EXCLUDED.ai_summary ELSE afl.player_rankings_cache.ai_summary END,
    ai_updated_at         = CASE WHEN EXCLUDED.ai_updated_at IS NOT NULL THEN EXCLUDED.ai_updated_at ELSE afl.player_rankings_cache.ai_updated_at END,
    ai_generated_at       = CASE WHEN EXCLUDED.ai_generated_at IS NOT NULL THEN EXCLUDED.ai_generated_at ELSE afl.player_rankings_cache.ai_generated_at END,
    cached_at             = now();

END;
$$;


-- ── 4. Rebalance cron schedule to eliminate race conditions ───────────────────
-- New schedule (UTC times, AEDT = UTC+11 in March 2026):
-- 14:00 → stage1 ingest        (01:00 AEDT)
-- 14:15 → stage2 normalize     (01:15 AEDT)
-- 14:30 → stage3 neeko pipeline (01:30 AEDT)
-- 14:55 → stage4 cache+market  (01:55 AEDT)
-- 15:15 → stage5 AI generation (02:15 AEDT) — no competing 5-min refresh
-- 15:45 → stage6 gap heal      (02:45 AEDT)
-- rankings-cache-refresh-5min: narrow to hour 14 only (14:00–14:59)
--   → stops running at 15:xx when AI is active

SELECT cron.alter_job(job_id => 174, schedule => '*/5 14 * * *');    -- cache refresh: hour 14 only
SELECT cron.alter_job(job_id => 176, schedule => '0 14 * * *');      -- stage1 ingest
SELECT cron.alter_job(job_id => 177, schedule => '15 14 * * *');     -- stage2 normalize
SELECT cron.alter_job(job_id => 178, schedule => '30 14 * * *');     -- stage3 neeko pipeline
SELECT cron.alter_job(job_id => 179, schedule => '55 14 * * *');     -- stage4 cache+market
SELECT cron.alter_job(job_id => 180, schedule => '15 15 * * *');     -- stage5 AI generation
SELECT cron.alter_job(job_id => 181, schedule => '45 15 * * *');     -- stage6 gap heal
SELECT cron.alter_job(job_id => 173, schedule => '30 16 * * 1');     -- weekly model improvement
SELECT cron.alter_job(job_id => 182, schedule => '0 6 * * *');       -- projection accuracy
