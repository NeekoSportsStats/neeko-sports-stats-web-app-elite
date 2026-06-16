import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { trackPageView, captureAttribution, startEngagementTracking, stopEngagementTracking } from "@/lib/analytics";
import { useCanonical } from "@/hooks/useCanonical";
import { Layout } from "@/components/Layout";
import { LandingLayout } from "@/components/LandingLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import {
  PlayersPageSkeleton,
  AIInsightsSkeleton,
  GenericPageSkeleton,
} from "@/components/skeletons/PageSkeletons";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   Critical / always-needed (keep static)
========================= */
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";

/* =========================
   Core Pages — lazy
========================= */
import {
  AdminShell,
  AdminDashboardPage,
  AdminHealthPage,
  AdminUserMetricsPage,
  AdminCommandPage,
  AdminContentIntelPage,
  AdminPlayerLabPage,
  AdminMarketingPage,
  AdminPlayerIdentityPage,
  AdminInternalOpsPage,
  AdminConversionTestPage,
  AdminSocialPlannerPage,
} from "@/pages/Admin";

const NeekoPlusPurchase = React.lazy(() => import("@/pages/NeekoPlusPurchase"));
const Account           = React.lazy(() => import("@/pages/Account"));
const Billing           = React.lazy(() => import("@/pages/Billing"));
const TikTokLanding     = React.lazy(() => import("@/pages/TikTokLanding"));
const ReferralLanding   = React.lazy(() => import("@/pages/ReferralLanding"));
const About             = React.lazy(() => import("@/pages/About"));
const Socials           = React.lazy(() => import("@/pages/Socials"));
const FAQ               = React.lazy(() => import("@/pages/FAQ"));
const Contact           = React.lazy(() => import("@/pages/Contact"));
const PipelineHistory        = React.lazy(() => import("@/pages/PipelineHistory"));
const Success           = React.lazy(() => import("@/pages/Success"));
const Cancel            = React.lazy(() => import("@/pages/Cancel"));
const CreatePassword    = React.lazy(() => import("@/pages/CreatePassword"));
const ForgotPassword    = React.lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword     = React.lazy(() => import("@/pages/ResetPassword"));
const StartCheckout     = React.lazy(() => import("@/pages/StartCheckout"));

/* =========================
   Policies — lazy
========================= */
const Policies          = React.lazy(() => import("@/pages/policies/Policies"));
const PrivacyPolicy     = React.lazy(() => import("@/pages/policies/PrivacyPolicy"));
const RefundPolicy      = React.lazy(() => import("@/pages/policies/RefundPolicy"));
const SecurityPolicy    = React.lazy(() => import("@/pages/policies/SecurityPolicy"));
const TermsConditions   = React.lazy(() => import("@/pages/policies/TermsConditions"));
const UserConductPolicy = React.lazy(() => import("@/pages/policies/UserConductPolicy"));

/* =========================
   AFL Pages — lazy
========================= */
const AFLRankingsPage      = React.lazy(() => import("@/features/afl/rankings/AFLRankingsPage"));
const AFLMarketWatch    = React.lazy(() => import("@/features/afl/market-watch/MarketWatchPageElite"));
const AFLPlayerPage     = React.lazy(() => import("@/pages/afl/AFLPlayerPage"));
const AFLTeamPage       = React.lazy(() => import("@/pages/afl/AFLTeamPage"));
const AFLPositionPage   = React.lazy(() => import("@/pages/afl/AFLPositionPage"));
const AFLRoundPage      = React.lazy(() => import("@/features/afl/round/AFLRoundPage"));
const AFLPlayersPage         = React.lazy(() => import("@/features/afl/players/AFLPlayersPage"));
const AFLTeamsDirectoryPage  = React.lazy(() => import("@/features/afl/teams/AFLTeamsDirectoryPage"));
const StatBoardHubPage          = React.lazy(() => import("@/features/afl/stat-board/StatBoardHubPage"));
const StatBoardPlayersPage      = React.lazy(() => import("@/features/afl/stat-board/StatBoardPlayersPage"));
const StatBoardTeamsPage        = React.lazy(() => import("@/features/afl/stat-board/StatBoardTeamsPage"));
const StatBoardMatchCentrePage  = React.lazy(() => import("@/features/afl/stat-board/StatBoardMatchCentrePage"));
const FantasyHubPage       = React.lazy(() => import("@/features/afl/fantasy/FantasyHubPage"));
const CurrentWeekPage      = React.lazy(() => import("@/features/afl/fantasy/CurrentWeekPage"));

/* =========================
   Suspense helpers
========================= */
function S({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

const Players = <PlayersPageSkeleton />;
const AI      = <AIInsightsSkeleton />;
const Generic = <GenericPageSkeleton />;

function App() {
  const location = useLocation();

  useCanonical();

  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    captureAttribution();
    trackPageView(location.pathname);
    startEngagementTracking();
    return () => stopEngagementTracking();
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/tiktok" element={<S fallback={Generic}><TikTokLanding /></S>} />
      <Route path="/ref/:creatorSlug" element={<S fallback={Generic}><ReferralLanding /></S>} />
      <Route path="/create-password" element={<S fallback={Generic}><CreatePassword /></S>} />
      <Route path="/forgot-password" element={<S fallback={Generic}><ForgotPassword /></S>} />
      <Route path="/reset-password" element={<S fallback={Generic}><ResetPassword /></S>} />

      <Route element={<LandingLayout />}>
        <Route path="/" element={<Index />} />
      </Route>

      <Route element={<Layout />}>
        <Route path="/about" element={<S fallback={Generic}><About /></S>} />
        <Route path="/faq" element={<S fallback={Generic}><FAQ /></S>} />
        <Route path="/contact" element={<S fallback={Generic}><Contact /></S>} />
        <Route path="/socials" element={<S fallback={Generic}><Socials /></S>} />

        <Route path="/policies" element={<S fallback={Generic}><Policies /></S>} />
        <Route path="/privacy-policy" element={<S fallback={Generic}><PrivacyPolicy /></S>} />
        <Route path="/terms-conditions" element={<S fallback={Generic}><TermsConditions /></S>} />
        <Route path="/refund-policy" element={<S fallback={Generic}><RefundPolicy /></S>} />
        <Route path="/security-policy" element={<S fallback={Generic}><SecurityPolicy /></S>} />
        <Route path="/user-conduct-policy" element={<S fallback={Generic}><UserConductPolicy /></S>} />

        <Route path="/neeko-plus" element={<S fallback={Generic}><NeekoPlusPurchase /></S>} />

        {/* AFL Routes — legacy redirects to canonical /fantasy/* routes */}
        <Route path="/sports/afl" element={<Navigate to="/fantasy/current-week" replace />} />
        <Route path="/sports/afl/rankings" element={<Navigate to="/fantasy/rankings" replace />} />
        <Route path="/sports/afl/captains" element={<Navigate to="/fantasy/current-week" replace />} />
        <Route path="/sports/afl/current-round" element={<Navigate to="/fantasy/current-week" replace />} />
        <Route path="/sports/afl/players" element={<S fallback={Players}><AFLPlayersPage /></S>} />
        <Route path="/sports/afl/players/:slug" element={<S fallback={Players}><AFLPlayerPage /></S>} />

        {/* SEO-ONLY ROUTES: Teams & Positions pages accessible via direct URL only, hidden from UX */}
        <Route path="/sports/afl/teams" element={<S fallback={Players}><AFLTeamsDirectoryPage /></S>} />
        <Route path="/sports/afl/teams/:team" element={<S fallback={Players}><AFLTeamPage /></S>} />
        <Route path="/sports/afl/positions/:position" element={<S fallback={Players}><AFLPositionPage /></S>} />

        <Route path="/sports/afl/edge-board" element={<Navigate to="/fantasy/market-watch" replace />} />
        <Route path="/sports/afl/market-watch" element={<Navigate to="/fantasy/market-watch" replace />} />
        <Route path="/sports/afl/round/:roundNumber" element={<S fallback={Players}><AFLRoundPage /></S>} />
        <Route path="/fantasy" element={<S fallback={Players}><FantasyHubPage /></S>} />
        <Route path="/fantasy/current-week" element={<S fallback={Players}><CurrentWeekPage /></S>} />
        <Route path="/fantasy/rankings" element={<S fallback={Players}><AFLRankingsPage /></S>} />
        <Route path="/fantasy/market-watch" element={<S fallback={AI}><AFLMarketWatch /></S>} />
        <Route path="/stat-board" element={<S fallback={Generic}><StatBoardHubPage /></S>} />
        <Route path="/stat-board/players" element={<S fallback={Players}><StatBoardPlayersPage /></S>} />
        <Route path="/stat-board/teams" element={<S fallback={Players}><StatBoardTeamsPage /></S>} />
        <Route path="/stat-board/match-centre" element={<S fallback={Players}><StatBoardMatchCentrePage /></S>} />

        <Route path="/account" element={<RequireAuth><S fallback={Generic}><Account /></S></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth><S fallback={Generic}><Billing /></S></RequireAuth>} />
        <Route path="/neeko-plus-purchase" element={<RequireAuth><S fallback={Generic}><NeekoPlusPurchase /></S></RequireAuth>} />

        <Route path="/checkout" element={<RequireAuth><S fallback={Generic}><StartCheckout /></S></RequireAuth>} />
        <Route path="/success" element={<RequireAuth><S fallback={Generic}><Success /></S></RequireAuth>} />
        <Route path="/cancel" element={<RequireAuth><S fallback={Generic}><Cancel /></S></RequireAuth>} />

        <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="health" element={<AdminHealthPage />} />
          <Route path="users" element={<AdminUserMetricsPage />} />
          <Route path="command" element={<AdminCommandPage />} />
          <Route path="content-intel" element={<AdminContentIntelPage />} />
          <Route path="player-lab" element={<AdminPlayerLabPage />} />
          <Route path="player-identity" element={<AdminPlayerIdentityPage />} />
          <Route path="internal-ops" element={<AdminInternalOpsPage />} />
          <Route path="social-planner" element={<AdminSocialPlannerPage />} />
          {/* Marketing: hidden from main nav, accessible via direct URL for admins */}
          <Route path="marketing" element={<AdminMarketingPage />} />
          {/* /admin/marketing-insights redirects to Users & Growth (Marketing Analytics tab) */}
          <Route path="marketing-insights" element={<Navigate to="/admin/users" replace />} />
          {/* Conversion test: hidden from main nav, accessible via /admin/conversion-test */}
          <Route path="conversion-test" element={<AdminConversionTestPage />} />
          {/* Legacy route redirect — /admin/admin → /admin/internal-ops */}
          <Route path="admin" element={<Navigate to="/admin/internal-ops" replace />} />
        </Route>

        <Route path="/pipeline-history" element={<RequireAdmin><S fallback={Generic}><PipelineHistory /></S></RequireAdmin>} />
      </Route>

      {/* Legacy / deprecated routes — explicit 404 to prevent soft-404 indexing */}
      <Route path="/nba/*" element={<NotFound />} />
      <Route path="/epl/*" element={<NotFound />} />
      <Route path="/products/*" element={<NotFound />} />
      <Route path="/sports/nba/*" element={<NotFound />} />
      <Route path="/sports/epl/*" element={<NotFound />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
