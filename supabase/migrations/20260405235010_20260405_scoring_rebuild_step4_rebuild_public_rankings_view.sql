/*
  # Rebuild public.player_rankings_cache view with canonical columns

  ## Summary
  Drops and recreates the public wrapper views for afl.player_rankings_cache
  to expose all canonical columns (breakeven_canonical, edge_canonical,
  value_score_canonical, signal_canonical, category_canonical, action_canonical).

  ## Changes
  - public.player_rankings_cache — full public wrapper with all canonical fields
  - public.v_player_rankings_cache — alias

  ## Security
  - GRANT SELECT to anon + authenticated
*/

DROP VIEW IF EXISTS public.player_rankings_cache CASCADE;
DROP VIEW IF EXISTS public.v_player_rankings_cache CASCADE;

CREATE VIEW public.player_rankings_cache AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.team_name,
  rc.position,
  rc.position_group,
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.price_change_pct,
  rc.projection_final,
  rc.projection,
  rc.ceiling,
  rc.floor,
  rc.season_avg,
  rc.last_3_avg,
  rc.last_5_avg,
  rc.games_played,
  rc.consistency,
  rc.form_score,
  rc.neeko_rating,
  rc.value_score,
  -- canonical columns (primary source of truth)
  rc.breakeven_canonical,
  rc.edge_canonical,
  rc.value_score_canonical,
  rc.signal_canonical,
  rc.category_canonical,
  rc.action_canonical,
  -- legacy aliases pointing to canonical values
  rc.signal_canonical                                          AS signal,
  rc.signal_canonical                                          AS signal_tag,
  rc.category_canonical                                        AS market_watch_category,
  rc.action_canonical                                          AS action,
  rc.breakeven_canonical                                       AS breakeven,
  rc.edge_canonical                                            AS edge,
  rc.value_score_canonical                                     AS value,
  -- status and availability
  rc.status,
  rc.manual_status,
  rc.is_available,
  rc.is_bye,
  rc.bye_round,
  rc.bye_next_round,
  -- AI text fields
  rc.summary_short,
  rc.summary_long,
  -- matchup
  rc.matchup_rating,
  rc.matchup_label,
  rc.matchup_multiplier,
  -- metadata
  rc.cached_at,
  rc.cache_snapshot_id,
  rc.team_id
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('delisted');

GRANT SELECT ON public.player_rankings_cache TO anon, authenticated;

CREATE VIEW public.v_player_rankings_cache AS
SELECT * FROM public.player_rankings_cache;

GRANT SELECT ON public.v_player_rankings_cache TO anon, authenticated;
