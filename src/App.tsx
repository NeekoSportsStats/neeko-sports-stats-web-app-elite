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
    if (supabase) {
      supabase
        .from('afl_players')
        .select('*')
        .limit(1)
        .then(res => {
          if (res.error) {
            console.error("Supabase error:", res.error.message);
            if (res.error.code === 'PGRST301' || res.error.message?.includes('row-level security')) {
              console.error("RLS blocking access - policies needed in Supabase");
            }
          } else {
            console.log("Supabase connected and working");
          }
        });
    }
  }, []);

  useEffect(() => {
    track("Page View", { path: location.pathname });
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/create-password" element={<S fallback={Generic}><CreatePassword /></S>} />
      <Route path="/forgot-password" element={<S fallback={Generic}><ForgotPassword /></S>} />
      <Route path="/reset-password" element={<S fallback={Generic}><ResetPassword /></S>} />

      <Route element={<Layout />}>
        <Route path="/" element={<Index />} />
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

        <Route path="/sports/afl" element={<Navigate to="/sports/afl/rankings" replace />} />
        <Route path="/sports/afl/rankings" element={<S fallback={Players}><AFLRankingsPage /></S>} />
        <Route path="/sports/afl/edge-board" element={<S fallback={AI}><AFLRoundEdgeBoard /></S>} />
        <Route path="/sports/afl/start-sit" element={<S fallback={AI}><AFLStartSitPage /></S>} />
        <Route path="/sports/afl/market-watch" element={<S fallback={AI}><AFLMarketWatch /></S>} />

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
          <Route path="player-lab" element={<AdminPlayerLabPage />} />
          <Route path="marketing" element={<AdminMarketingPage />} />
          <Route path="admin" element={<AdminAdminPage />} />
        </Route>

        <Route path="/pipeline-history" element={<RequireAdmin><S fallback={Generic}><PipelineHistory /></S></RequireAdmin>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
