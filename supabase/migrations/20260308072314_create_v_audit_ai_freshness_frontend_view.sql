/*
  # Create v_audit_ai_freshness — frontend-visible AI freshness view

  ## Problem
  The system audit previously checked afl.ai_player_summaries.updated_at directly.
  This is the raw storage table and does NOT reflect what the frontend actually sees.
  
  The frontend reads from v_rankings_canonical which has its own ai_updated_at column
  that resolves to whichever AI source is most recent:
    - ai_rankings_player_recos.generated_at (fresh per-player recommendations)
    - afl.ai_player_summaries.updated_at (background summaries)

  ## Solution
  Create a lightweight view that reports AI freshness exactly as the frontend
  would experience it — sourced from v_rankings_canonical.ai_updated_at.

  ## New View: public.v_audit_ai_freshness
  Returns:
  - total_players: players in v_rankings_canonical
  - players_with_ai: players where ai_updated_at IS NOT NULL
  - players_missing_ai: players with no AI content visible to frontend
  - latest_ai_update: most recent ai_updated_at across all players
  - oldest_ai_update: oldest ai_updated_at (identifies stalest players)
  - coverage_pct: percentage of players with AI content
  - stalest_players: JSONB array of up to 5 players with oldest AI content (for debugging)

  ## Security
  - SECURITY DEFINER so anon/authenticated can read without direct view access
  - Grant SELECT to authenticated role only (admin use)
*/

CREATE OR REPLACE VIEW public.v_audit_ai_freshness
WITH (security_invoker = false)
AS
SELECT
  COUNT(*) AS total_players,
  COUNT(*) FILTER (WHERE ai_updated_at IS NOT NULL) AS players_with_ai,
  COUNT(*) FILTER (WHERE ai_updated_at IS NULL) AS players_missing_ai,
  MAX(ai_updated_at) AS latest_ai_update,
  MIN(ai_updated_at) AS oldest_ai_update,
  round(
    100.0 * COUNT(*) FILTER (WHERE ai_updated_at IS NOT NULL)
    / NULLIF(COUNT(*), 0),
  1) AS coverage_pct,
  (
    SELECT jsonb_agg(sub ORDER BY sub->>'ai_updated_at' ASC)
    FROM (
      SELECT jsonb_build_object(
        'player_name', player_name,
        'team', team,
        'ai_updated_at', ai_updated_at
      ) AS sub
      FROM public.v_rankings_canonical
      WHERE ai_updated_at IS NOT NULL
      ORDER BY ai_updated_at ASC
      LIMIT 5
    ) t
  ) AS stalest_players
FROM public.v_rankings_canonical;

GRANT SELECT ON public.v_audit_ai_freshness TO authenticated;
