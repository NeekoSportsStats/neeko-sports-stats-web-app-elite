
/*
  # Grants and Access for All Reconnected Module Views

  ## Purpose
  Ensure anon and authenticated roles can read all newly created objects.
  Also ensure the market schema views are accessible through the public views.

  ## Objects covered
  - public.v_rankings_canonical
  - public.v_rankings_master
  - public.mv_edge_board
  - public.v_mw_premium
  - public.v_mw_best_trades
  - public.v_mw_summary_cards
  - public.v_mw_category_counts
  - afl.v_projection_accuracy_homepage
  - public.refresh_edge_board()
  - market schema table read access for service role
*/

-- Public views
GRANT SELECT ON public.v_rankings_canonical    TO anon, authenticated;
GRANT SELECT ON public.v_rankings_master       TO anon, authenticated;
GRANT SELECT ON public.mv_edge_board           TO anon, authenticated;
GRANT SELECT ON public.v_mw_premium            TO anon, authenticated;
GRANT SELECT ON public.v_mw_best_trades        TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary_cards      TO anon, authenticated;
GRANT SELECT ON public.v_mw_category_counts    TO anon, authenticated;

-- AFL schema accuracy view
GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;

-- Refresh function (authenticated only — admin operation)
GRANT EXECUTE ON FUNCTION public.refresh_edge_board() TO authenticated;

-- Market schema tables — service_role needs read for the SECURITY DEFINER views
GRANT USAGE  ON SCHEMA market TO anon, authenticated;
GRANT SELECT ON market.market_watch_snapshot         TO anon, authenticated;
GRANT SELECT ON market.market_watch_snapshot_players TO anon, authenticated;
GRANT SELECT ON market.market_watch_best_trades      TO anon, authenticated;

-- Ensure afl schema read for joining from market views
GRANT SELECT ON afl.player_rankings_cache TO anon, authenticated;

-- projection_accuracy table (public schema)
GRANT SELECT ON public.projection_accuracy TO anon, authenticated;
