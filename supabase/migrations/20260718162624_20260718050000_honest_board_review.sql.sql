CREATE TABLE IF NOT EXISTS public.board_reviews (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  round_number    integer NOT NULL,
  season          integer NOT NULL DEFAULT 2026,
  player_name     text NOT NULL,
  team_name       text,
  stat_label      text NOT NULL,   -- e.g. "30+ disposals"
  lens            text NOT NULL,   -- disposals/goals/marks/tackles/kicks/fantasy
  threshold       numeric NOT NULL,
  projected_hit   boolean NOT NULL DEFAULT true,  -- always true (we featured it)
  actual_hit      boolean,         -- NULL = ungraded, true = hit, false = missed
  actual_value    integer,         -- what they actually scored
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  graded_at       timestamptz
);

CREATE INDEX idx_board_reviews_round ON public.board_reviews(season, round_number);
CREATE INDEX idx_board_reviews_ungraded ON public.board_reviews(actual_hit) WHERE actual_hit IS NULL;

-- RLS: this is admin-only (ops console). Disable RLS, restrict via service role.
ALTER TABLE public.board_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_reviews_anon_read ON public.board_reviews
  FOR SELECT TO anon USING (true);

CREATE POLICY board_reviews_auth_write ON public.board_reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC 1: add a featured player to the board
CREATE OR REPLACE FUNCTION public.add_board_review(
  p_round_number  integer,
  p_season        integer DEFAULT 2026,
  p_player_name   text DEFAULT NULL,
  p_team_name     text DEFAULT NULL,
  p_stat_label    text DEFAULT NULL,
  p_lens          text DEFAULT NULL,
  p_threshold     numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.board_reviews
    (round_number, season, player_name, team_name, stat_label, lens, threshold)
  VALUES
    (p_round_number, p_season, p_player_name, p_team_name, p_stat_label, p_lens, p_threshold)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC 2: grade a featured player (hit or miss + actual value)
CREATE OR REPLACE FUNCTION public.grade_board_review(
  p_id          uuid,
  p_actual_hit  boolean,
  p_actual_value integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.board_reviews
  SET actual_hit = p_actual_hit,
      actual_value = p_actual_value,
      graded_at = now()
  WHERE id = p_id;
END;
$$;

-- RPC 3: get board review summary for a round
CREATE OR REPLACE FUNCTION public.get_board_review_summary(
  p_season       integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS TABLE (
  round_number  integer,
  featured      integer,
  hits          integer,
  misses        integer,
  ungraded      integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    br.round_number,
    COUNT(*)::integer AS featured,
    COUNT(*) FILTER (WHERE br.actual_hit = true)::integer AS hits,
    COUNT(*) FILTER (WHERE br.actual_hit = false)::integer AS misses,
    COUNT(*) FILTER (WHERE br.actual_hit IS NULL)::integer AS ungraded
  FROM public.board_reviews br
  WHERE br.season = p_season
    AND (p_round_number IS NULL OR br.round_number = p_round_number)
  GROUP BY br.round_number
  ORDER BY br.round_number DESC;
END;
$$;

-- RPC 4: get all rows for a round (for grading UI)
CREATE OR REPLACE FUNCTION public.get_board_review_rows(
  p_season       integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  round_number  integer,
  player_name   text,
  team_name     text,
  stat_label    text,
  lens          text,
  threshold     numeric,
  actual_hit    boolean,
  actual_value  integer,
  notes         text,
  created_at    timestamptz,
  graded_at     timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT br.id, br.round_number, br.player_name, br.team_name,
    br.stat_label, br.lens, br.threshold, br.actual_hit,
    br.actual_value, br.notes, br.created_at, br.graded_at
  FROM public.board_reviews br
  WHERE br.season = p_season
    AND (p_round_number IS NULL OR br.round_number = p_round_number)
  ORDER BY br.round_number DESC, br.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_board_review(integer,integer,text,text,text,text,numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_board_review(uuid,boolean,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_review_summary(integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_review_rows(integer,integer) TO anon, authenticated;
