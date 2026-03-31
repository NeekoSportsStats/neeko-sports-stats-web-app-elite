/*
  # Create get_rankings_updated_at RPC (v3)

  Returns the most recent updated_at timestamp from ai_rankings_player_recos
  plus a round label derived from player_round_stats_2025.
*/

CREATE OR REPLACE FUNCTION public.get_rankings_updated_at()
RETURNS TABLE(updated_at timestamptz, round_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    MAX(r.updated_at)::timestamptz AS updated_at,
    COALESCE(
      (SELECT CONCAT('Round ', MAX(rps.round_number)::text)
       FROM player_round_stats_2025 rps),
      'Round 1'
    ) AS round_label
  FROM ai_rankings_player_recos r;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_updated_at() TO anon, authenticated;
