
/*
  # Fix: rankings cache refresh — full column set

  ## Problem
  afl.refresh_player_rankings_cache() only inserts a subset of columns:
  player_id, player_name, team, projection_final, value_score, ai fields, created_at

  Missing columns:
  - position, neeko_rating, ceiling, floor, consistency, form_score
  - price, matchup_rating, upside_rating, captain_score, captain_rating
  - projection_confidence, risk_rating, value_tag, value_tier
  - consistency_tier, total_count, team_name, position_group, projection, cached_at

  This causes afl.player_rankings_cache to be empty or have incomplete rows,
  which breaks Market Watch (v_mw_premium queries player_rankings_cache) and
  all public rankings views that depend on the cache.

  ## Fix
  Replace refresh_player_rankings_cache() with a full-column version that
  reads from public.v_player_rankings_full (736 rows, all data present).

  ## Tables Modified
  - afl.player_rankings_cache: truncate + full repopulation
  - afl.refresh_player_rankings_cache(): replaced with full column set

  ## Notes
  - Uses OR REPLACE so no DROP needed
  - Immediately calls the function to populate the cache
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
    player_id,
    player_name,
    team,
    team_name,
    position,
    position_group,

    projection_final,
    projection,
    ceiling,
    floor,
    consistency,
    form_score,

    neeko_rating,
    price,
    value_score,
    value_tag,
    value_tier,

    projection_confidence,
    risk_rating,
    matchup_rating,
    upside_rating,
    captain_score,
    captain_rating,

    ai_recommendation,
    recommendation_color,
    recommendation_short,
    recommendation_why,
    ai_summary,
    ai_updated_at,

    consistency_tier,
    total_count,
    cached_at,
    created_at
  )
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.team_name,
    r.position,
    r.position_group,

    r.projection_final,
    r.projection_final,
    r.ceiling,
    r.floor,
    r.consistency_score,
    r.form_rating,

    r.neeko_rating,
    r.price,
    r.value_score,
    r.value_tag,
    r.value_tier,

    r.projection_confidence,
    r.risk_rating,
    r.matchup_rating,
    r.upside_rating,
    r.captain_score,
    r.captain_rating,

    r.recommendation,
    CASE
      WHEN r.recommendation = 'BUY'  THEN 'green'
      WHEN r.recommendation = 'SELL' THEN 'red'
      WHEN r.recommendation = 'SIT'  THEN 'yellow'
      ELSE 'grey'
    END,
    r.recommendation_short,
    r.recommendation_short,
    r.ai_summary,
    r.ai_updated_at,

    r.consistency_tier,
    r.total_count,
    now(),
    now()

  FROM public.v_player_rankings_full r;

END;
$$;

-- Immediately populate the cache
SELECT afl.refresh_player_rankings_cache();
