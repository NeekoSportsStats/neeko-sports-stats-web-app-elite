/*
  # Step 7c — Document and secure internal-only tables

  ## Tables that are intentionally internal-only (default-deny for all users)

  public.sync_logs   — RLS enabled + FORCE, zero user policies = service_role only
  public.system_locks — RLS enabled + FORCE, zero user policies = service_role only

  These tables use FORCE ROW SECURITY which means even the table owner is
  restricted. Only service_role (which bypasses RLS at the connection level in
  Supabase) can access them. This is the correct posture for internal bookkeeping
  tables.

  Adding explicit service_role SELECT policies so the intent is documented clearly,
  even though service_role already bypasses RLS.
*/

CREATE POLICY "Service role full access to sync_logs"
  ON public.sync_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to system_locks"
  ON public.system_locks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

/*
  ## market schema tables — already correctly scoped
  market_watch_best_trades    — authenticated read, service_role write (implicit)
  market_watch_snapshot       — authenticated read, service_role write (implicit)
  market_watch_snapshot_players — authenticated read, service_role write (implicit)
  mw_value_history            — authenticated read, service_role write (implicit)
  
  Add explicit service_role write policies for completeness.
*/
CREATE POLICY "Service role full access to market_watch_best_trades"
  ON market.market_watch_best_trades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to market_watch_snapshot"
  ON market.market_watch_snapshot FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to market_watch_snapshot_players"
  ON market.market_watch_snapshot_players FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to mw_value_history"
  ON market.mw_value_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
