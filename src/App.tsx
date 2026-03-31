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
  console.log("APP RENDER");

  useEffect(() => {
    console.log("App mounted - testing Supabase connection");

    if (supabase) {
      console.log("Supabase client available - running test query");
      supabase
        .from('afl_players')
        .select('*')
        .limit(1)
        .then(res => {
          if (res.error) {
            console.error("❌ Supabase query error:", res.error);
          } else {
            console.log("✅ Supabase test query successful:", res.data);
          }
        })
        .catch(err => {
          console.error("❌ Supabase query exception:", err);
        });
    } else {
      console.warn("⚠️ Supabase client is null - cannot test connection");
    }
  }, []);

  return <div style={{ padding: "20px", fontSize: "24px", color: "white" }}>APP WORKING</div>;
}

export default App;
