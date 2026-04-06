/*
  # Rebuild get_team_players_safe — Canonical Field Names via afl.v_rankings_core

  ## Summary
  Rebuilds get_team_players_safe to read from afl.v_rankings_core instead of
  afl.player_rankings_cache directly. This enforces the canonical frontend contract:

  ## Changes
  1. Drop all existing overloads of get_team_players_safe
  2. Rebuild using afl.v_rankings_core as the single source of truth
  3. Return canonical column names matching the frontend contract:
     - projection (not projection_final)
     - player_position (not position)
     - signal, signal_display, category, action (canonical names)
     - is_injured (computed flag from v_rankings_core)
     - breakeven, value_score, edge, why (canonical)
     - avg_last_3 → last_3_avg, avg_last_5 → last_5_avg (consistent with view)
  4. Remove legacy columns: value_tag, recommendation_strength, matchup_rating,
     summary_short/summary_long (replaced by why/why_long from view)
  5. Use get_access_context() for consistent premium/free access logic
  6. Type consistency: all numeric columns as numeric (no double precision)
  7. Grant anon + authenticated + service_role execute

  ## Return Schema (canonical)
  player_id, player_name, team, player_position, position_group,
  price, prev_price, price_change, projection, projection_confidence,
  ceiling_estimate, floor_estimate, breakeven, value_score, edge,
  neeko_rating, neeko_rating_scaled, consistency, form_score,
  season_avg, last_3_avg, last_5_avg, matchup_label, captain_rating,
  signal, signal_display, category, action, why, why_long,
  recommendation_color, status, manual_status, is_bye, is_injured,
  bye_round, bye_next_round, games_played, is_locked
*/

-- Drop all known overloads
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid);
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, boolean);
DROP FUNCTION IF EXISTS public.get_team_players_safe(text, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_team_players_safe(
  p_team    text,
  p_user_id uuid    DEFAULT NULL,
  p_is_bot  boolean DEFAULT false
)
RETURNS TABLE (
  player_id              text,
  player_name            text,
  team                   text,
  player_position        text,
  position_group         text,
  price                  numeric,
  prev_price             numeric,
  price_change           numeric,
  projection             numeric,
  projection_confidence  numeric,
  ceiling_estimate       numeric,
  floor_estimate         numeric,
  breakeven              numeric,
  value_score            numeric,
  edge                   numeric,
  neeko_rating           numeric,
  neeko_rating_scaled    numeric,
  consistency            numeric,
  form_score             numeric,
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
  recommendation_color   text,
  status                 text,
  manual_status          text,
  is_bye                 boolean,
  is_injured             boolean,
  bye_round              numeric,
  bye_next_round         boolean,
  games_played           numeric,
  is_locked              boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_access_context jsonb;
  v_is_premium     boolean;
  v_free_ids       int[];
BEGIN
  v_access_context := get_access_context(p_user_id, p_is_bot);
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
    c.position_group::text,
    c.price,
    c.prev_price,
    c.price_change,
    c.projection,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.projection_confidence ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.ceiling_estimate      ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.floor_estimate        ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.breakeven             ELSE NULL END,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.value_score           ELSE NULL END,
    CASE WHEN v_is_premium                                        THEN c.edge                  ELSE NULL END,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.consistency,
    CASE WHEN v_is_premium OR c.player_id::int = ANY(v_free_ids) THEN c.form_score            ELSE NULL END,
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
    c.recommendation_color::text,
    c.status::text,
    c.manual_status::text,
    c.is_bye,
    c.is_injured,
    c.bye_round,
    c.bye_next_round,
    c.games_played,
    NOT (v_is_premium OR c.player_id::int = ANY(v_free_ids))
  FROM afl.v_rankings_core c
  WHERE c.team = p_team
    AND c.player_id IS NOT NULL
  ORDER BY c.projection DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_players_safe(text, uuid, boolean)
  TO anon, authenticated, service_role;
