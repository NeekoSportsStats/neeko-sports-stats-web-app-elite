/*
  # Create RPC: get_players_needing_ai_analysis

  ## Summary
  Replaces the unbounded in-memory JOIN in generate-ranking-ai edge function with a
  server-side SQL function that returns only players whose ai_player_content record is
  missing or whose input_hash has changed. This eliminates the OOM root cause: the
  previous code fetched all 736 candidates + all existing analysis rows into Deno memory
  on every invocation, then filtered client-side.

  ## New Function
  - `public.get_players_needing_ai_analysis(p_limit int DEFAULT 25)`
    Returns at most p_limit rows of (player_id, input_hash) where ai_player_content is
    stale or absent.

  ## Security
  - SECURITY DEFINER with explicit search_path
  - Granted to anon and authenticated (called by service-role key from edge function)
*/

CREATE OR REPLACE FUNCTION public.get_players_needing_ai_analysis(p_limit integer DEFAULT 25)
RETURNS TABLE(player_id integer, input_hash text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'afl'
AS $$
  SELECT v.player_id, v.input_hash
  FROM public.v_ai_player_analysis_input v
  LEFT JOIN public.ai_player_content c ON c.player_id = v.player_id
  WHERE
    c.player_id IS NULL
    OR c.input_hash IS DISTINCT FROM v.input_hash
  ORDER BY v.player_id
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_players_needing_ai_analysis(integer) TO anon, authenticated, service_role;

-- Also create a count-only version for total remaining
CREATE OR REPLACE FUNCTION public.count_players_needing_ai_analysis()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'afl'
AS $$
  SELECT COUNT(*)::integer
  FROM public.v_ai_player_analysis_input v
  LEFT JOIN public.ai_player_content c ON c.player_id = v.player_id
  WHERE
    c.player_id IS NULL
    OR c.input_hash IS DISTINCT FROM v.input_hash;
$$;

GRANT EXECUTE ON FUNCTION public.count_players_needing_ai_analysis() TO anon, authenticated, service_role;
