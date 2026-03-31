/*
  # Create afl.refresh_player_rankings_cache()

  ## Summary
  Creates a function that fully rebuilds afl.player_rankings_cache from the
  upstream source views (v_neeko_rating + v_ai_player_metrics + ai_rankings_player_recos
  + ai_player_analysis + v_ai_player_analysis_input).

  This replaces the previous pipeline which only refreshed mv_player_rankings
  (a materialized view that wasn't being used by the frontend at all).

  ## Key design decisions:
  - Uses TRUNCATE + INSERT (not UPSERT) for atomic rebuild — no partial reads
  - Joins v_ai_player_metrics directly (not v_ai_player_ai_inputs) to avoid
    the circular dependency that caused infinite recursion
  - Uses DISTINCT ON (player_id) on ai_rankings_player_recos to always take
    the MOST RECENT AI record per player (fixes wrong-record join bug)
  - Populates recommendation_short as the first sentence of recommendation_long
    if recommendation_short is NULL
  - total_count populated as a constant (total rows in the insert)
  - Sets cached_at timestamp for staleness detection

  ## Called by:
  - afl.refresh_mv_player_rankings() (wired in next migration)
  - Can be called directly for manual refresh
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_total_count integer;
BEGIN

  -- Count total players for total_count column
  SELECT COUNT(DISTINCT nr.player_id)
  INTO v_total_count
  FROM afl.v_neeko_rating nr;

  -- Atomic rebuild: truncate then insert
  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id,
    player_name,
    team,
    position,
    team_name,
    position_group,
    neeko_rating,
    projection_final,
    projection,
    ceiling,
    floor,
    consistency,
    form_score,
    price,
    value_score,
    projection_confidence,
    risk_rating,
    matchup_rating,
    upside_rating,
    captain_score,
    captain_rating,
    ai_recommendation,
    recommendation_why,
    recommendation_short,
    recommendation_color,
    ai_summary,
    ai_updated_at,
    value_tag,
    value_tier,
    consistency_tier,
    total_count,
    cached_at
  )
  SELECT
    nr.player_id,
    nr.player_name,

    -- team/position for backward compatibility with existing dependents
    nr.team_name                                                        AS team,
    nr.position_group                                                   AS position,

    -- team_name/position_group for frontend normalization block
    nr.team_name                                                        AS team_name,
    nr.position_group                                                   AS position_group,

    -- Core ratings
    ROUND(nr.neeko_rating::numeric, 2)                                  AS neeko_rating,
    ROUND(nr.projection::numeric, 2)                                    AS projection_final,
    ROUND(nr.projection::numeric, 2)                                    AS projection,
    nr.ceiling::double precision                                        AS ceiling,
    ROUND(nr.floor::numeric, 2)::double precision                      AS floor,
    ROUND(nr.consistency::numeric, 2)::double precision                AS consistency,
    ROUND(nr.form_score::numeric, 2)::double precision                 AS form_score,

    -- Price & value
    nr.price,
    ROUND(nr.value_score::numeric, 2)::double precision                AS value_score,

    -- Signal ratings (clamped 0–100)
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::numeric, 1)::double precision
                                                                        AS projection_confidence,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0)) * 100)::numeric, 1)::double precision
                                                                        AS risk_rating,
    COALESCE(met.matchup_rating, 'Neutral')                             AS matchup_rating,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0)) * 100)::numeric, 1)::double precision
                                                                        AS upside_rating,
    ROUND(LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))::numeric, 1)::double precision
                                                                        AS captain_score,

    -- Captain rating label
    CASE
      WHEN COALESCE(met.captain_score, 0) >= 70 THEN 'Elite'
      WHEN COALESCE(met.captain_score, 0) >= 50 THEN 'Strong'
      WHEN COALESCE(met.captain_score, 0) >= 30 THEN 'Viable'
      ELSE 'Avoid'
    END                                                                 AS captain_rating,

    -- AI recommendation (most recent record per player via DISTINCT ON)
    reco.recommendation_label                                           AS ai_recommendation,
    reco.recommendation_long                                            AS recommendation_why,

    -- recommendation_short: use stored value if present, else derive from first sentence of long
    CASE
      WHEN reco.recommendation_short IS NOT NULL AND reco.recommendation_short != ''
        THEN reco.recommendation_short
      WHEN reco.recommendation_long IS NOT NULL
        THEN CASE
          WHEN POSITION('.' IN reco.recommendation_long) > 0
            THEN TRIM(SUBSTRING(reco.recommendation_long FROM 1 FOR POSITION('.' IN reco.recommendation_long)))
          ELSE LEFT(reco.recommendation_long, 120)
        END
      ELSE NULL
    END                                                                 AS recommendation_short,

    reco.recommendation_color                                           AS recommendation_color,

    -- AI summary (most recent per player)
    ai.analysis                                                         AS ai_summary,
    COALESCE(ai.generated_at, reco.updated_at)                         AS ai_updated_at,

    -- Value classification
    vtag.value_tag                                                      AS value_tag,

    -- Value tier (computed inline, same formula as v_ai_player_ai_inputs)
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END                                                                 AS value_tier,

    -- Consistency tier (derived)
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                 AS consistency_tier,

    v_total_count                                                       AS total_count,
    now()                                                               AS cached_at

  FROM afl.v_neeko_rating nr

  LEFT JOIN afl.v_ai_player_metrics met
    ON nr.player_id = met.player_id

  -- DISTINCT ON ensures only the most recent AI reco record per player
  LEFT JOIN (
    SELECT DISTINCT ON (player_id)
      player_id, recommendation_label, recommendation_short,
      recommendation_long, recommendation_color, updated_at, input_hash
    FROM public.ai_rankings_player_recos
    ORDER BY player_id, updated_at DESC NULLS LAST
  ) reco ON nr.player_id = reco.player_id::int

  -- DISTINCT ON for ai_player_analysis too
  LEFT JOIN (
    SELECT DISTINCT ON (player_id)
      player_id, analysis, captain_recommendation, generated_at
    FROM public.ai_player_analysis
    ORDER BY player_id, generated_at DESC NULLS LAST
  ) ai ON nr.player_id = ai.player_id::int

  LEFT JOIN afl.v_ai_player_analysis_input vtag
    ON nr.player_id = vtag.player_id;

END;
$$;
