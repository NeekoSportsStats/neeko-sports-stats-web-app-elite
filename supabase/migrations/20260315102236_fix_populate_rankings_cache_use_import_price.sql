/*
  # Fix populate_rankings_cache_from_source — Use Import Price

  ## Summary
  The cache population function now overwrites prices from the view chain with
  the authoritative price from afl.player_prices_import immediately after the
  INSERT. This guarantees the cache always reflects admin-entered prices.

  ## Changes

  ### populate_rankings_cache_from_source()
  - After TRUNCATE + INSERT (which gets price from v_neeko_rating → v_latest_player_prices → afl.player_prices)
  - Immediately UPDATE cache price FROM afl.player_prices_import WHERE player_id matches
  - Recalculates value_score and value_tag using the corrected price
  - This two-step approach avoids rebuilding the entire view chain

  ### Why two-step rather than changing the JOIN in the SELECT?
  - v_neeko_rating → v_player_value_engine → v_latest_player_prices → afl.player_prices
    is a deep CASCADE that cannot be modified without dropping and recreating all views
  - afl.player_prices IS already kept in sync by admin_update_fantasy_prices()
  - The post-INSERT UPDATE is a safe, zero-disruption override
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
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
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,
    LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::double precision,
    COALESCE(risk.risk_percent, 50.0)::double precision,
    COALESCE(met.matchup_rating, 'Neutral'),
    LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0) * 100))::double precision,
    GREATEST(0, COALESCE(met.captain_score, 0))::double precision,
    CASE
      WHEN COALESCE(met.captain_score, 0) >= 90 THEN 'Elite Captain'
      WHEN COALESCE(met.captain_score, 0) >= 75 THEN 'Strong Captain'
      WHEN COALESCE(met.captain_score, 0) >= 60 THEN 'Captain Option'
      ELSE 'Avoid'
    END,
    COALESCE(reco.recommendation_label, aic.recommendation),
    COALESCE(reco.recommendation_color, CASE
      WHEN aic.recommendation = 'BUY'   THEN 'green'
      WHEN aic.recommendation = 'START' THEN 'teal'
      WHEN aic.recommendation = 'SELL'  THEN 'red'
      WHEN aic.recommendation = 'SIT'   THEN 'yellow'
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
  LEFT JOIN afl.v_player_risk_model        risk ON risk.player_id = nr.player_id
  LEFT JOIN afl.v_ai_player_metrics         met  ON met.player_id  = nr.player_id
  LEFT JOIN public.ai_player_content        aic  ON aic.player_id  = nr.player_id
  LEFT JOIN public.ai_rankings_player_recos reco ON reco.player_id = nr.player_id;

  -- ── Override price from canonical source (afl.player_prices_import) ──────────
  -- This ensures admin-entered prices always win, regardless of view chain state
  UPDATE afl.player_rankings_cache c
  SET
    price = i."PRICE",
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
$$;
