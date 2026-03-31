/*
  # Rebuild get_rankings_free and get_rankings_premium RPCs

  ## Summary
  Replaces both ranking RPC functions with versions that:
  1. Actually honour the sort_key parameter (previously ignored)
  2. Return SETOF afl.v_player_rankings_full (unchanged — picks up new columns automatically)
  3. Apply position filtering correctly
  4. Sort descending by default (highest first)

  ## Supported sort_key values:
  - 'neeko_rating'          → ORDER BY neeko_rating DESC
  - 'projection_final'      → ORDER BY projection_final DESC
  - 'value_score'           → ORDER BY value_score DESC NULLS LAST
  - 'projection_confidence' → ORDER BY projection_confidence DESC
  - 'risk_rating'           → ORDER BY risk_rating ASC (lower risk = better rank)
  - default                 → ORDER BY neeko_rating DESC

  ## Premium vs Free distinction:
  Both functions return the same view. Gating is handled on the frontend.
  The free function is limited to limit_n rows (fetches first 25 by default).
  The premium function supports up to 750 rows.
*/

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text,
  sort_key        text,
  limit_n         integer
)
RETURNS SETOF afl.v_player_rankings_full
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM afl.v_player_rankings_full v
  WHERE (position_filter = 'ALL' OR v.position = position_filter)
  ORDER BY
    CASE WHEN sort_key = 'neeko_rating'          THEN v.neeko_rating          END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_final'      THEN v.projection_final      END DESC NULLS LAST,
    CASE WHEN sort_key = 'value_score'           THEN v.value_score           END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_confidence' THEN v.projection_confidence END DESC NULLS LAST,
    CASE WHEN sort_key = 'risk_rating'           THEN v.risk_rating           END ASC  NULLS LAST,
    v.neeko_rating DESC NULLS LAST
  LIMIT limit_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  position_filter text,
  sort_key        text,
  limit_n         integer
)
RETURNS SETOF afl.v_player_rankings_full
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM afl.v_player_rankings_full v
  WHERE (position_filter = 'ALL' OR v.position = position_filter)
  ORDER BY
    CASE WHEN sort_key = 'neeko_rating'          THEN v.neeko_rating          END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_final'      THEN v.projection_final      END DESC NULLS LAST,
    CASE WHEN sort_key = 'value_score'           THEN v.value_score           END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_confidence' THEN v.projection_confidence END DESC NULLS LAST,
    CASE WHEN sort_key = 'risk_rating'           THEN v.risk_rating           END ASC  NULLS LAST,
    v.neeko_rating DESC NULLS LAST
  LIMIT limit_n;
END;
$$;
