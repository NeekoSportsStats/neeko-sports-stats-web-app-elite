/*
  # Fix ai_match_predictions RLS — Add Public Read Policy

  ## Problem
  afl.ai_match_predictions has RLS enabled but NO policies defined.
  This means ALL authenticated and anon users are blocked from reading it,
  causing the Match Predictions section in the frontend to appear empty
  even though 5 rows with valid AI summaries exist in the table.

  ## Fix
  Add a SELECT policy allowing authenticated and anon users to read
  match predictions. This data is non-sensitive published AI analysis —
  the same access pattern used by ai_player_summaries and ai_team_summaries
  (which have RLS disabled and are fully readable).

  ## Changed Objects
  - afl.ai_match_predictions: add "Public can read match predictions" SELECT policy
*/

CREATE POLICY "Public can read match predictions"
  ON afl.ai_match_predictions
  FOR SELECT
  TO authenticated, anon
  USING (true);
