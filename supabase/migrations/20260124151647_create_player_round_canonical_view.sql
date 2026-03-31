/*
  # Create Player Round Canonical View
  
  Creates a denormalized view that joins player stats with team and player info,
  including round_display labels for UI rendering.
  
  1. View Creation
    - `v_player_round_canonical_2025`
    - Joins afl.round_player_summary with afl.players and afl.teams
    - Adds computed round_display field (e.g., "R1", "R24(1)", "R24(2)")
    - Includes match_index for multi-game rounds
    
  2. Round Display Logic
    - Regular rounds: "R{round_number}" (e.g., "R1", "R23")
    - Double-header rounds: "R{round_number}({match_index}/2)" (e.g., "R24(1/2)", "R24(2/2)")
    - Only shows fraction notation when match_index > 1 OR multiple games exist for that round
*/

CREATE OR REPLACE VIEW public.v_player_round_canonical_2025 AS
SELECT 
  rps.season,
  rps.round_number,
  -- Compute round_display: Use "R{n}({idx}/{total})" format for multi-game rounds
  CASE 
    WHEN rps.match_index > 1 OR (
      SELECT COUNT(DISTINCT rps2.match_index) 
      FROM afl.round_player_summary rps2 
      WHERE rps2.season = rps.season 
        AND rps2.round_number = rps.round_number
    ) > 1 THEN
      'R' || rps.round_number || '(' || rps.match_index || '/' || (
        SELECT COUNT(DISTINCT rps3.match_index)
        FROM afl.round_player_summary rps3
        WHERE rps3.season = rps.season 
          AND rps3.round_number = rps.round_number
      ) || ')'
    ELSE 
      'R' || rps.round_number
  END AS round_display,
  -- Sort key: ensures proper ordering (regular rounds, then multi-game rounds in sequence)
  (rps.round_number * 100 + rps.match_index) AS round_sort_key,
  rps.match_index,
  p.name AS player,
  t.abbreviation AS team,
  p.role AS position,
  t.color AS team_color,
  rps.played,
  rps.disposals,
  rps.goals,
  rps.fantasy_points
FROM afl.round_player_summary rps
JOIN afl.players p ON p.id = rps.player_id
JOIN afl.teams t ON t.id = rps.team_id
WHERE rps.season = 2025;

-- Grant access
GRANT SELECT ON public.v_player_round_canonical_2025 TO authenticated, anon;
