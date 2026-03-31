/*
  # Create v_neeko_intel_round_insight

  Generates a single headline string for the top-projected player
  this round. Used as the "Round Insight" banner at the top of
  the Neeko Intel page.

  Returns one row with:
  - headline (text): human-readable sentence
  - player_name, team, projection_final (for richer display if needed)
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_round_insight
WITH (security_invoker = false)
AS
SELECT
  player_name,
  team,
  position,
  projection_final,
  (
    'Elite projections this round — '
    || player_name
    || ' leads at '
    || ROUND(projection_final::numeric)
    || ' projected fantasy points.'
  ) AS headline
FROM public.v_rankings_master
WHERE projection_final IS NOT NULL
ORDER BY projection_final DESC
LIMIT 1;

GRANT SELECT ON public.v_neeko_intel_round_insight TO anon, authenticated;
