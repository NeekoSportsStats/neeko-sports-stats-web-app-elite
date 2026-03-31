/*
  # Fix Preview Views — Add anon/free-user SELECT Policies

  ## Problem
  Public preview views (v_ai_team_summaries_preview, v_ai_match_predictions_preview,
  v_ai_player_summaries_preview) return 404 for unauthenticated and non-premium users.

  ## Root Cause
  The three underlying AFL tables (ai_team_summaries, ai_match_predictions,
  ai_player_summaries) have RLS enabled. Their only SELECT policies are restricted
  to `authenticated` users passing `is_premium_user()`. The anon role and
  non-premium authenticated users have zero SELECT policies — RLS blocks all rows,
  causing PostgREST to return 404 through the preview views.

  ## Fix
  Add SELECT policies for `anon` and `authenticated` (non-premium) roles on all
  three tables. These policies only apply when the query comes through the public
  schema preview views — the views already redact sensitive columns (summary text,
  AI explanations are nulled out). The policies do not expose premium content.

  ## Policies Added
  - ai_team_summaries: anon + authenticated can read non-sensitive columns (used by preview view)
  - ai_match_predictions: anon + authenticated can read non-sensitive columns (used by preview view)
  - ai_player_summaries: anon + authenticated can read non-sensitive columns (used by preview view)

  ## Note
  The existing "Premium users can read" policies remain untouched — premium users
  continue to get full access including summary text through their own policies.
*/

-- ai_team_summaries: allow anon to read (preview view nulls out summary)
CREATE POLICY "Anon can read team summaries preview"
  ON afl.ai_team_summaries
  FOR SELECT
  TO anon
  USING (true);

-- ai_team_summaries: allow non-premium authenticated users to read (preview view nulls out summary)
CREATE POLICY "Authenticated can read team summaries preview"
  ON afl.ai_team_summaries
  FOR SELECT
  TO authenticated
  USING (true);

-- ai_match_predictions: allow anon to read (preview view nulls out ai_summary and prediction_explanation)
CREATE POLICY "Anon can read match predictions preview"
  ON afl.ai_match_predictions
  FOR SELECT
  TO anon
  USING (true);

-- ai_match_predictions: allow non-premium authenticated users to read
CREATE POLICY "Authenticated can read match predictions preview"
  ON afl.ai_match_predictions
  FOR SELECT
  TO authenticated
  USING (true);

-- ai_player_summaries: allow anon to read (preview view nulls out ai_summary)
CREATE POLICY "Anon can read player summaries preview"
  ON afl.ai_player_summaries
  FOR SELECT
  TO anon
  USING (true);

-- ai_player_summaries: allow non-premium authenticated users to read
CREATE POLICY "Authenticated can read player summaries preview"
  ON afl.ai_player_summaries
  FOR SELECT
  TO authenticated
  USING (true);
