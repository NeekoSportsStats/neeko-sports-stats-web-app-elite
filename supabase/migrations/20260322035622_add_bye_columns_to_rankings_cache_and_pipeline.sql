/*
  # Add Bye Columns to Rankings Cache and Pipeline

  ## Summary
  Adds bye metadata fields to afl.player_rankings_cache and updates the
  populate_rankings_cache_from_source() function to join team_byes and
  propagate bye state into every player row.

  ## New Columns on afl.player_rankings_cache
  - `bye_round` (INT) — the round this player's team has a bye; NULL if not set
  - `is_bye` (BOOLEAN DEFAULT false) — true when next round to be played = bye_round
  - `bye_next_round` (BOOLEAN DEFAULT false) — true when bye_round = current_round + 2

  ## Current Round Source
  Uses afl.games WHERE season=2026 AND home_score IS NOT NULL, which is the
  live table used by the existing pipeline. Falls back to 0 if no data.

  ## Pipeline Join Point
  Single join in afl.populate_rankings_cache_from_source() on team_name + season.
  All downstream views read from player_rankings_cache and inherit bye fields.

  ## Safety
  - Idempotent (IF NOT EXISTS, ON CONFLICT DO UPDATE)
  - Does NOT touch projection_confidence
  - Does NOT delete any rows
  - Does NOT break existing joins
*/

-- ── STEP 1: Add bye columns ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'bye_round'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN bye_round INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'is_bye'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN is_bye BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'bye_next_round'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN bye_next_round BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ── STEP 2: Helper function — current AFL round ──────────────────────────────
-- Uses afl.games which is the live source. Returns 0 if no games yet played.

CREATE OR REPLACE FUNCTION afl.get_current_round(p_season INT DEFAULT 2026)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT COALESCE(MAX(week), 0)
  FROM afl.games
  WHERE season = p_season
    AND home_score IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION afl.get_current_round(int) TO authenticated, anon;

-- ── STEP 3: Rebuild populate_rankings_cache_from_source with bye join ────────

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
  v_current_round int;
BEGIN
  SET LOCAL statement_timeout = '120s';

  SELECT afl.get_current_round(2026) INTO v_current_round;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
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
    COALESCE(tb.bye_round = v_current_round + 1, false)                      AS is_bye,
    COALESCE(tb.bye_round = v_current_round + 2, false)                      AS bye_next_round

  FROM afl.mv_player_rankings           nr
  LEFT JOIN public.v_player_price_full   pf       ON pf.player_id    = nr.player_id
  LEFT JOIN afl.player_rankings_cache    existing  ON existing.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia       ON aia.player_id   = nr.player_id
  LEFT JOIN afl.team_byes                tb        ON tb.team_name    = nr.team_name
                                                  AND tb.season       = 2026

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
$function$;

-- ── STEP 4: Backfill existing cache rows with bye data ───────────────────────

DO $$
DECLARE
  v_current_round int;
BEGIN
  SELECT afl.get_current_round(2026) INTO v_current_round;

  UPDATE afl.player_rankings_cache c
  SET
    bye_round      = tb.bye_round,
    is_bye         = COALESCE(tb.bye_round = v_current_round + 1, false),
    bye_next_round = COALESCE(tb.bye_round = v_current_round + 2, false)
  FROM afl.team_byes tb
  WHERE tb.team_name = c.team_name
    AND tb.season    = 2026;

  RAISE NOTICE 'Bye backfill done. Round: %, rows with bye_round: %',
    v_current_round,
    (SELECT COUNT(*) FROM afl.player_rankings_cache WHERE bye_round IS NOT NULL);
END $$;

-- ── STEP 5: Admin RPC to update a single team's bye round ────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_team_bye(
  p_team_name  TEXT,
  p_season     INT,
  p_bye_round  INT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  INSERT INTO afl.team_byes (team_name, season, bye_round)
  VALUES (p_team_name, p_season, p_bye_round)
  ON CONFLICT (team_name, season)
  DO UPDATE SET bye_round = EXCLUDED.bye_round, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'team_name', p_team_name, 'season', p_season, 'bye_round', p_bye_round);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_team_bye(text, int, int) TO authenticated;

-- ── STEP 6: Public RPC to read all team byes ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_team_byes(p_season INT DEFAULT 2026)
RETURNS TABLE (team_name TEXT, season INT, bye_round INT, updated_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT team_name, season, bye_round, updated_at
  FROM afl.team_byes
  WHERE season = p_season
  ORDER BY team_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_byes(int) TO authenticated, anon;
