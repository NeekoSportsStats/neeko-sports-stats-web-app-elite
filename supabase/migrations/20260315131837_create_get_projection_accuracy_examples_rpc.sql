
/*
  # Create get_projection_accuracy_examples RPC

  Returns 3 recent projection accuracy examples where the error was small (1–10 pts),
  used on the landing page Outcome Proof section.

  Returns:
  - player_name, team, projection, actual_score, error, round_label
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
    ROUND(b.absolute_error::numeric, 0) AS error,
    b.round_label
  FROM public.v_projection_accuracy_best b
  WHERE b.absolute_error BETWEEN 1 AND 10
    AND b.actual_score >= 60
    AND b.player_name IS NOT NULL
  ORDER BY b.absolute_error ASC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_projection_accuracy_examples(int) TO anon, authenticated;
