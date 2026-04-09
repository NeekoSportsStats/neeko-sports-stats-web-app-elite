/*
  # Fix Edge Board Captain Section - captain_score is Never Populated

  ## Problem
  `captain_score` is NULL for all 594 players in player_rankings_cache.
  The `populate_mv_edge_board` captain filter requires `captain_score IS NOT NULL`,
  so the captain section always returns 0 players.

  ## Fix
  1. Remove the `captain_score IS NOT NULL` guard from populate_mv_edge_board
  2. Fall back to ordering by neeko_rating when captain_score is NULL
  3. Same fix for the clean-rebuild path
*/

CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_inserted int := 0;
BEGIN

WITH eligible AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c."position",
    c.projection_final,
    c.ceiling_estimate,
    c.floor_estimate,
    c.upside_rating,
    c.risk_rating,
    c.projection_confidence,
    COALESCE(c.captain_score, c.neeko_rating) AS captain_score,
    c.captain_rating,
    c.neeko_rating,
    c.price,
    c.price_change,
    c.price_change_pct,
    c.value_score_canonical   AS value_score,
    c.signal_display           AS value_tag,
    c.summary_short            AS ai_summary,
    c.recommendation_color,
    c.consistency,
    c.signal_canonical         AS signal,
    c.edge_canonical
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
    AND COALESCE(c.projection_final, 0) > 0
    AND COALESCE(c.is_available, true) = true
    AND COALESCE(c.manual_status, '') NOT IN ('injured', 'out', 'suspended')
    AND COALESCE(c.is_bye, false) = false
    AND c.player_name IS NOT NULL
    AND COALESCE(c.games_played, 0) >= 3
    AND COALESCE(c.price, 0) > 0
),

-- Captain: STRONG_START or START signal, ranked by neeko_rating (captain_score fallback)
captain_ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(captain_score, neeko_rating, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('STRONG_START', 'START')
    AND projection_final >= 60
),
top_captains AS (
  SELECT *, rn AS section_rank FROM captain_ranked WHERE rn <= 10
),

-- Breakout: STRONG_START signal only, not already a captain, ranked by edge
breakout_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(edge_canonical, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal = 'STRONG_START'
    AND projection_final >= 50
    AND player_id NOT IN (SELECT player_id FROM top_captains)
),
top_breakouts AS (
  SELECT *, rn AS section_rank FROM breakout_ranked WHERE rn <= 10
),

-- Trap: SIT or STRONG_SIT signal, premium-priced players
trap_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(risk_rating, 0) DESC NULLS LAST, COALESCE(price, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('SIT', 'STRONG_SIT')
    AND price >= 250000
    AND player_id NOT IN (SELECT player_id FROM top_captains)
    AND player_id NOT IN (SELECT player_id FROM top_breakouts)
),
top_traps AS (
  SELECT *, rn AS section_rank FROM trap_ranked WHERE rn <= 10
),

all_sections AS (
  SELECT 'captain'::text AS section, section_rank, player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now() AS refreshed_at
  FROM top_captains
  UNION ALL
  SELECT 'breakout'::text, section_rank, player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_breakouts
  UNION ALL
  SELECT 'trap'::text, section_rank, player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_traps
)
INSERT INTO public.mv_edge_board (
  section, section_rank, player_id, player_name, team, "position",
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
)
SELECT
  section, section_rank, player_id, player_name, team, "position",
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
FROM all_sections
ON CONFLICT (section, section_rank) DO UPDATE SET
  player_id              = EXCLUDED.player_id,
  player_name            = EXCLUDED.player_name,
  team                   = EXCLUDED.team,
  "position"             = EXCLUDED."position",
  projection_final       = EXCLUDED.projection_final,
  ceiling_estimate       = EXCLUDED.ceiling_estimate,
  floor_estimate         = EXCLUDED.floor_estimate,
  upside_rating          = EXCLUDED.upside_rating,
  risk_rating            = EXCLUDED.risk_rating,
  projection_confidence  = EXCLUDED.projection_confidence,
  captain_score          = EXCLUDED.captain_score,
  captain_rating         = EXCLUDED.captain_rating,
  neeko_rating           = EXCLUDED.neeko_rating,
  price                  = EXCLUDED.price,
  price_change           = EXCLUDED.price_change,
  price_change_pct       = EXCLUDED.price_change_pct,
  value_score            = EXCLUDED.value_score,
  value_tag              = EXCLUDED.value_tag,
  ai_summary             = EXCLUDED.ai_summary,
  recommendation_color   = EXCLUDED.recommendation_color,
  refreshed_at           = EXCLUDED.refreshed_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'info',
  'populate_mv_edge_board',
  'edge_board_refreshed',
  'Edge board rebuilt (v4 neeko_rating captain fallback): ' || v_inserted || ' rows upserted',
  jsonb_build_object('rows_upserted', v_inserted, 'refreshed_at', now()),
  now()
);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES (
    'error',
    'populate_mv_edge_board',
    'edge_board_refresh_error',
    'Edge board refresh failed: ' || SQLERRM,
    jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE),
    now()
  );
  RAISE;
END;
$$;
