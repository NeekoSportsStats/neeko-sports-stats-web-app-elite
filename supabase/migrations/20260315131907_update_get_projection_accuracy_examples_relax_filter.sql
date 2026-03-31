
/*
  # Update get_projection_accuracy_examples RPC

  Relaxes error filter to include sub-1pt accuracy examples,
  ensuring we always return 3 results. Also raises actual_score
  floor to 60 to show meaningful players.
*/

CREATE OR REPLACE FUNCTION public.get_projection_accuracy_examples(limit_n int DEFAULT 3)
RETURNS TABLE (
  player_name   text,
  team          text,
  projection    numeric,
  actual_score  numeric,
  error         numeric,
  round_label   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.player_name,
    b.team,
    ROUND(b.projection::numeric, 0)     AS projection,
    ROUND(b.actual_score::numeric, 0)   AS actual_score,
    ROUND(b.absolute_error::numeric, 1) AS error,
    b.round_label
  FROM public.v_projection_accuracy_best b
  WHERE b.actual_score >= 60
    AND b.player_name IS NOT NULL
  ORDER BY b.absolute_error ASC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_projection_accuracy_examples(int) TO anon, authenticated;
