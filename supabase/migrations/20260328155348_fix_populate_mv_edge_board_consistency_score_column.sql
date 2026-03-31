/*
  # Fix populate_mv_edge_board — consistency_score column name

  ## Problem
  The trap_strict CTE references `consistency_score` which does not exist.
  The correct column in afl.player_rankings_cache is `consistency`.

  ## Fix
  Replace `consistency_score` with `consistency` in the trap_strict CTE.
  This is the only change from the previous migration.
*/

CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_inserted int := 0;
BEGIN

WITH eligible AS (
SELECT
c.player_id,
c.player_name,
c.team,
c.position,
c.projection_final,
c.ceiling_estimate,
c.floor_estimate,
c.upside_rating,
c.risk_rating,
c.projection_confidence,
c.captain_score,
c.captain_rating,
c.neeko_rating,
c.neeko_rating_scaled,
c.price,
c.price_change,
c.value_score,
c.value_tag,
c.ai_summary,
c.summary_short,
c.recommendation_color,
c.recommendation_short,
c.edge_score,
c.edge_tier,
c.consistency,
(COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0)) AS ceiling_gap
FROM afl.player_rankings_cache c
WHERE c.player_id IS NOT NULL
AND COALESCE(c.projection_final, 0) > 0
AND COALESCE(c.is_available, true) = true
AND COALESCE(c.status, 'AVAILABLE') <> 'OUT'
AND COALESCE(c.is_bye, false) = false
AND c.player_name IS NOT NULL
),
captain_ranked AS (
SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(captain_score, 0) DESC NULLS LAST) AS rn
FROM eligible WHERE captain_score IS NOT NULL
),
top_captains AS (
SELECT *, rn AS section_rank FROM captain_ranked WHERE rn <= 10
),
breakout_ranked AS (
SELECT *,
ROW_NUMBER() OVER (
ORDER BY COALESCE(upside_rating, 0) DESC NULLS LAST,
ceiling_gap DESC NULLS LAST
) AS rn
FROM eligible
WHERE ceiling_gap >= 20
AND COALESCE(projection_final, 0) >= 50
AND COALESCE(floor_estimate, 0) >= 25
AND COALESCE(projection_confidence, 0) >= 40
AND COALESCE(risk_rating, 100) <= 75
AND player_id NOT IN (SELECT player_id FROM top_captains WHERE rn <= 10)
),
top_breakouts AS (
SELECT *, rn AS section_rank FROM breakout_ranked WHERE rn <= 10
),
all_by_neeko AS (
SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(neeko_rating, 0) DESC NULLS LAST) AS neeko_rank
FROM eligible
),
trap_strict AS (
SELECT *, 1 AS priority
FROM all_by_neeko
WHERE neeko_rank <= 100
AND (COALESCE(risk_rating, 0) >= 50 OR COALESCE(value_score, 100) < 95)
AND (
(CASE WHEN COALESCE(risk_rating, 0) >= 55         THEN 1 ELSE 0 END) +
(CASE WHEN COALESCE(consistency, 100) <= 50        THEN 1 ELSE 0 END) +
(CASE WHEN COALESCE(value_score, 100) < 95         THEN 1 ELSE 0 END) +
(CASE WHEN COALESCE(projection_confidence, 100) <= 55 THEN 1 ELSE 0 END)
) >= 2
),
trap_fallback AS (
SELECT *, 2 AS priority
FROM all_by_neeko
WHERE neeko_rank <= 100
AND player_id NOT IN (SELECT player_id FROM trap_strict)
),
trap_combined AS (
SELECT *, ROW_NUMBER() OVER (
ORDER BY priority ASC,
COALESCE(risk_rating, 0) DESC NULLS LAST,
COALESCE(value_score, 100) ASC NULLS LAST
) AS rn
FROM (SELECT * FROM trap_strict UNION ALL SELECT * FROM trap_fallback) t
),
top_traps AS (
SELECT *, rn AS section_rank FROM trap_combined WHERE rn <= 10
),
all_sections AS (
SELECT 'captain'::text AS section, section_rank, player_id, player_name, team, position,
projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
projection_confidence, captain_score, captain_rating, neeko_rating, neeko_rating_scaled,
price, price_change, value_score, value_tag, ai_summary, summary_short,
recommendation_color, recommendation_short, edge_score, edge_tier, now() AS refreshed_at
FROM top_captains
UNION ALL
SELECT 'breakout'::text, section_rank, player_id, player_name, team, position,
projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
projection_confidence, captain_score, captain_rating, neeko_rating, neeko_rating_scaled,
price, price_change, value_score, value_tag, ai_summary, summary_short,
recommendation_color, recommendation_short, edge_score, edge_tier, now()
FROM top_breakouts
UNION ALL
SELECT 'trap'::text, section_rank, player_id, player_name, team, position,
projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
projection_confidence, captain_score, captain_rating, neeko_rating, neeko_rating_scaled,
price, price_change, value_score, value_tag, ai_summary, summary_short,
recommendation_color, recommendation_short, edge_score, edge_tier, now()
FROM top_traps
)
INSERT INTO public.mv_edge_board (
section, section_rank, player_id, player_name, team, position,
projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
projection_confidence, captain_score, captain_rating, neeko_rating, neeko_rating_scaled,
price, price_change, value_score, value_tag, ai_summary, summary_short,
recommendation_color, recommendation_short, edge_score, edge_tier, refreshed_at
)
SELECT
section, section_rank, player_id, player_name, team, position,
projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
projection_confidence, captain_score, captain_rating, neeko_rating, neeko_rating_scaled,
price, price_change, value_score, value_tag, ai_summary, summary_short,
recommendation_color, recommendation_short, edge_score, edge_tier, refreshed_at
FROM all_sections
ON CONFLICT (section, section_rank) DO UPDATE SET
player_id              = EXCLUDED.player_id,
player_name            = EXCLUDED.player_name,
team                   = EXCLUDED.team,
position               = EXCLUDED.position,
projection_final       = EXCLUDED.projection_final,
ceiling_estimate       = EXCLUDED.ceiling_estimate,
floor_estimate         = EXCLUDED.floor_estimate,
upside_rating          = EXCLUDED.upside_rating,
risk_rating            = EXCLUDED.risk_rating,
projection_confidence  = EXCLUDED.projection_confidence,
captain_score          = EXCLUDED.captain_score,
captain_rating         = EXCLUDED.captain_rating,
neeko_rating           = EXCLUDED.neeko_rating,
neeko_rating_scaled    = EXCLUDED.neeko_rating_scaled,
price                  = EXCLUDED.price,
price_change           = EXCLUDED.price_change,
value_score            = EXCLUDED.value_score,
value_tag              = EXCLUDED.value_tag,
ai_summary             = EXCLUDED.ai_summary,
summary_short          = EXCLUDED.summary_short,
recommendation_color   = EXCLUDED.recommendation_color,
recommendation_short   = EXCLUDED.recommendation_short,
edge_score             = EXCLUDED.edge_score,
edge_tier              = EXCLUDED.edge_tier,
refreshed_at           = EXCLUDED.refreshed_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'info',
  'populate_mv_edge_board',
  'edge_board_refreshed',
  'Edge board rebuilt from player_rankings_cache: ' || v_inserted || ' rows upserted',
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
$function$;
