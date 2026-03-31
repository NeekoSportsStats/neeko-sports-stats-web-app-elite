/*
  # Create mv_edge_board Materialized View

  ## Summary
  Creates a materialized view that caches the Edge Board output (all three sections:
  captain, breakout, trap) so the page loads fast without traversing the full
  5-level view chain on every request.

  ## Why
  The existing get_edge_board_data() RPC queries v_rankings_canonical, which chains
  v_rankings_with_value → v_rankings_master → v_rankings_premium → afl_player_prices.
  This includes multiple window functions, CTEs, and cross-schema joins that run
  every time the page loads. A materialized view caches the 15 rows (5 per section)
  and only recomputes when explicitly refreshed.

  ## What It Stores
  All columns returned by get_edge_board_data():
  - player_id, player_name, team, position
  - section (captain / breakout / trap), section_rank
  - projection_final, ceiling_estimate, floor_estimate
  - upside_rating, risk_rating, projection_confidence
  - captain_score, captain_rating, neeko_rating
  - price, value_score, value_tag
  - ai_summary, recommendation_color
  - refreshed_at: timestamp of last refresh

  ## Refresh Strategy
  - Manual: SELECT public.fn_refresh_edge_board();
  - Automatic: pg_cron job fires Thursday 20:10 AEDT (10:10 UTC) after teams named
  - Automatic: pg_cron job fires daily 15:05 UTC (after weekly AFL pipeline at 15:00)
  - Automatic: trigger on afl_player_prices INSERT/UPDATE fires a deferred refresh

  ## Notes
  - CONCURRENTLY not used here — view is tiny (15 rows) so lock time is negligible
  - Unique index on (section, section_rank) required for CONCURRENTLY if added later
*/

-- ─── 1. Create the materialized view ─────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    r.player_id::text                              AS player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence::numeric               AS projection_confidence,
    r.captain_score,
    r.captain_rating,
    r.neeko_rating,
    r.price::numeric                               AS price,
    r.value_score,
    r.value_tier,
    r.value_tag,
    r.consistency_score,
    r.ai_summary,
    r.recommendation_color,
    ROW_NUMBER()   OVER (ORDER BY r.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
    ROW_NUMBER()   OVER (ORDER BY r.captain_score    DESC NULLS LAST) AS captain_rank,
    PERCENT_RANK() OVER (ORDER BY r.upside_rating    ASC  NULLS FIRST) AS upside_percentile
  FROM public.v_rankings_canonical r
),

captain_eligible AS (
  SELECT * FROM ranked WHERE captain_score IS NOT NULL
),

breakout_eligible AS (
  SELECT *
  FROM ranked
  WHERE upside_percentile    >= 0.65
    AND value_score          > 100
    AND projection_final     >= 50
    AND floor_estimate       >= 25
    AND projection_confidence >= 40
    AND captain_rank         > 5
),

trap_strict AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND (risk_rating >= 50 OR value_score < 95)
    AND (
      (CASE WHEN risk_rating >= 55           THEN 1 ELSE 0 END) +
      (CASE WHEN consistency_score <= 50     THEN 1 ELSE 0 END) +
      (CASE WHEN value_score < 95            THEN 1 ELSE 0 END) +
      (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
    ) >= 2
),
trap_fallback AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
    AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
),
trap_combined AS (
  SELECT *, 1 AS trap_priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS trap_priority FROM trap_fallback
),
trap_final AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
    ) AS trap_rn
  FROM trap_combined
),

sectioned AS (
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY upside_rating DESC NULLS LAST, value_score DESC NULLS LAST
    ) AS section_rank
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn AS section_rank
  FROM trap_final
  WHERE trap_rn <= 5
)

SELECT
  s.player_id,
  s.player_name,
  s.team,
  s.position,
  s.section,
  s.section_rank,
  s.projection_final,
  s.ceiling_estimate,
  s.floor_estimate,
  s.upside_rating,
  s.risk_rating,
  s.projection_confidence,
  s.captain_score,
  s.captain_rating,
  s.neeko_rating,
  s.price,
  s.value_score,
  s.value_tag,
  s.ai_summary,
  s.recommendation_color,
  now() AS refreshed_at
FROM sectioned s
WHERE s.section_rank <= 5
ORDER BY s.section, s.section_rank;

-- ─── 2. Unique index (enables CONCURRENTLY refresh in future) ─────────────────

CREATE UNIQUE INDEX mv_edge_board_section_rank_idx
  ON public.mv_edge_board (section, section_rank);

-- ─── 3. Grant read access ─────────────────────────────────────────────────────

GRANT SELECT ON public.mv_edge_board TO anon, authenticated;
