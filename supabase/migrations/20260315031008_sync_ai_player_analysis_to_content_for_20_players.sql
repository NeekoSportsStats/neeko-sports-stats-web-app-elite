/*
  # Sync ai_player_analysis into ai_player_content for 20 gap-fill players

  ## Problem
  The generate-ai-worker writes results to public.ai_player_analysis (analysis column).
  The rankings cache populate function reads from public.ai_player_content (summary,
  recommendation, why columns). These are different tables with different schemas.

  The 20 backfill players have content in ai_player_analysis but nothing in
  ai_player_content, so the rankings cache still shows NULL for their ai_summary
  and ai_recommendation fields.

  ## Fix
  Parse the analysis text from ai_player_analysis into the ai_player_content schema:
  - First line = recommendation label (BUY / SIT / SELL / HOLD)
  - Remainder after the blank line = summary paragraph
  - why field = first sentence of summary (up to first period)

  Then trigger a cache refresh so the rankings page picks up the new content.

  ## Tables affected
  - public.ai_player_content (upsert for 20 players)
  - afl.player_rankings_cache (refreshed via stored function)
*/

INSERT INTO public.ai_player_content (
  player_id,
  recommendation,
  why,
  summary,
  generated_at,
  updated_at
)
SELECT
  a.player_id,
  TRIM(SPLIT_PART(a.analysis, E'\n', 1)) AS recommendation,
  TRIM(
    CASE
      WHEN POSITION('.' IN SUBSTRING(a.analysis FROM POSITION(E'\n\n' IN a.analysis) + 2)) > 0
      THEN SUBSTRING(
        a.analysis
        FROM POSITION(E'\n\n' IN a.analysis) + 2
        FOR POSITION('.' IN SUBSTRING(a.analysis FROM POSITION(E'\n\n' IN a.analysis) + 2))
      )
      ELSE LEFT(SUBSTRING(a.analysis FROM POSITION(E'\n\n' IN a.analysis) + 2), 120)
    END
  ) AS why,
  TRIM(SUBSTRING(a.analysis FROM POSITION(E'\n\n' IN a.analysis) + 2)) AS summary,
  a.generated_at,
  now()
FROM public.ai_player_analysis a
WHERE a.player_id IN (
  SELECT entity_id::integer
  FROM public.ai_generation_queue
  WHERE job_type = 'player_analysis'
    AND status = 'complete'
    AND updated_at > now() - interval '2 hours'
)
AND POSITION(E'\n\n' IN a.analysis) > 0
ON CONFLICT (player_id) DO UPDATE SET
  recommendation = EXCLUDED.recommendation,
  why            = EXCLUDED.why,
  summary        = EXCLUDED.summary,
  generated_at   = EXCLUDED.generated_at,
  updated_at     = EXCLUDED.updated_at;

-- Refresh the rankings cache to pick up the new ai_player_content rows
SELECT afl.refresh_player_rankings_cache();
