/*
  # Fix Rankings — Add Breakeven (2026 Season Average)

  ## Summary
  Adds breakeven column to rankings cache using 2026 season average.
  Matches Market Watch logic for consistency across site.

  ## Implementation
  1. Add breakeven column
  2. Backfill with AVG(fantasy_score) from 2026 games
  3. Update cache populate function
  4. Expose in public views
*/

-- ============================================================
-- 1. Add breakeven column
-- ============================================================
ALTER TABLE afl.player_rankings_cache
ADD COLUMN IF NOT EXISTS breakeven integer;

COMMENT ON COLUMN afl.player_rankings_cache.breakeven IS
'Player breakeven score (2026 season average). Matches Market Watch breakeven logic.';

-- ============================================================
-- 2. Backfill breakeven from 2026 season average
-- ============================================================
WITH season_avg AS (
  SELECT
    player_id,
    ROUND(AVG(fantasy_score)::numeric, 0)::integer AS avg_2026
  FROM afl.player_games
  WHERE season = 2026
    AND fantasy_score IS NOT NULL
  GROUP BY player_id
)
UPDATE afl.player_rankings_cache c
SET breakeven = COALESCE(
  sa.avg_2026,
  ROUND(COALESCE(c.price, 0)::numeric / 7200.0, 0)::integer
)
FROM season_avg sa
WHERE c.player_id = sa.player_id;

-- Fallback for players with no 2026 games (use formula)
UPDATE afl.player_rankings_cache
SET breakeven = ROUND(COALESCE(price, 0)::numeric / 7200.0, 0)::integer
WHERE breakeven IS NULL
  AND price IS NOT NULL;

-- ============================================================
-- 3. Update populate function
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

  WITH season_avg AS (
    SELECT
      player_id,
      ROUND(AVG(fantasy_score)::numeric, 0)::integer AS avg_2026
    FROM afl.player_games
    WHERE season = 2026
      AND fantasy_score IS NOT NULL
    GROUP BY player_id
  )
  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, team_id, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score,
    price, prev_price, price_change, price_change_pct,
    breakeven,
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
    ), 1)::double precision                                                  AS neeko_rating,
    nr.value_score::double precision                                         AS best_value_score,
    imp.price::integer,
    imp.price_r0::integer                                                    AS prev_price,
    (imp.price - imp.price_r0)::integer                                      AS price_change,
    CASE WHEN imp.price_r0 > 0
      THEN round(((imp.price - imp.price_r0)::numeric / imp.price_r0) * 100, 1)
      ELSE 0.0
    END::double precision                                                    AS price_change_pct,
    COALESCE(
      sa.avg_2026,
      ROUND(COALESCE(imp.price, 0)::numeric / 7200.0, 0)::integer
    )                                                                        AS breakeven,
    nr.value_score::double precision,
    nr.value_tier,
    nr.value_tier,
    nr.confidence::double precision                                          AS projection_confidence,
    nr.risk_score::double precision                                          AS risk_rating,
    nr.matchup_label                                                         AS matchup_rating,
    nr.upside_pct::double precision                                          AS upside_rating,
    nr.captain_confidence::double precision                                  AS captain_score,
    nr.captain_label                                                         AS captain_rating,
    ai.ai_recommendation,
    ai.recommendation_color,
    ai.recommendation_short,
    ai.primary_reason                                                        AS recommendation_why,
    ai.ai_summary,
    ai.generated_at                                                          AS ai_updated_at,
    nr.consistency_tier,
    0                                                                        AS total_count,
    now()                                                                    AS cached_at,
    now()                                                                    AS created_at,
    v_snapshot_id,
    'active'                                                                 AS status,
    NOT (COALESCE(nr.is_injured, FALSE) OR COALESCE(tb.is_bye_active, FALSE)) AS is_available,
    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE)                                        AS is_bye,
    FALSE                                                                    AS bye_next_round
  FROM afl.mv_player_rankings nr
  LEFT JOIN afl.teams t            ON t.team_name = nr.team_name
  LEFT JOIN afl.team_byes tb       ON tb.team_id = t.team_id AND tb.season = 2026
  LEFT JOIN afl.player_prices imp  ON imp.player_id = nr.player_id AND imp.season = 2026 AND imp.round_number = 1
  LEFT JOIN afl.ai_rankings_player_recos ai ON ai.player_id = nr.player_id
  LEFT JOIN season_avg sa          ON sa.player_id = nr.player_id
  WHERE nr.player_id IS NOT NULL
  ON CONFLICT (player_id) DO UPDATE
  SET
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
    breakeven             = EXCLUDED.breakeven,
    value_score           = EXCLUDED.value_score,
    value_tag             = EXCLUDED.value_tag,
    value_tier            = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating           = EXCLUDED.risk_rating,
    matchup_rating        = EXCLUDED.matchup_rating,
    upside_rating         = EXCLUDED.upside_rating,
    captain_score         = EXCLUDED.captain_score,
    captain_rating        = EXCLUDED.captain_rating,
    consistency_tier      = EXCLUDED.consistency_tier,
    cached_at             = EXCLUDED.cached_at,
    cache_snapshot_id     = EXCLUDED.cache_snapshot_id,
    status                = EXCLUDED.status,
    is_available          = EXCLUDED.is_available,
    bye_round             = EXCLUDED.bye_round,
    is_bye                = EXCLUDED.is_bye,
    bye_next_round        = EXCLUDED.bye_next_round,
    ai_recommendation     = COALESCE(EXCLUDED.ai_recommendation, afl.player_rankings_cache.ai_recommendation),
    recommendation_color  = COALESCE(EXCLUDED.recommendation_color, afl.player_rankings_cache.recommendation_color),
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why, afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary, afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at, afl.player_rankings_cache.ai_updated_at);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 4. Update public views
-- ============================================================
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_master
WITH (security_invoker = true)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.projection_final AS projection,
  c.breakeven,
  c.ceiling,
  c.floor,
  c.consistency,
  c.form_score,
  c.neeko_rating,
  c.price,
  c.prev_price,
  c.price_change,
  c.price_change_pct,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.projection_confidence AS confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.status,
  c.is_available,
  c.is_bye,
  c.bye_round,
  c.cached_at
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker = true)
AS
SELECT
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.projection,
  p.breakeven,
  p.ceiling,
  p.neeko_rating,
  p.price,
  p.price_change,
  p.value_score,
  p.value_tag,
  p.recommendation_short,
  p.is_bye,
  p.cached_at
FROM public.v_rankings_master p
ORDER BY p.neeko_rating DESC NULLS LAST
LIMIT 100;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
