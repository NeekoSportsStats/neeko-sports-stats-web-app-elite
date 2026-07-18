CREATE OR REPLACE FUNCTION public.grade_board_review(
  p_id           uuid,
  p_actual_hit   boolean,
  p_actual_value integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.board_reviews
  SET actual_hit   = p_actual_hit,
      actual_value = p_actual_value,
      graded_at    = CASE WHEN p_actual_hit IS NULL THEN NULL ELSE now() END
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grade_board_review(uuid,boolean,integer) TO anon, authenticated;
