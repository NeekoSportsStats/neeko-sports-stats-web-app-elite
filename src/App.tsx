import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { trackPageView, captureAttribution, startEngagementTracking, stopEngagementTracking } from "@/lib/analytics";
import { useCanonical } from "@/hooks/useCanonical";
import { LandingLayout } from "@/components/LandingLayout";
import { PublicPageLayout } from "@/components/PublicPageLayout";
import {
  GenericPageSkeleton,
} from "@/components/skeletons/PageSkeletons";
/* =========================
   Critical / always-needed (keep static)
========================= */
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";

// ── Internal ops — unlinked, not in sitemap, no auth wrapper ─────────────────
const OpsConsole = React.lazy(() => import("@/pages/OpsConsole"));

/* =========================
   Core Pages — lazy
========================= */
const About             = React.lazy(() => import("@/pages/About"));
const Contact           = React.lazy(() => import("@/pages/Contact"));
const CreatePassword    = React.lazy(() => import("@/pages/CreatePassword"));
const ForgotPassword    = React.lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword     = React.lazy(() => import("@/pages/ResetPassword"));

/* =========================
   Policies — lazy
========================= */
const Policies          = React.lazy(() => import("@/pages/policies/Policies"));
const PrivacyPolicy     = React.lazy(() => import("@/pages/policies/PrivacyPolicy"));
const RefundPolicy      = React.lazy(() => import("@/pages/policies/RefundPolicy"));
const SecurityPolicy    = React.lazy(() => import("@/pages/policies/SecurityPolicy"));
const TermsConditions   = React.lazy(() => import("@/pages/policies/TermsConditions"));
const UserConductPolicy = React.lazy(() => import("@/pages/policies/UserConductPolicy"));
const DeleteData       = React.lazy(() => import("@/pages/policies/DeleteData"));

/* =========================
   Suspense helpers
========================= */
function S({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

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
      <Route path="/create-password" element={<S fallback={Generic}><CreatePassword /></S>} />
      <Route path="/forgot-password" element={<S fallback={Generic}><ForgotPassword /></S>} />
      <Route path="/reset-password" element={<S fallback={Generic}><ResetPassword /></S>} />

      <Route element={<LandingLayout />}>
        <Route path="/" element={<Index />} />
      </Route>

      {/* ── Public / legal pages — clean layout, no sidebar ──────────────── */}
      <Route element={<PublicPageLayout />}>
        <Route path="/about" element={<S fallback={Generic}><About /></S>} />
        <Route path="/contact" element={<S fallback={Generic}><Contact /></S>} />
        <Route path="/policies" element={<S fallback={Generic}><Policies /></S>} />
        <Route path="/privacy-policy" element={<S fallback={Generic}><PrivacyPolicy /></S>} />
        <Route path="/terms-conditions" element={<S fallback={Generic}><TermsConditions /></S>} />
        <Route path="/refund-policy" element={<S fallback={Generic}><RefundPolicy /></S>} />
        <Route path="/security-policy" element={<S fallback={Generic}><SecurityPolicy /></S>} />
        <Route path="/user-conduct-policy" element={<S fallback={Generic}><UserConductPolicy /></S>} />
        <Route path="/delete-data" element={<S fallback={Generic}><DeleteData /></S>} />
      </Route>

      {/* ── SEO-ONLY ROUTES: player/team/position pages kept for deindexing crawl */}
      <Route path="/sports/afl/players/:slug" element={<Navigate to="/" replace />} />
      <Route path="/sports/afl/teams/:team" element={<Navigate to="/" replace />} />
      <Route path="/sports/afl/positions/:position" element={<Navigate to="/" replace />} />

      {/* ── Deprecated checkout routes — redirect to landing */}
      <Route path="/account" element={<Navigate to="/" replace />} />
      <Route path="/checkout" element={<Navigate to="/" replace />} />
      <Route path="/success" element={<Navigate to="/" replace />} />
      <Route path="/cancel" element={<Navigate to="/" replace />} />
      <Route path="/admin/*" element={<Navigate to="/" replace />} />

      {/* ── Internal ops console — unlinked, not in sitemap ── */}
      <Route
        path="/ops-r7x2k4"
        element={
          <React.Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <OpsConsole />
          </React.Suspense>
        }
      />

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
