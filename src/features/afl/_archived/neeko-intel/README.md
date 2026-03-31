# Archived: Neeko Intel

**Archived:** 2026-03-03

## What this was

Neeko Intel was a standalone weekly intelligence page for AFL fantasy. It surfaced captain picks, breakout alerts, risers/fallers, risk flags, and match predictions drawn from the Neeko AI pipeline.

## Why it was archived

Edge Board was established as the single weekly intel destination. Neeko Intel was removed from navigation and routing to consolidate the experience into one feature.

## What happened to the route

`/sports/afl/neeko-intel` now redirects to `/sports/afl/edge-board` via a `<Navigate replace />` in `src/App.tsx`. No 404s, no broken bookmarks.

## How to restore

1. Move this folder back to `src/features/afl/neeko-intel/`
2. Re-add the lazy import in `src/App.tsx`:
   ```ts
   const AFLNeekoIntelPage = React.lazy(() => import("@/features/afl/neeko-intel/AFLNeekoIntelPage"));
   ```
3. Replace the redirect route in `src/App.tsx` with:
   ```tsx
   <Route path="/sports/afl/neeko-intel" element={<Layout><S fallback={AI}><AFLNeekoIntelPage /></S></Layout>} />
   ```
4. Re-add the nav item in `src/components/AppSidebar.tsx` under the AFL sub-menu.

## Files

- `AFLNeekoIntelPage.tsx` — main page component
- `NeekoIntelCard.tsx` — card component used in the grid
- `components/NeekoIntelCaptainModule.tsx` — captain picks module
- `components/CaptainRecommendations.tsx` — captain recommendation display
