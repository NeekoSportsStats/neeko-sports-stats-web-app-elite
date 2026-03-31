/*
  # Drop and recreate v_mw_summary with new 5-category column names

  Aligns the summary view with the new category values:
  buy_before_rise, upgrade_target, sell_before_drop, cash_cow, fade_trap, monitor
*/

DROP VIEW IF EXISTS public.v_mw_summary CASCADE;

CREATE VIEW public.v_mw_summary AS
SELECT
  COALESCE(SUM(CASE WHEN p.category = 'buy_before_rise'  THEN 1 ELSE 0 END), 0) AS buy_before_rise_count,
  COALESCE(SUM(CASE WHEN p.category = 'upgrade_target'   THEN 1 ELSE 0 END), 0) AS upgrade_target_count,
  COALESCE(SUM(CASE WHEN p.category = 'sell_before_drop' THEN 1 ELSE 0 END), 0) AS sell_count,
  COALESCE(SUM(CASE WHEN p.category = 'cash_cow'         THEN 1 ELSE 0 END), 0) AS cash_cow_count,
  COALESCE(SUM(CASE WHEN p.category = 'fade_trap'        THEN 1 ELSE 0 END), 0) AS trap_count,
  COALESCE(SUM(CASE WHEN p.category = 'monitor'          THEN 1 ELSE 0 END), 0) AS monitor_count,
  s.updated_at AS latest_update
FROM market.market_watch_snapshot s
JOIN market.market_watch_snapshot_players p ON p.snapshot_id = s.snapshot_id
WHERE s.is_active = true
GROUP BY s.updated_at;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;
