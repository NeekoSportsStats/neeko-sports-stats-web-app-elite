/*
  # Fix populate_rankings_cache_from_source — correct source tables

  ## Problem
  The function referenced two tables/views that do not exist:
    - afl.v_ai_player_metrics  → does not exist (captain_score always NULL)
    - public.ai_player_content → does not exist (AI summaries never joined)
    - public.ai_rankings_player_recos → does not exist (recommendation fields never joined)

  ## Fix
  Rebuild the function to use the correct existing sources:
    - afl.v_captain_scores    → for captain_score, captain_rating
    - ai.player_ai_analysis   → for recommendation, summary, generated_at
    - afl.v_player_risk_model → for risk_percent (unchanged — already worked)
    - afl.mv_player_rankings  → source rows (via afl.v_neeko_rating alias view)

  ## Result
  Rankings cache will now correctly populate captain_score and AI summary fields.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $func$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, ceiling_estimate, consistency, form_score,
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
    nr.projection::numeric                                    AS projection_final,
    nr.projection::double precision                          AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.ceiling::double precision                             AS ceiling_estimate,
    nr.consistency::double precision,
    nr.form_score::double precision,
    nr.neeko_rating::double precision,
    nr.price::integer,
    nr.value_score::double precision,
    -- value_tag
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END,
    -- value_tier (same logic)
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END,
    -- projection_confidence from mv (already 0-100 clamped)
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision,
    -- risk_rating from risk model
    COALESCE(risk.risk_percent, 50.0)::double precision,
    -- matchup_rating (text)
    COALESCE(nr.matchup_rating::text, 'Neutral'),
    -- upside_rating: breakout probability (0-100 scale)
    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision,
    -- captain_score from v_captain_scores
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision,
    -- captain_rating
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END,
    -- ai_recommendation from ai.player_ai_analysis
    COALESCE(aia.recommendation, NULL),
    -- recommendation_color
    CASE COALESCE(aia.recommendation, '')
      WHEN 'BUY'   THEN 'green'
      WHEN 'START' THEN 'teal'
      WHEN 'SELL'  THEN 'red'
      WHEN 'SIT'   THEN 'yellow'
      ELSE 'grey'
    END,
    -- recommendation_short
    aia.summary_short,
    -- recommendation_why
    aia.summary_short,
    -- ai_summary (full)
    aia.summary_long,
    -- ai_updated_at
    aia.generated_at,
    -- consistency_tier
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END,
    0,
    now(),
    now()
  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.v_player_risk_model      risk ON risk.player_id = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id  = nr.player_id;

  -- Override price from canonical import table where available
  UPDATE afl.player_rankings_cache c
  SET
    price      = i."PRICE",
    value_score = CASE
      WHEN i."PRICE" IS NULL OR i."PRICE" = 0 THEN 0
      ELSE ROUND((c.projection_final / (i."PRICE"::numeric / 100000.0) * 10)::numeric, 2)
    END,
    value_tag = CASE
      WHEN i."PRICE" IS NULL OR i."PRICE" = 0 THEN NULL
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END,
    value_tier = CASE
      WHEN i."PRICE" IS NULL OR i."PRICE" = 0 THEN NULL
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (c.projection_final / (i."PRICE"::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END
  FROM afl.player_prices_import i
  WHERE c.player_id = i.player_id
  AND i."PRICE" IS NOT NULL
  AND i."PRICE" > 0;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$func$;
