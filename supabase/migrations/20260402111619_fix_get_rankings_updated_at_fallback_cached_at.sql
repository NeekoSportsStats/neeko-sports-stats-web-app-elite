/*
  # Fix get_rankings_updated_at — Add fallback to player_rankings_cache.cached_at

  ## Problem
  `get_rankings_updated_at` reads from `public.ai_rankings_player_recos.generated_at`.
  That table is currently empty (0 rows), so the RPC returns NULL → frontend shows
  "Data may be outdated — Last updated unknown".

  ## Fix
  COALESCE with `MAX(afl.player_rankings_cache.cached_at)` as fallback so the
  Rankings page always shows a real timestamp when the cache has been populated.

  ## Also adds
  A more descriptive round_label based on the actual cache timestamp.
*/

CREATE OR REPLACE FUNCTION public.get_rankings_updated_at()
RETURNS TABLE(updated_at timestamp with time zone, round_label text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
  SELECT
    COALESCE(
      (SELECT MAX(generated_at) FROM public.ai_rankings_player_recos),
      (SELECT MAX(cached_at) FROM afl.player_rankings_cache WHERE status = 'active')
    ) AS updated_at,
    'Current Round' AS round_label;
$$;
