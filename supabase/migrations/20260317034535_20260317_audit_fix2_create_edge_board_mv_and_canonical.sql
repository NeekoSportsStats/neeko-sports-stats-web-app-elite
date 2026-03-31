/*
  # Fix 2: Create public.mv_edge_board and public.v_rankings_canonical

  ## Problem
  - get_edge_board_data RPC references public.mv_edge_board but it doesn't exist,
    causing the RPC to error on COUNT(*).
  - The fallback path in the same RPC queries public.v_rankings_canonical which
    also doesn't exist.

  ## Fix
  1. Create public.v_rankings_canonical — a wrapper over public.v_rankings_free
     that adds columns expected by the edge board fallback path.
  2. Create public.mv_edge_board as a regular table (populated via function) with
     the exact column types get_edge_board_data reads from it.

  ## Notes
  mv_edge_board starts empty so get_edge_board_data always falls through to the
  live calculation path (which uses v_rankings_canonical). This is correct behaviour
  until a scheduled refresh populates it.
*/

-- ── 1. Rankings canonical view (edge board fallback source) ────────────────────
CREATE OR REPLACE VIEW public.v_rankings_canonical AS
SELECT
  player_id::text                   AS player_id,
  player_name,
  team,
  position,
  team_name,
  position_group,
  projection_final,
  ceiling                           AS ceiling_estimate,
  floor                             AS floor_estimate,
  consistency                       AS consistency_score,
  neeko_rating,
  price,
  value_score,
  value_tag,
  value_tier,
  recommendation_short              AS signal,
  ai_summary                        AS summary,
  recommendation_why                AS analysis,
  projection_confidence,
  risk_rating,
  matchup_rating,
  upside_rating,
  captain_score,
  captain_rating,
  ai_recommendation,
  recommendation_color,
  recommendation_short,
  ai_summary,
  consistency_tier,
  total_count,
  cached_at
FROM afl.player_rankings_cache
WHERE player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_canonical TO authenticated;
GRANT SELECT ON public.v_rankings_canonical TO anon;

-- ── 2. mv_edge_board as a regular table with schema matching the RPC ───────────
CREATE TABLE IF NOT EXISTS public.mv_edge_board (
  player_id          text,
  player_name        text,
  team               text,
  position           text,
  section            text,
  section_rank       bigint,
  projection_final   numeric,
  ceiling_estimate   numeric,
  floor_estimate     numeric,
  upside_rating      numeric,
  risk_rating        numeric,
  projection_confidence numeric,
  captain_score      numeric,
  captain_rating     text,
  neeko_rating       numeric,
  price              numeric,
  value_score        numeric,
  value_tag          text,
  ai_summary         text,
  recommendation_color text,
  refreshed_at       timestamptz DEFAULT now()
);

ALTER TABLE public.mv_edge_board ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read edge board"
  ON public.mv_edge_board FOR SELECT
  TO authenticated, anon
  USING (true);

-- ── 3. Function to refresh mv_edge_board from rankings cache ──────────────────
CREATE OR REPLACE FUNCTION public.refresh_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $fn$
DECLARE
  v_now timestamptz := now();
BEGIN
  TRUNCATE public.mv_edge_board;

  INSERT INTO public.mv_edge_board (
    player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, refreshed_at
  )
  WITH base AS (
    SELECT
      c.player_id::text,
      c.player_name,
      c.team,
      c.position,
      c.projection_final,
      c.ceiling::numeric        AS ceiling_estimate,
      c.floor::numeric          AS floor_estimate,
      c.upside_rating::numeric,
      c.risk_rating::numeric,
      c.projection_confidence::numeric,
      c.captain_score::numeric,
      c.captain_rating,
      c.neeko_rating::numeric,
      c.price::numeric,
      c.value_score::numeric,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      (c.ceiling - c.projection)  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.captain_score DESC NULLS LAST) AS captain_rank
    FROM afl.player_rankings_cache c
  ),
  captains AS (
    SELECT *, 'captain' AS section,
      ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
    FROM base
    LIMIT 10
  ),
  breakouts AS (
    SELECT *, 'breakout' AS section,
      ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
    FROM base
    WHERE ceiling_gap   >= 50
    AND   projection_final >= 50
    AND   floor_estimate   >= 25
    AND   projection_confidence >= 40
    AND   risk_rating    <= 75
    AND   captain_rank   > 5
    LIMIT 10
  ),
  traps AS (
    SELECT *, 'trap' AS section,
      ROW_NUMBER() OVER (ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST) AS section_rank
    FROM base
    WHERE captain_rank  <= 100
    AND   risk_rating   >= 50
    LIMIT 5
  )
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM captains
  UNION ALL
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM breakouts
  UNION ALL
  SELECT player_id, player_name, team, position,
    section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color, v_now
  FROM traps;
END;
$fn$;

-- ── 4. Initial populate ────────────────────────────────────────────────────────
SELECT public.refresh_mv_edge_board();
