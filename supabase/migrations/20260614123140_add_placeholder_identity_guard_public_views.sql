
-- Task 4: Add placeholder identity guard to all public-facing views
-- Players whose name matches Player#XXXX are provider-side identity failures.
-- They have real stats but no resolvable name. Hide from all public surfaces.
-- Admin surfaces (direct table access) retain full visibility.

-- 1. v_rankings_canonical — used by rankings/canonical frontend queries
CREATE OR REPLACE VIEW public.v_rankings_canonical AS
SELECT
  player_id,
  player_name,
  team,
  "position",
  ceiling AS ceiling_estimate,
  projection_final,
  neeko_rating,
  price,
  value_score,
  projection_confidence,
  risk_rating,
  upside_rating,
  captain_score,
  captain_rating,
  signal,
  recommendation_short,
  recommendation_color,
  consistency_tier,
  cached_at,
  confidence_label
FROM afl.player_rankings_cache c
WHERE player_name NOT LIKE 'Player#%';

-- 2. v_player_rankings_cache — broad public cache view
CREATE OR REPLACE VIEW public.v_player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  price,
  prev_price,
  price_change,
  price_change_pct,
  projection_final,
  season_avg,
  last_3_avg,
  last_5_avg,
  games_played,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  team_id,
  signal_canonical,
  category_canonical,
  signal_tag,
  cached_at,
  created_at
FROM afl.player_rankings_cache
WHERE player_name NOT LIKE 'Player#%';

-- 3. v_rankings_free — free tier rankings
CREATE OR REPLACE VIEW public.v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  "position",
  projection_final,
  ceiling,
  floor,
  price,
  breakeven,
  edge,
  baseline,
  trend_score,
  trend_signal,
  value_signal,
  signal,
  signal_tag,
  neeko_rating,
  value_score,
  value_tier,
  consistency,
  form_score,
  games_played,
  status,
  is_available,
  is_bye,
  bye_round,
  cached_at
FROM afl.player_rankings_cache
WHERE is_available = true
  AND player_name NOT LIKE 'Player#%'
ORDER BY projection_final DESC NULLS LAST;

-- 4. v_rankings_master — premium full rankings view
CREATE OR REPLACE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  ceiling_estimate,
  floor_estimate,
  consistency,
  form_score,
  neeko_rating,
  neeko_rating_raw,
  neeko_rating_scaled,
  price,
  value_score,
  value_tag,
  value_tier,
  best_value_score,
  matchup_multiplier,
  matchup_rating,
  matchup_label,
  games_played,
  upside_pct,
  upside_rating,
  signal,
  signal_tag,
  edge,
  baseline,
  season_avg,
  last_3_avg,
  trend_score,
  trend_signal,
  form_delta,
  form_label,
  market_watch_category,
  recommendation_color,
  recommendation_strength,
  captain_score,
  captain_rating,
  ai_summary,
  summary,
  summary_short,
  summary_long,
  analysis,
  recommendation_short,
  recommendation_why,
  ai_prompt_version,
  ai_validation_passed,
  ai_generated_at,
  projection_confidence,
  risk_rating,
  confidence_label,
  consistency_tier,
  prev_price,
  price_change,
  price_change_pct,
  breakeven,
  bye_round,
  is_bye,
  bye_next_round,
  team_id,
  is_available,
  status,
  manual_status,
  cache_snapshot_id,
  cached_at,
  total_count
FROM afl.player_rankings_cache c
WHERE is_available = true
  AND player_name NOT LIKE 'Player#%';

-- 5. market.v_mw_premium — Market Watch premium view
CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  player_id,
  player_name,
  team_name AS team,
  team_name,
  "position",
  price,
  prev_price,
  price_change,
  price_change_pct,
  projection_final,
  season_avg,
  last_3_avg,
  last_5_avg,
  games_played,
  breakeven_canonical AS breakeven,
  edge_canonical AS edge,
  value_score_canonical AS value_score,
  signal_canonical AS signal,
  signal_canonical AS signal_tag,
  category_canonical AS category,
  category_canonical AS market_watch_category,
  action_canonical AS action,
  status,
  is_bye,
  summary_short,
  summary_long,
  neeko_rating,
  consistency,
  form_score,
  matchup_rating,
  matchup_multiplier,
  breakeven_canonical,
  edge_canonical,
  value_score_canonical,
  signal_canonical,
  category_canonical,
  action_canonical,
  cached_at
FROM afl.player_rankings_cache rc
WHERE (status <> ALL (ARRAY['injured'::text, 'delisted'::text]))
  AND projection_final > 0::numeric
  AND price > 0
  AND games_played >= 3
  AND player_name NOT LIKE 'Player#%'
ORDER BY abs(edge_canonical) DESC NULLS LAST;
