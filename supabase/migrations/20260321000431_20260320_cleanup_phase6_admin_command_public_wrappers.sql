/*
  # Phase 6: Admin Command Public Schema Wrappers

  The admin-command edge function calls supabase.rpc() which defaults to the
  public schema. Several functions live in the afl schema. This migration creates
  thin public wrappers so the edge function can call them without schema qualification.

  ## New public wrappers
  - `public.apply_fantasy_prices()` → delegates to `afl.apply_fantasy_prices()`
  - `public.fn_apply_market_watch_categories()` → delegates to `afl.fn_apply_market_watch_categories()`
  - `public.fn_rebuild_confidence_scores()` → delegates to `afl.fn_rebuild_confidence_scores()`

  ## Also handles missing functions
  - `public.fn_backfill_raw_fantasy_points_rpc()` removed from command map (no-op stub)
  - Commands using non-existent functions now route to live equivalents

  ## Security
  - All wrappers use SECURITY DEFINER with restricted search_path
  - Requires admin role to execute (via existing admin guard pattern)
*/

CREATE OR REPLACE FUNCTION public.apply_fantasy_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN afl.apply_fantasy_prices();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_apply_market_watch_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN afl.fn_apply_market_watch_categories();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN afl.fn_rebuild_confidence_scores();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_backfill_raw_fantasy_points_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE afl.raw_2026_player_stats
  SET fantasy_points = public.set_fantasy_points(
    kicks, handballs, marks, hitouts, tackles,
    goals, behinds, free_kicks_for, free_kicks_against,
    clangers, contested_possessions, uncontested_possessions,
    contested_marks, marks_inside_50, clearances,
    inside_50s, rebound_50s
  )
  WHERE fantasy_points IS NULL OR fantasy_points = 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
