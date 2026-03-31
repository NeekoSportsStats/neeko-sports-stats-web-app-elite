import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { track } from "@/lib/analytics";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";
import {
  PlayersPageSkeleton,
  AIInsightsSkeleton,
  GenericPageSkeleton,
} from "@/components/skeletons/PageSkeletons";

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
  AdminPlayerLabPage,
  AdminMarketingPage,
  AdminAdminPage,
} from "@/pages/Admin";

const NeekoPlusPurchase = React.lazy(() => import("@/pages/NeekoPlusPurchase"));
const Account           = React.lazy(() => import("@/pages/Account"));
const Billing           = React.lazy(() => import("@/pages/Billing"));
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
const AFLRankingsPage   = React.lazy(() => import("@/features/afl/rankings/AFLRankingsPage"));
const AFLRoundEdgeBoard = React.lazy(() => import("@/features/afl/edge/AFLRoundEdgeBoard"));
const AFLStartSitPage   = React.lazy(() => import("@/features/afl/start-sit/StartSitPage"));
const AFLMarketWatch    = React.lazy(() => import("@/features/afl/market-watch/MarketWatchPage"));

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

  useEffect(() => {
    track("page_view", { page: location.pathname });
  }, [location.pathname]);

  return (
    <Routes>
      {/* =========================
         Auth & Checkout
      ========================= */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/create-password" element={<S fallback={Generic}><CreatePassword /></S>} />
      <Route path="/forgot-password" element={<S fallback={Generic}><ForgotPassword /></S>} />
      <Route path="/reset-password"  element={<S fallback={Generic}><ResetPassword /></S>} />
      <Route path="/start-checkout"  element={<S fallback={Generic}><StartCheckout /></S>} />

      {/* =========================
         Home
      ========================= */}
      <Route
        path="/"
        element={
          <Layout>
            <Index />
          </Layout>
        }
      />

      {/* =========================
         Neeko+
      ========================= */}
      <Route
        path="/neeko-plus"
        element={
          <Layout>
            <S fallback={Generic}><NeekoPlusPurchase /></S>
          </Layout>
        }
      />

      {/* =========================
         Protected
      ========================= */}
      <Route
        path="/account"
        element={
          <RequireAuth>
            <Layout>
              <S fallback={Generic}><Account /></S>
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/billing"
        element={
          <RequireAuth>
            <Layout>
              <S fallback={Generic}><Billing /></S>
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Layout>
              <AdminShell />
            </Layout>
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard"             element={<S fallback={Generic}><AdminDashboardPage /></S>} />
        <Route path="health"                element={<S fallback={Generic}><AdminHealthPage /></S>} />
        <Route path="user-metrics"          element={<S fallback={Generic}><AdminUserMetricsPage /></S>} />
        <Route path="command-center"        element={<S fallback={Generic}><AdminCommandPage /></S>} />
        <Route path="player-lab"            element={<S fallback={Generic}><AdminPlayerLabPage /></S>} />
        <Route path="marketing"             element={<S fallback={Generic}><AdminMarketingPage /></S>} />
        <Route path="admin"                 element={<S fallback={Generic}><AdminAdminPage /></S>} />
        {/* Legacy redirects */}
        <Route path="control-room"          element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="overview"              element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="pipeline"              element={<Navigate to="/admin/health" replace />} />
        <Route path="pipelines"             element={<Navigate to="/admin/health" replace />} />
        <Route path="system-health"         element={<Navigate to="/admin/health" replace />} />
        <Route path="ai"                    element={<Navigate to="/admin/command-center" replace />} />
        <Route path="ai-content"            element={<Navigate to="/admin/command-center" replace />} />
        <Route path="data"                  element={<Navigate to="/admin/command-center" replace />} />
        <Route path="data-integrity"        element={<Navigate to="/admin/health" replace />} />
        <Route path="operations"            element={<Navigate to="/admin/command-center" replace />} />
        <Route path="players-intelligence"  element={<Navigate to="/admin/player-lab" replace />} />
        <Route path="todo"                  element={<Navigate to="/admin/admin" replace />} />
        <Route path="accuracy"              element={<Navigate to="/admin/player-lab" replace />} />
        <Route path="analytics"             element={<Navigate to="/admin/user-metrics" replace />} />
      </Route>

      <Route
        path="/admin/pipeline-history"
        element={
          <RequireAdmin>
            <Layout>
              <S fallback={Generic}><PipelineHistory /></S>
            </Layout>
          </RequireAdmin>
        }
      />

      {/* =========================
         Success / Cancel
      ========================= */}
      <Route path="/success" element={<S fallback={Generic}><Success /></S>} />
      <Route path="/cancel"  element={<S fallback={Generic}><Cancel /></S>} />

      {/* =========================
         Info
      ========================= */}
      <Route path="/about"   element={<Layout><S fallback={Generic}><About /></S></Layout>} />
      <Route path="/socials" element={<Layout><S fallback={Generic}><Socials /></S></Layout>} />
      <Route path="/faq"     element={<Layout><S fallback={Generic}><FAQ /></S></Layout>} />
      <Route path="/contact" element={<Layout><S fallback={Generic}><Contact /></S></Layout>} />

      {/* =========================
         Policies
      ========================= */}
      <Route path="/policies"              element={<Layout><S fallback={Generic}><Policies /></S></Layout>} />
      <Route path="/policies/privacy"      element={<Layout><S fallback={Generic}><PrivacyPolicy /></S></Layout>} />
      <Route path="/policies/refund"       element={<Layout><S fallback={Generic}><RefundPolicy /></S></Layout>} />
      <Route path="/policies/security"     element={<Layout><S fallback={Generic}><SecurityPolicy /></S></Layout>} />
      <Route path="/policies/terms"        element={<Layout><S fallback={Generic}><TermsConditions /></S></Layout>} />
      <Route path="/policies/conduct"      element={<Layout><S fallback={Generic}><UserConductPolicy /></S></Layout>} />
      <Route path="/policies/user-conduct" element={<Layout><S fallback={Generic}><UserConductPolicy /></S></Layout>} />
      <Route path="/user-conduct-policy"   element={<Layout><S fallback={Generic}><UserConductPolicy /></S></Layout>} />

      {/* =========================
         AFL
      ========================= */}
      <Route path="/sports/afl" element={<Navigate to="/sports/afl/rankings" replace />} />
      <Route path="/sports/afl/rankings"    element={<Layout><S fallback={Players}><AFLRankingsPage /></S></Layout>} />
      <Route path="/sports/afl/neeko-intel" element={<Navigate to="/sports/afl/edge-board" replace />} />
      <Route path="/sports/afl/edge-board"  element={<Layout><S fallback={Generic}><AFLRoundEdgeBoard /></S></Layout>} />
      <Route path="/sports/afl/compare"       element={<Navigate to="/sports/afl/start-sit" replace />} />
      <Route path="/sports/afl/start-sit"    element={<Layout><S fallback={Generic}><AFLStartSitPage /></S></Layout>} />
      <Route path="/sports/afl/market-watch" element={<Layout><S fallback={Generic}><AFLMarketWatch /></S></Layout>} />

      {/* =========================
         Catch-all
      ========================= */}
      <Route path="*" element={<Layout><NotFound /></Layout>} />
    </Routes>
  );
}

export default App;
