/*
  # Rebuild get_position_players_safe — Canonical Field Names via afl.v_rankings_core

  ## Summary
  Rebuilds get_position_players_safe to read from afl.v_rankings_core instead of
  afl.player_rankings_cache directly, and replaces the old profiles.subscription_status
  auth pattern with the standard get_access_context() helper.

  ## Changes
  1. Drop all existing overloads of get_position_players_safe
  2. Rebuild using afl.v_rankings_core as the single source of truth
  3. Return canonical column names matching the frontend contract:
     - projection (not projection_final)
     - player_position (not position or p_position_code column alias)
     - signal, signal_display, category, action (canonical)
     - is_injured (computed flag from v_rankings_core)
     - breakeven, value_score, edge (canonical)
     - why, why_long (canonical — not summary_short)
     - last_3_avg, last_5_avg (not avg_last_3/avg_last_5)
  4. Switch auth to get_access_context() — remove old profiles.subscription_status lookup
  5. Type consistency: all numeric as numeric
  6. Grant anon + authenticated + service_role execute

  ## Return Schema (canonical)
  player_id, player_name, team, player_position,
  price, projection, projection_confidence,
  breakeven, value_score, edge,
  neeko_rating, neeko_rating_scaled, consistency,
  season_avg, last_3_avg, last_5_avg,
  matchup_label, captain_rating,
  signal, signal_display, category, action,
  why, why_long, upside_pct, is_injured, is_locked
*/

-- Drop all known overloads
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid);
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, integer);
DROP FUNCTION IF EXISTS public.get_position_players_safe(text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_position_players_safe(
  p_position_code text,
  p_user_id       uuid    DEFAULT NULL,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE (
  player_id              text,
  player_name            text,
  team                   text,
  player_position        text,
  price                  numeric,
  projection             numeric,
  projection_confidence  numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  consistency            numeric,
  season_avg             numeric,
  last_3_avg             numeric,
  last_5_avg             numeric,
  matchup_label          text,
  captain_rating         text,
  signal                 text,
  signal_display         text,
  category               text,
  action                 text,
  why                    text,
  why_long               text,
  upside_pct             numeric,
  is_injured             boolean,
  is_locked              boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, false);
  v_is_premium     := (v_access_context->>'is_premium')::boolean;
  v_free_ids       := ARRAY(
    SELECT jsonb_array_elements_text(v_access_context->'free_player_ids')::int
  );

  RETURN QUERY
  SELECT
    c.player_id::text,
    c.player_name::text,
    c.team::text,
    c."position"::text,
    c.price,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven             ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score           ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge                  ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.consistency,
    c.season_avg,
    c.last_3_avg,
    c.last_5_avg,
    c.matchup_label::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.captain_rating::text  ELSE NULL END,
    c.signal::text,
    c.signal_display::text,
    c.category::text,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.action::text          ELSE NULL END,
    CASE
      WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why
      WHEN c.why IS NOT NULL THEN truncate_ai_text(c.why, 'first_sentence')
      ELSE NULL
    END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.why_long              ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.upside_pct            ELSE NULL END,
    c.is_injured,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_core c
  WHERE c."position" = p_position_code
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_position_players_safe(text, uuid, integer)
  TO anon, authenticated, service_role;
