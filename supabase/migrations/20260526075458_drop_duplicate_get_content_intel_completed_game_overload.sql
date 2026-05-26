/*
  # Drop duplicate get_content_intel_completed_game RPC overload

  ## Summary
  Two overloads of `get_content_intel_completed_game` exist with the same parameter
  names but different argument order, causing PostgREST ambiguity errors when called
  from the frontend.

  ## Action
  - DROP the older overload (oid 155653): args in order (p_season, p_round, p_match_id, p_lens, p_threshold, p_limit)
  - KEEP the canonical overload (oid 155664): args in order (p_season, p_lens, p_threshold, p_limit, p_round, p_match_id)

  ## Notes
  - No data loss: this is a function, not a table
  - The canonical overload remains fully functional
*/

DROP FUNCTION IF EXISTS get_content_intel_completed_game(
  p_season integer,
  p_round integer,
  p_match_id integer,
  p_lens text,
  p_threshold numeric,
  p_limit integer
);
