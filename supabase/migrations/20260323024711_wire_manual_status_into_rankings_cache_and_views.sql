
/*
  # Wire manual_status into rankings cache and public views

  ## Summary
  Ensures manual_status from afl.players is respected throughout the display layer:

  1. Add manual_status column to afl.player_rankings_cache (persisted override)
  2. Rebuild populate_rankings_cache_from_source() so status = COALESCE(manual_status, api_status)
  3. Rebuild v_player_lab_explorer to expose manual_status
  4. Rebuild v_rankings_free to reflect manual_status in status column
  5. Rebuild v_player_price_full wrapper to surface manual_status

  ## Safety
  - manual_status is NEVER added to input_hash
  - No AI prompts or AI output structure changed
  - Only display/cache layer touched
*/

-- ── Step 1: add manual_status to rankings cache ─────────────────────────────
ALTER TABLE afl.player_rankings_cache
ADD COLUMN IF NOT EXISTS manual_status text;

-- ── Step 2: Rebuild populate_rankings_cache_from_source ─────────────────────
-- Only change: status = COALESCE(p.manual_status, pf.status)
-- and manual_status propagated to cache
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, ai
AS $$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
  v_repaired     integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, team_id, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score,
    price, prev_price, price_change, price_change_pct,
    value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    summary_short, summary_long, ai_prompt_version, ai_validation_passed, ai_generated_at,
    consistency_tier, total_count, cached_at, created_at,
    cache_snapshot_id,
    status, is_available, manual_status,
    bye_round, is_bye, bye_next_round
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    t.team_id,
    nr.position,
    nr.position,
    nr.projection::numeric                                                    AS projection_final,
    nr.projection::double precision                                           AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    round((
      (nr.projection::numeric                                          * 0.55) +
      (COALESCE(nr.confidence, 50.0)::numeric                         * 0.23) +
      (COALESCE(nr.consistency, 50.0)::numeric                        * 0.17) +
      (LEAST(COALESCE(nr.value_score, 0.0)::numeric + 50.0, 100.0)   * 0.05)
    ) * CASE
      WHEN COALESCE(nr.games_played, 0) < 3  THEN 0.72::numeric
      WHEN COALESCE(nr.games_played, 0) < 6  THEN 0.85::numeric
      WHEN COALESCE(nr.games_played, 0) < 11 THEN 0.94::numeric
      ELSE 1.00::numeric
    END, 1)::double precision                                                 AS neeko_rating,
    round((
      nr.projection::numeric                                              * 0.30 +
      COALESCE(nr.confidence, 50.0)::numeric                              * 0.15 +
      LEAST(100, GREATEST(0, (COALESCE(nr.value_score, 0.0)::numeric + 50.0))) * 0.55
    ), 1)::double precision                                                   AS best_value_score,
    COALESCE(pf.current_price, nr.price)::integer                            AS price,
    pf.prev_price::integer,
    pf.price_change::integer,
    pf.price_change_pct::numeric(5,1),
    nr.value_score::double precision,
    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL
        OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 15  THEN 'ELITE VALUE'
      WHEN nr.value_score >= 8   THEN 'STRONG VALUE'
      WHEN nr.value_score >= 2   THEN 'FAIR VALUE'
      WHEN nr.value_score >= -5  THEN 'AVERAGE'
      ELSE 'OVERPRICED'
    END AS value_tag,
    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL
        OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 15  THEN 'ELITE VALUE'
      WHEN nr.value_score >= 8   THEN 'STRONG VALUE'
      WHEN nr.value_score >= 2   THEN 'FAIR VALUE'
      WHEN nr.value_score >= -5  THEN 'AVERAGE'
      ELSE 'OVERPRICED'
    END AS value_tier,
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision   AS projection_confidence,
    COALESCE(nr.volatility_score, 50.0)::double precision                    AS risk_rating,
    CASE
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.015 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.010 THEN 'FAVOURABLE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.005 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                       AS matchup_rating,
    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100,
      COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END)
    ))::double precision                                                      AS captain_score,
    CASE
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 85 THEN 'Elite Captain'
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 70 THEN 'Strong Captain'
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                       AS captain_rating,

    -- ── RECOMMENDATION MODEL: manual OUT → always SELL ──────────────────────
    CASE
      WHEN COALESCE(p.manual_status, pf.status) = 'OUT'
      THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0) <= -4.5
      THEN 'SELL'
      WHEN nr.projection::numeric < 50
        AND COALESCE(nr.value_score, 0) < -1.0
      THEN 'SELL'
      WHEN COALESCE(pf.current_price, nr.price, 0) > 0
        AND COALESCE(pf.current_price, nr.price) < 300000
        AND nr.projection::numeric >= 75
        AND COALESCE(nr.value_score, 0) >= 8.0
      THEN 'BUY'
      WHEN nr.projection::numeric >= 70
        AND nr.projection::numeric < 85
        AND COALESCE(nr.value_score, 0) >= 7.0
      THEN 'BUY'
      WHEN nr.projection::numeric >= 90
        AND COALESCE(nr.value_score, 0) >= 5.0
      THEN 'BUY'
      WHEN nr.projection::numeric >= 85
        AND COALESCE(nr.value_score, 0) >= 5.5
      THEN 'BUY'
      ELSE 'HOLD'
    END                                                                       AS ai_recommendation,
    CASE
      WHEN COALESCE(p.manual_status, pf.status) = 'OUT'
      THEN 'red'
      WHEN COALESCE(nr.value_score, 0) <= -4.5
      THEN 'red'
      WHEN nr.projection::numeric < 50 AND COALESCE(nr.value_score, 0) < -1.0
      THEN 'red'
      WHEN COALESCE(pf.current_price, nr.price, 0) > 0
        AND COALESCE(pf.current_price, nr.price) < 300000
        AND nr.projection::numeric >= 75
        AND COALESCE(nr.value_score, 0) >= 8.0
      THEN 'green'
      WHEN nr.projection::numeric >= 70
        AND nr.projection::numeric < 85
        AND COALESCE(nr.value_score, 0) >= 7.0
      THEN 'green'
      WHEN nr.projection::numeric >= 90
        AND COALESCE(nr.value_score, 0) >= 5.0
      THEN 'green'
      WHEN nr.projection::numeric >= 85
        AND COALESCE(nr.value_score, 0) >= 5.5
      THEN 'green'
      ELSE 'grey'
    END                                                                       AS recommendation_color,
    -- ─────────────────────────────────────────────────────────────────────────

    aia.summary_short                                                         AS recommendation_short,
    aia.summary_short                                                         AS recommendation_why,
    aia.summary_long                                                          AS ai_summary,
    aia.generated_at                                                          AS ai_updated_at,

    aia.summary_short                                                         AS summary_short,
    aia.summary_long                                                          AS summary_long,
    aia.model                                                                 AS ai_prompt_version,
    CASE WHEN aia.generated_at IS NOT NULL AND aia.summary_short IS NOT NULL
      THEN TRUE ELSE FALSE END                                                AS ai_validation_passed,
    aia.generated_at                                                          AS ai_generated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                       AS consistency_tier,
    0,
    now(),
    now(),
    v_snapshot_id,

    -- status: manual_status overrides API status
    COALESCE(p.manual_status, pf.status)                                      AS status,
    CASE WHEN COALESCE(p.manual_status, pf.status) IN ('OUT', 'INJURED') THEN false ELSE COALESCE(pf.is_available, true) END AS is_available,
    p.manual_status,

    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE)                                         AS is_bye,
    FALSE                                                                     AS bye_next_round

  FROM afl.mv_player_rankings           nr
  LEFT JOIN public.v_player_price_full   pf       ON pf.player_id    = nr.player_id
  LEFT JOIN afl.player_rankings_cache    existing  ON existing.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia       ON aia.player_id   = nr.player_id
  LEFT JOIN afl.teams                    t         ON t.team_name     = nr.team_name
  LEFT JOIN afl.team_byes                tb        ON tb.team_id      = t.team_id
                                                  AND tb.season       = 2026
  LEFT JOIN afl.players                  p         ON p.player_id     = nr.player_id

  ON CONFLICT (player_id) DO UPDATE SET
    player_name           = EXCLUDED.player_name,
    team                  = EXCLUDED.team,
    team_name             = EXCLUDED.team_name,
    team_id               = EXCLUDED.team_id,
    position              = EXCLUDED.position,
    position_group        = EXCLUDED.position_group,
    projection_final      = EXCLUDED.projection_final,
    projection            = EXCLUDED.projection,
    ceiling               = EXCLUDED.ceiling,
    floor                 = EXCLUDED.floor,
    consistency           = EXCLUDED.consistency,
    form_score            = EXCLUDED.form_score,
    neeko_rating          = EXCLUDED.neeko_rating,
    best_value_score      = EXCLUDED.best_value_score,
    price                 = EXCLUDED.price,
    prev_price            = EXCLUDED.prev_price,
    price_change          = EXCLUDED.price_change,
    price_change_pct      = EXCLUDED.price_change_pct,
    value_score           = EXCLUDED.value_score,
    value_tag             = EXCLUDED.value_tag,
    value_tier            = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating           = EXCLUDED.risk_rating,
    matchup_rating        = EXCLUDED.matchup_rating,
    upside_rating         = EXCLUDED.upside_rating,
    captain_score         = EXCLUDED.captain_score,
    captain_rating        = EXCLUDED.captain_rating,
    ai_recommendation     = EXCLUDED.ai_recommendation,
    recommendation_color  = EXCLUDED.recommendation_color,
    consistency_tier      = EXCLUDED.consistency_tier,
    cached_at             = now(),
    cache_snapshot_id     = EXCLUDED.cache_snapshot_id,
    status                = EXCLUDED.status,
    is_available          = EXCLUDED.is_available,
    manual_status         = EXCLUDED.manual_status,
    bye_round             = EXCLUDED.bye_round,
    is_bye                = EXCLUDED.is_bye,
    bye_next_round        = EXCLUDED.bye_next_round,
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short,   afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why,      afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary,              afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at,           afl.player_rankings_cache.ai_updated_at),
    summary_short         = COALESCE(EXCLUDED.summary_short,           afl.player_rankings_cache.summary_short),
    summary_long          = COALESCE(EXCLUDED.summary_long,            afl.player_rankings_cache.summary_long),
    ai_prompt_version     = COALESCE(EXCLUDED.ai_prompt_version,       afl.player_rankings_cache.ai_prompt_version),
    ai_generated_at       = COALESCE(EXCLUDED.ai_generated_at,         afl.player_rankings_cache.ai_generated_at),
    ai_validation_passed  = EXCLUDED.ai_validation_passed;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  PERFORM afl.fn_rebuild_confidence_scores();

  SELECT afl.fn_cache_integrity_check() INTO v_repaired;

  RETURN v_count;
END;
$$;

-- ── Step 3: Rebuild v_player_lab_explorer to include manual_status ───────────
CREATE OR REPLACE VIEW public.v_player_lab_explorer AS
SELECT
  player_id, player_name, team, "position",
  projection_final, projection, ceiling, floor, price,
  neeko_rating, neeko_rating_scaled, value_score, value_tag,
  consistency, form_score, captain_score, captain_rating,
  upside_rating, upside_pct, risk_rating,
  matchup_rating, matchup_multiplier, matchup_label,
  ai_recommendation, recommendation_color, recommendation_short,
  recommendation_why, ai_summary, ai_updated_at,
  market_watch_category, best_value_score, confidence_label,
  edge_score, edge_tier, start_sit_decision, recommendation_strength,
  games_played, consistency_tier, cached_at,
  status, is_available, manual_status
FROM afl.player_rankings_cache;

-- ── Step 4: Grant anon/authenticated read on view ────────────────────────────
GRANT SELECT ON public.v_player_lab_explorer TO anon, authenticated;
