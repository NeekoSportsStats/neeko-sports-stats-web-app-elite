/*
  # Harden Bye System — Step 2: Rebuild Pipeline + RPCs for team_id + is_bye_active

  ## Summary
  Rebuilds the rankings cache population function and admin RPCs to use team_id joins
  and the is_bye_active manual toggle instead of fragile team_name joins and round math.

  ## Changes

  ### afl.populate_rankings_cache_from_source()
  - DROP + RECREATE (return type conflict fix)
  - Changed bye join: tb.team_id = c.team_id (via afl.teams crosswalk)
  - Changed is_bye logic: COALESCE(tb.is_bye_active, FALSE) — no round math
  - Changed bye_next_round: always FALSE (not tracked by round anymore)
  - Removed v_current_round / get_current_round dependency

  ### public.admin_update_team_bye()
  - Dropped old TEXT-keyed version
  - Recreated with (p_team_id INT, p_season INT, p_bye_round INT)

  ### public.admin_toggle_team_bye() (NEW)
  - Fast toggle: sets is_bye_active on afl.team_byes
  - Immediately syncs is_bye on afl.player_rankings_cache for all team players
  - Returns row count updated

  ### public.get_team_byes()
  - Dropped + recreated to return team_id, team_name, season, bye_round, is_bye_active
*/

-- ============================================================
-- 1. Rebuild populate_rankings_cache_from_source with team_id join
-- ============================================================
DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
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
    consistency_tier, total_count, cached_at, created_at,
    cache_snapshot_id,
    status, is_available,
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
    CASE
      WHEN pf.status = 'OUT'                                              THEN 'SELL'
      WHEN COALESCE(nr.volatility_score, 50.0) >= 72.0                   THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0.0) <= -10.0                        THEN 'SELL'
      WHEN nr.projection::numeric < 40                                    THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0.0) >= 15.0
        AND nr.projection::numeric >= 85
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0                  THEN 'BUY'
      WHEN nr.projection::numeric >= 95
        AND COALESCE(nr.value_score, 0.0) >= 10.0                        THEN 'BUY'
      WHEN nr.projection::numeric >= 75
        AND COALESCE(nr.value_score, 0.0) >= 5.0                         THEN 'HOLD'
      WHEN nr.projection::numeric >= 85                                   THEN 'HOLD'
      WHEN COALESCE(nr.value_score, 0.0) < -5.0                          THEN 'SELL'
      ELSE 'HOLD'
    END                                                                       AS ai_recommendation,
    CASE
      WHEN pf.status = 'OUT'                                              THEN 'red'
      WHEN COALESCE(nr.volatility_score, 50.0) >= 72.0                   THEN 'red'
      WHEN COALESCE(nr.value_score, 0.0) <= -10.0                        THEN 'red'
      WHEN nr.projection::numeric < 40                                    THEN 'red'
      WHEN COALESCE(nr.value_score, 0.0) >= 15.0
        AND nr.projection::numeric >= 85
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0                  THEN 'green'
      WHEN nr.projection::numeric >= 95
        AND COALESCE(nr.value_score, 0.0) >= 10.0                        THEN 'green'
      WHEN nr.projection::numeric >= 75
        AND COALESCE(nr.value_score, 0.0) >= 5.0                         THEN 'grey'
      WHEN nr.projection::numeric >= 85                                   THEN 'grey'
      WHEN COALESCE(nr.value_score, 0.0) < -5.0                          THEN 'red'
      ELSE 'grey'
    END                                                                       AS recommendation_color,
    aia.summary_short                                                         AS recommendation_short,
    aia.summary_short                                                         AS recommendation_why,
    aia.summary_long                                                          AS ai_summary,
    aia.generated_at                                                          AS ai_updated_at,
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
    pf.status,
    COALESCE(pf.is_available, true),
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
    bye_round             = EXCLUDED.bye_round,
    is_bye                = EXCLUDED.is_bye,
    bye_next_round        = EXCLUDED.bye_next_round,
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why,   afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary,           afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at,        afl.player_rankings_cache.ai_updated_at);

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  PERFORM afl.fn_rebuild_confidence_scores();
  RETURN v_count;
END;
$$;

-- ============================================================
-- 2. Rebuild admin_update_team_bye — use team_id, accept is_bye_active
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_update_team_bye(TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.admin_update_team_bye(INT, INT, INT);
DROP FUNCTION IF EXISTS public.admin_update_team_bye(INT, INT, INT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_update_team_bye(
  p_team_id    INT,
  p_season     INT,
  p_bye_round  INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  INSERT INTO afl.team_byes (team_id, season, bye_round, team_name)
  SELECT p_team_id, p_season, p_bye_round, t.team_name
  FROM afl.teams t WHERE t.team_id = p_team_id
  ON CONFLICT (team_id, season) DO UPDATE
    SET bye_round  = EXCLUDED.bye_round,
        updated_at = now();

  UPDATE afl.player_rankings_cache
  SET bye_round = p_bye_round
  WHERE team_id = p_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_team_bye(INT, INT, INT) TO authenticated;

-- ============================================================
-- 3. Create admin_toggle_team_bye — fast manual toggle
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_toggle_team_bye(INT, INT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_toggle_team_bye(
  p_team_id      INT,
  p_season       INT,
  p_is_bye_active BOOLEAN
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  UPDATE afl.team_byes
  SET is_bye_active = p_is_bye_active,
      updated_at    = now()
  WHERE team_id = p_team_id
    AND season   = p_season;

  UPDATE afl.player_rankings_cache
  SET is_bye = p_is_bye_active
  WHERE team_id = p_team_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_team_bye(INT, INT, BOOLEAN) TO authenticated;

-- ============================================================
-- 4. Rebuild get_team_byes — return team_id + is_bye_active
-- ============================================================
DROP FUNCTION IF EXISTS public.get_team_byes(INT);

CREATE OR REPLACE FUNCTION public.get_team_byes(p_season INT DEFAULT 2026)
RETURNS TABLE (
  id            INT,
  team_id       INT,
  team_name     TEXT,
  season        INT,
  bye_round     INT,
  is_bye_active BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    tb.id::INT,
    tb.team_id::INT,
    t.team_name::TEXT,
    tb.season::INT,
    tb.bye_round::INT,
    COALESCE(tb.is_bye_active, FALSE)::BOOLEAN
  FROM afl.team_byes  tb
  JOIN afl.teams       t  ON t.team_id = tb.team_id
  WHERE tb.season = p_season
  ORDER BY t.team_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_byes(INT) TO authenticated, anon;
