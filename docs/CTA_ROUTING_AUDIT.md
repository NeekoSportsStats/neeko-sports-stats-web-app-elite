# CTA Routing Audit

**Date:** 2026-06-22  
**Scope:** All user-facing CTAs, buttons, nav links, upgrade prompts, and checkout entry points  
**Status:** Read-only audit — no files changed

---

## Executive Summary

| Category | Count |
|---|---|
| CTAs audited | 55+ |
| PASS | 51 |
| WARN | 4 |
| FAIL | 0 |

**No broken routes or dead ends found.** Four CTAs on the TikTok and Referral landing pages route to `/auth?mode=signup` instead of `/start-checkout`, which is an intentional pre-auth gate but creates an inconsistency with how the rest of the app handles priced CTAs.

---

## Routing Rules

| # | Rule | Description |
|---|---|---|
| R1 | Specific priced CTA | "Start 7-Day Pass — $7.99", "Unlock full round", etc. → `/start-checkout?plan_key=round_pass_7d` |
| R2 | Generic upgrade CTA | "Upgrade", "View plans", "Unlock Neeko+" → `/neeko-plus` |
| R3 | Auth-first purchase | Logged-out user with purchase intent → `/auth?mode=signup&plan_key=round_pass_7d` (acceptable) |
| R4 | Plan key preservation | `plan_key` must survive the auth → checkout redirect chain |
| R5 | No dead ends | Every CTA must resolve to a usable page |

---

## Critical Failures

**None.**

---

## Warnings (4 CTAs)

### TikTokLanding.tsx — 2 CTAs

Both paid CTAs on the TikTok landing page route to `/auth?mode=signup&plan_key=round_pass_7d` instead of `/start-checkout?plan_key=round_pass_7d`.

`StartCheckout.tsx` already handles the unauthenticated case by redirecting to `/auth?mode=signup&plan_key=${plan}` internally, so routing directly to `/start-checkout` would produce the same end-user experience while being consistent with the rest of the app.

| Button Text | Current Route | Expected Route |
|---|---|---|
| `7-Day Round Pass — $7.99 once` | `/auth?mode=signup&plan_key=round_pass_7d` | `/start-checkout?plan_key=round_pass_7d` |
| `Get 7-Day Round Pass — $7.99 once` | `/auth?mode=signup&plan_key=round_pass_7d` | `/start-checkout?plan_key=round_pass_7d` |

### ReferralLanding.tsx — 2 CTAs

Same pattern as TikTok landing. Ref params are preserved on the auth URL, but `StartCheckout.tsx` does not currently forward the `ref` param through to the edge function. This means referral attribution may be lost after checkout for users who arrive via this path.

| Button Text | Current Route | Expected Route |
|---|---|---|
| `Start 7-Day Access — A$7.99` | `/auth?mode=signup&plan_key=round_pass_7d&ref={slug}` | `/start-checkout?plan_key=round_pass_7d&ref={slug}` |
| `Start 7-Day Access` | `/auth?mode=signup&plan_key=round_pass_7d&ref={slug}` | `/start-checkout?plan_key=round_pass_7d&ref={slug}` |

---

## Step 2 Verification: Stat Board → Start 7-Day Pass → Account/Checkout

**Result: PASS**

The full conversion funnel from AFL Player Stat Board works correctly:

1. User lands on `/stat-board/players` (unauthenticated or free tier)
2. One of several upgrade CTAs is shown depending on `accessMode`:
   - `preview` → Preview banner: "Start 7-Day Pass — $7.99" button
   - `free` → Free game banner: "Unlock full round" button
   - `preview` → Mid-board divider: "Start 7-Day Pass — $7.99" button
   - All states → `MobileUpgradeBar` (mobile sticky): "Start 7-Day Pass — $7.99"
3. All Stat Board CTAs route to `/start-checkout?plan_key=round_pass_7d`
4. `StartCheckout.tsx` checks for auth session:
   - If authenticated → calls `/functions/v1/stripe-checkout` → Stripe redirect
   - If unauthenticated → redirects to `/auth?mode=signup&plan_key=round_pass_7d`
5. After sign-up, `Auth.tsx` redirects back to `/start-checkout?plan_key=round_pass_7d`
6. Checkout completes → Stripe success URL

Analytics events fired along this path:
- `trackStatBoardUpgrade` (CTA click)
- `round_pass_checkout_started` (CTA click)
- `upgrade_bar_clicked` (mobile sticky)
- `trackCheckoutStartClicked` (StartCheckout.tsx)
- `trackCheckoutSessionCreated` (edge function response)
- `trackCheckoutRedirected` (before Stripe redirect)

---

## Full CTA Inventory

### Homepage (Index.tsx / MobileLanding.tsx)

| Button Text | Destination | Analytics | Rule | Status |
|---|---|---|---|---|
| Open Stat Board Free (hero) | `/stat-board/players` | `trackLandingCTA` | Free CTA | PASS |
| Unlock Full Round (hero) | `/neeko-plus` | `trackLandingCTA` | R2 | PASS |
| Open Stat Board Free (how_it_works) | `/stat-board/players` | `trackLandingCTA` | Free CTA | PASS |
| Unlock Full Round (how_it_works) | `/neeko-plus` | `trackLandingCTA` | R2 | PASS |
| Open Fantasy Hub | `/fantasy` | — | Nav | PASS |
| View free games (mobile hero) | `/stat-board/players` | `trackFreeGamesCTA` | Free CTA | PASS |
| Unlock full round (mobile hero) | `/neeko-plus` | `trackUnlockAllGames` | R2 | PASS |
| Open Free Game | `/stat-board/players` | — | Free CTA | PASS |
| Unlock Full Round (locked module) | `/neeko-plus` | `trackNeekoPlus` | R2 | PASS |
| Unlock Neeko+ (pricing block) | `/neeko-plus` | `trackNeekoPlus` | R2 | PASS |
| Keep using free preview | `/stat-board/players` | `trackLandingCTA` | Free CTA | PASS |

### Pricing Section (LandingPricing.tsx)

| Button Text | Destination | Analytics | Rule | Status |
|---|---|---|---|---|
| Start 7-Day Access — $7.99 | `/start-checkout?plan_key=round_pass_7d` | `trackPricingCTA` | R1 | PASS |
| Get Neeko+ Weekly | `/start-checkout?plan_key=weekly` | `trackPricingCTA` | R1 | PASS |
| Get Neeko+ — Full Season Access | `/start-checkout?plan_key=season` | `trackPricingCTA` | R1 | PASS |
| Open Stat Board Free | `/stat-board/players` | `trackLandingCTA` | Free CTA | PASS |

### Final CTA Section (LandingFinalCTA.tsx)

| Button Text | Destination | Analytics | Rule | Status |
|---|---|---|---|---|
| Start 7-Day Access — $7.99 AUD | `/start-checkout?plan_key=round_pass_7d` | `trackNeekoPlus` + `trackLandingCTA` | R1 | PASS |
| Open Stat Board Free | `/stat-board/players` | `trackLandingCTA` | Free CTA | PASS |

### AFL Player Stat Board (StatBoardPlayersPage.tsx)

| Button Text | Section | Destination | Analytics | Rule | Status |
|---|---|---|---|---|---|
| Start 7-Day Pass — $7.99 | Preview banner | `/start-checkout?plan_key=round_pass_7d` | `trackStatBoardUpgrade` + `round_pass_checkout_started` | R1 | PASS |
| Unlock full round | Free game banner | `/start-checkout?plan_key=round_pass_7d` | `trackStatBoardUpgrade` + `inline_unlock_clicked` | R1 | PASS |
| View free | Top banner | `/stat-board/players` | `trackFreeGamesCTA` | Free CTA | PASS |
| Start 7-Day Pass — $7.99 | Top banner | `/start-checkout?plan_key=round_pass_7d` | `trackStatBoardUpgrade` + `round_pass_checkout_started` | R1 | PASS |
| Start 7-Day Pass — $7.99 | Locked banner | `/start-checkout?plan_key=round_pass_7d` | `trackStatBoardUpgrade` + `round_pass_checkout_started` | R1 | PASS |
| View free games | Locked banner | `/stat-board/players` | `trackFreeGamesCTA` | Free CTA | PASS |
| Start 7-Day Pass — $7.99 | Mid-board divider | `/start-checkout?plan_key=round_pass_7d` | `trackStatBoardUpgrade` + `round_pass_checkout_started` | R1 | PASS |

### Mobile Upgrade Bar (MobileUpgradeBar.tsx)

| Button Text | State | Destination | Analytics | Rule | Status |
|---|---|---|---|---|---|
| Start 7-Day Pass — $7.99 | free | `/start-checkout?plan_key=round_pass_7d` | `trackMobileStickyCTA` + `upgrade_bar_clicked` | R1 | PASS |
| Start 7-Day Pass — $7.99 | locked | `/start-checkout?plan_key=round_pass_7d` | `trackMobileStickyCTA` + `upgrade_bar_clicked` | R1 | PASS |
| Dismiss (X) | any | (dismissed in-memory) | `upgrade_bar_dismissed` | — | PASS |

### Match Selector — Locked Match (MobileMatchBottomSheet.tsx)

| Interaction | Analytics | Status |
|---|---|---|
| Tap locked match | `locked_match_clicked` | PASS |

### Neeko+ Plans Page (NeekoPlusPurchase.tsx)

| Button Text | Destination | Analytics | Rule | Status |
|---|---|---|---|---|
| Get 7-Day Round Pass — $7.99 AUD | `handleSubscribe("round_pass_7d")` → Stripe | `trackCTA` + `trackNeekoPlus` + `trackCheckoutStartClicked` | R1 | PASS |
| Start Weekly — $5.99 AUD/wk | `handleSubscribe("weekly")` → Stripe | `trackCTA` + `trackNeekoPlus` | R1 | PASS |
| Get Full Season Access — $59 AUD | `handleSubscribe("season")` → Stripe | `trackCTA` + `trackNeekoPlus` | R1 | PASS |
| Buy Another 7-Day Pass — $7.99 AUD | Stripe checkout | `trackCTA` | R1 | PASS |
| Back to plans (error state) | `/neeko-plus` | — | R2 | PASS |

### StartCheckout.tsx

| Interaction | Destination | Status |
|---|---|---|
| Page load (authenticated) | → Stripe checkout | PASS |
| Page load (unauthenticated) | → `/auth?mode=signup&plan_key=${plan}` | PASS |
| Invalid plan_key | `/neeko-plus` redirect | PASS |
| Error fallback button | `/neeko-plus` | PASS |

### Auth.tsx

| Button Text | Context | Destination | Status |
|---|---|---|---|
| Sign In & Continue to Checkout | with purchase intent | → resumes intent → `/start-checkout` | PASS |
| Sign In | no intent | `/` or dashboard | PASS |
| Continue to Secure Checkout | signup with intent | → resumes intent → `/start-checkout` | PASS |
| Sign Up | no intent | `/` or dashboard | PASS |
| Forgot your password? | — | `/forgot-password` | PASS |

### TikTok Landing (TikTokLanding.tsx)

| Button Text | Destination | Rule | Status |
|---|---|---|---|
| View Free Games | `/stat-board/players` | Free CTA | PASS |
| 7-Day Round Pass — $7.99 once | `/auth?mode=signup&plan_key=round_pass_7d` | R3 acceptable / R1 inconsistency | WARN |
| Get 7-Day Round Pass — $7.99 once | `/auth?mode=signup&plan_key=round_pass_7d` | R3 acceptable / R1 inconsistency | WARN |
| View all plans | `/neeko-plus?plan=round_pass_7d` | R2 | PASS |

### Referral Landing (ReferralLanding.tsx)

| Button Text | Destination | Rule | Status |
|---|---|---|---|
| View Free Games | `/stat-board/players` | Free CTA | PASS |
| Start 7-Day Access — A$7.99 | `/auth?mode=signup&plan_key=round_pass_7d&ref={slug}` | R3 acceptable / R1 inconsistency | WARN |
| Start 7-Day Access | `/auth?mode=signup&plan_key=round_pass_7d&ref={slug}` | R3 acceptable / R1 inconsistency | WARN |
| View all plans | `/neeko-plus?plan=round_pass_7d&ref={slug}` | R2 | PASS |

### Navigation (AppSidebar.tsx / DesktopHeader.tsx)

| Link Text | Destination | Shown When | Status |
|---|---|---|---|
| Stat Board | `/stat-board` | always | PASS |
| Fantasy Hub | `/fantasy` | always | PASS |
| Players | `/sports/afl/players` | always | PASS |
| Teams | `/sports/afl/teams` | always | PASS |
| Neeko+ | `/neeko-plus` | !isPremium | PASS |
| Account | `/account` | isPremium | PASS |
| Sign In | `/auth` | !user | PASS |

---

## Prices Confirmation

| Plan | Price | plan_key |
|---|---|---|
| 7-Day Round Pass | $7.99 AUD (one-time) | `round_pass_7d` |
| Weekly | $5.99 AUD/wk | `weekly` |
| Full Season | $59 AUD | `season` |

All prices are consistent across landing pages, pricing section, and Neeko+ purchase page.

---

## Files Needing Attention

### Low priority (consistency, not broken)

| File | Issue | Recommended Change |
|---|---|---|
| `src/pages/TikTokLanding.tsx` | Priced CTAs route to `/auth?mode=signup` instead of `/start-checkout` | Change to `/start-checkout?plan_key=round_pass_7d` — `StartCheckout.tsx` already handles unauthenticated users correctly |
| `src/pages/ReferralLanding.tsx` | Same pattern; `ref` param may be dropped after checkout | Change to `/start-checkout?plan_key=round_pass_7d&ref={slug}` and verify `StartCheckout.tsx` forwards `ref` to the edge function |

### No action needed

- All Stat Board CTAs: correct
- MobileUpgradeBar: correct
- LandingPricing: correct
- LandingFinalCTA: correct
- NeekoPlusPurchase: correct
- AppSidebar / DesktopHeader nav: correct
- Auth flow: correct
- StartCheckout: correct

---

## Build Status

Build verified passing at time of audit. No compilation errors.
