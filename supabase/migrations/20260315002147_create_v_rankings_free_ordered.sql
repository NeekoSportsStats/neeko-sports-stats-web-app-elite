/*
  # Create v_rankings_free view

  ## Purpose
  Provides a correctly ordered subset of rankings for free users.
  Uses the same source (v_rankings_final) and same ordering (neeko_rating DESC)
  as the premium view, ensuring free users see the true top players — just fewer of them.

  ## New Views
  - public.v_rankings_free
    Top 25 players from v_rankings_final ordered by neeko_rating DESC.
    Free users see the same ranking order as premium users, limited to 25 rows.

  ## Notes
  - The frontend still controls the exact free row count via FREE_PARTIAL_ROWS constant.
  - This view ensures the server-side ordering is canonical and consistent.
*/

CREATE OR REPLACE VIEW public.v_rankings_free AS
SELECT *
FROM public.v_rankings_final
ORDER BY neeko_rating DESC
LIMIT 25;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
