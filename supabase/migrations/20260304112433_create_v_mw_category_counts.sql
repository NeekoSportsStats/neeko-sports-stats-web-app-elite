/*
  # Market Watch Category Counts View

  ## Summary
  Creates a lightweight view returning per-category player counts from the
  active market watch snapshot. Used by the frontend navigation banner.

  ## New Views
  - `market.v_mw_category_counts` — row of counts per category (buy, sell_now,
    sell_consider, cash_cow, fade, monitor, breakouts)
  - `public.v_mw_category_counts` — public wrapper with anon/authenticated SELECT grant

  ## Notes
  - No role_change_flag column exists on snapshot_players table — omitted
  - Safe mode: no tables dropped or modified
*/

CREATE OR REPLACE VIEW market.v_mw_category_counts AS
SELECT
  COUNT(*) FILTER (WHERE p.category = 'buy')            AS buy_targets,
  COUNT(*) FILTER (WHERE p.category = 'sell_now')       AS sell_now,
  COUNT(*) FILTER (WHERE p.category = 'sell_consider')  AS sell_consider,
  COUNT(*) FILTER (WHERE p.category = 'cash_cow')       AS cash_cows,
  COUNT(*) FILTER (WHERE p.category = 'fade')           AS fades,
  COUNT(*) FILTER (WHERE p.category = 'monitor')        AS monitors,
  COUNT(*) FILTER (WHERE p.breakout_flag = true)        AS breakouts
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s ON p.snapshot_id = s.snapshot_id
WHERE s.is_active = true;

DROP VIEW IF EXISTS public.v_mw_category_counts;

CREATE VIEW public.v_mw_category_counts AS
SELECT * FROM market.v_mw_category_counts;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;
