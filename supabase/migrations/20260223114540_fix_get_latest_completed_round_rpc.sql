/*
  # Fix afl.get_latest_completed_round RPC

  ## Problem
  The function exists but references afl.games which does not exist:
    ERROR: 42P01: relation "afl.games" does not exist

  ## Frontend contract
    supabase.rpc("get_latest_completed_round", { p_season: season })
    Expects: array with data[0].round_number (integer)
    Signature: p_season integer → TABLE(round_number integer)

  ## Authoritative source
    afl.match_center_games_base:
      - status column: 'FT' = completed, 'Not Started' = not played
      - season column: integer (2025 has 216 FT rows, 2026 has 0 FT rows)
      - round_number column: integer

  ## Completion rule
    status = 'FT' — the only completed-game indicator in the dataset.
    All 216 completed matches in season 2025 use this value.

  ## Fallback
    Returns 0 if no completed round found (COALESCE prevents NULL).

  ## Notes
    - Signature is preserved exactly: p_season integer → TABLE(round_number integer)
    - Only the function body is replaced (CREATE OR REPLACE)
    - STABLE volatility — correct for a read-only deterministic query
*/

CREATE OR REPLACE FUNCTION afl.get_latest_completed_round(p_season integer)
RETURNS TABLE(round_number integer)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(g.round_number), 0) AS round_number
  FROM afl.match_center_games_base g
  WHERE g.season = p_season
    AND g.status = 'FT';
$$;
