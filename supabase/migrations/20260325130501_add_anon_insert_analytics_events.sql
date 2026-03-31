/*
  # Allow anonymous insert on analytics.events

  The logEvent function fires from the browser for all visitors, including
  unauthenticated ones. The existing INSERT policy only covers authenticated
  users. This adds a matching policy for the anon role so page_view and other
  events are captured regardless of login state.

  Changes:
  - Add INSERT policy on analytics.events for anon role
*/

CREATE POLICY "Anon users can insert analytics events"
  ON analytics.events
  FOR INSERT
  TO anon
  WITH CHECK (true);
