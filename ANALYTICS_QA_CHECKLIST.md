# Analytics QA Checklist

Manual test steps to verify the unified analytics implementation. Run these after any changes to `src/lib/analytics.ts`, `src/hooks/useEngagementTracking.ts`, or checkout flows.

Open PostHog Live Events (or browser console in dev mode) before starting.

---

## Attribution & Page Tracking

- [ ] **1. TikTok first-touch attribution**
  Visit `/?utm_source=tiktok&utm_medium=social&utm_campaign=round13` in a fresh browser session.
  Confirm `localStorage.neeko_first_touch_attribution` is set with `utm_source=tiktok`.
  Visit again with different UTMs — confirm first-touch is NOT overwritten.

- [ ] **2. Last-touch attribution updates**
  Visit `/?utm_source=google&utm_medium=cpc`. Check `localStorage.neeko_last_touch_attribution` has `utm_source=google`.
  Navigate to `/?utm_source=tiktok`. Confirm last-touch now shows `utm_source=tiktok` (updated).

- [ ] **3. TikTok referrer inference**
  Clear localStorage. Visit site via a link that sets `document.referrer` to `https://www.tiktok.com/...` with no UTM params.
  Confirm attribution object infers `utm_source=tiktok, utm_medium=social`.

- [ ] **4. `page_viewed` fires on each route change**
  Navigate between `/`, `/fantasy/rankings`, `/fantasy/market-watch`.
  Confirm `page_viewed` fires for each with correct `clean_page_path` (no query string, no trailing slash).

- [ ] **5. `clean_page_path` strips query strings**
  Visit `/fantasy/rankings?position=MID&sort=neeko_rating`.
  Confirm `page_viewed` has `clean_page_path = "/fantasy/rankings"`.

---

## Session Engagement

- [ ] **6. Heartbeat at 15 seconds**
  Stay on any page for 15 seconds.
  Confirm `session_heartbeat` fires with `duration_label="15s"` and `duration_ms=15000`.

- [ ] **7. Heartbeat at 30 and 60 seconds**
  Stay on same page for 60 seconds.
  Confirm `session_heartbeat` fires again at 30s and 60s. Confirm exactly 3 heartbeats total per page.

- [ ] **8. Heartbeats reset on navigation**
  Navigate to a new page before 15s. Confirm the old heartbeat timers are cancelled (no event fires after leaving).
  Confirm fresh 15s/30s/60s timers start on the new page.

- [ ] **9. Scroll depth at 25%**
  Open a long page (e.g. `/fantasy/rankings` with full list).
  Scroll to approximately 25% of the page height.
  Confirm `scroll_depth_reached` fires with `depth_pct=25`.

- [ ] **10. Scroll depth thresholds — 50/75/100%**
  Continue scrolling to bottom.
  Confirm `scroll_depth_reached` fires exactly once each at 50, 75, and 100.
  Confirm it does NOT fire again if you scroll back up and down.

---

## CTA Tracking

- [ ] **11. Landing hero CTA**
  Visit `/`. Click the primary hero CTA (e.g. "Get Started Free" or "Unlock Premium").
  Confirm `cta_clicked` fires with `cta_location` containing `"hero"` and `cta_type` set appropriately.

- [ ] **12. Pricing section CTA**
  On the landing page, scroll to pricing and click an upgrade button.
  Confirm `cta_clicked` fires with `cta_location` containing `"pricing"`.

- [ ] **13. `cta_clicked` always includes required fields**
  For any CTA click, confirm the event properties include ALL of:
  `cta_text`, `cta_location`, `cta_type`, `destination`, `current_path`, `clean_page_path`.

- [ ] **14. TikTok landing page CTAs**
  Visit `/afl/round-13`. Click each CTA (Explore Free Tools, Unlock Premium, feature cards, pricing buttons).
  Confirm `cta_clicked` fires for each with `cta_location` prefixed `"tiktok_landing_"`.

---

## Gate & Locked Data Tracking

- [ ] **15. `gate_viewed` fires on premium gate**
  As a free user, navigate to a page with a premium gate (e.g. `/fantasy/market-watch` premium table).
  Confirm `gate_viewed` fires with a meaningful `source` or `section` property.

- [ ] **16. `locked_data_clicked` fires on stat board**
  As a free user on `/stat-board/players`, click a locked row cell.
  Confirm `locked_data_clicked` fires with `source="stat_board_players"` and `section="board_row"`.

---

## Checkout Funnel

- [ ] **17. `checkout_start_clicked` fires immediately on button press**
  Click any upgrade/subscribe button that triggers checkout.
  Confirm `checkout_start_clicked` fires BEFORE any async operation completes (should be the first event in the sequence).

- [ ] **18. `checkout_redirect_attempted` fires before Stripe redirect**
  Continue the checkout flow.
  Confirm `checkout_redirect_attempted` fires with `has_session=true` just before the browser redirects to Stripe.

- [ ] **19. `checkout_started` fires only on Stripe session creation**
  Confirm `checkout_started` fires ONLY when a valid Stripe session was returned (not on error paths).
  Confirm it includes `checkout_session_id_present=true`.

- [ ] **20. `subscription_activated` fires on success page**
  Complete a test checkout. On `/success`, confirm `subscription_activated` fires with `session_id_present=true`.

- [ ] **21. `checkout_cancelled` fires on cancel page**
  Abandon checkout and return to `/cancel`. Confirm `checkout_cancelled` fires.

---

## Admin Exclusion

- [ ] **22. No events tracked for admin users**
  Log in as an admin. Navigate to `/admin/dashboard`.
  Confirm NO analytics events fire (check PostHog live events — nothing should appear).
  Also confirm no events fire on localhost during development (PostHog is disabled in dev).

---

## PostHog Report Validation

After running the above steps, open Admin > Marketing Insights and verify:

- Funnel shows all 6 stages: Page Views → Gate Views → CTA Clicks → Checkout Start Clicked → Checkout Started → Checkout Success
- CTA Performance table columns are: Location | Text | Type | Clicks
- CTA rows show meaningful `cta_location` values (e.g. `landing_hero`, `tiktok_landing_pricing`) not raw event names
- Acquisition table shows `cta_clicks` column (not legacy `landing_cta_clicked` etc.)
- No duplicate events or phantom entries from legacy event names

---

## Acceptance Criteria Summary

| # | Criterion | Pass |
|---|-----------|------|
| 1 | `page_viewed` fires on every route change | [ ] |
| 2 | `clean_page_path` strips query strings and hashes | [ ] |
| 3 | All CTA clicks fire `cta_clicked` (not legacy names) | [ ] |
| 4 | `cta_clicked` includes all 6 required properties | [ ] |
| 5 | First-touch attribution written once and never overwritten | [ ] |
| 6 | Last-touch attribution updates on every campaign visit | [ ] |
| 7 | TikTok referrer is detected and inferred when no UTMs present | [ ] |
| 8 | `gate_viewed` fires when premium gate is rendered | [ ] |
| 9 | `locked_data_clicked` fires when locked cell is clicked | [ ] |
| 10 | `checkout_start_clicked` fires synchronously on button press | [ ] |
| 11 | `checkout_redirect_attempted` fires before Stripe redirect | [ ] |
| 12 | `checkout_started` fires only on successful Stripe session creation | [ ] |
| 13 | `subscription_activated` fires on `/success` | [ ] |
| 14 | `checkout_cancelled` fires on `/cancel` | [ ] |
| 15 | Heartbeat fires at 15s, 30s, 60s per page | [ ] |
| 16 | Heartbeats reset when navigating to a new page | [ ] |
| 17 | Scroll depth fires at 25/50/75/100% thresholds | [ ] |
| 18 | Scroll depth does not re-fire on the same threshold | [ ] |
| 19 | No events fire for admin users or on `/admin` paths | [ ] |
| 20 | No events fire on localhost | [ ] |
