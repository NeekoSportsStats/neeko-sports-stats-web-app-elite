
/*
  # Fix: afl.refresh_player_rankings_cache() — correct AI column names

  ## Problem
  Previous version of refresh_player_rankings_cache() used wrong column names:
  - reco.recommendation  (actual: reco.recommendation_label)
  - reco.why             (actual: reco.recommendation_short)
  - ai.recommendation    (actual: aic.recommendation) ✓ correct
  - ai.why               (actual: aic.why) ✓ correct
  - ai.summary           (actual: aic.summary) ✓ correct
  - ai.generated_at      (actual: aic.generated_at) ✓ correct

  This caused the function to fail silently during cache refresh, leaving the
  cache empty and rankings returning 0 rows.

  Also removed: JOIN on afl.v_ai_player_analysis_input (expensive, only used for
  value_tag which is now derived inline).

  ## Fix
  Rewrite with verified column names from:
  - public.ai_rankings_player_recos: recommendation_label, recommendation_short, recommendation_color
  - public.ai_player_content: recommendation, why, summary, generated_at
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN

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

    NULL::text AS value_tag,

    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

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
      ELSE 'grey' END),
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

  UPDATE afl.player_rankings_cache
  SET total_count = (SELECT COUNT(*) FROM afl.player_rankings_cache);

END;
$$;
