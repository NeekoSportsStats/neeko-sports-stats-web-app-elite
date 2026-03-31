import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

// Layout
import ErrorBoundary from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { MinimalLayout } from "@/components/MinimalLayout";

// Auth
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";

// Pages
import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import CreatePassword from "@/pages/CreatePassword";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Account from "@/pages/Account";
import Dashboard from "@/pages/Dashboard";
import Billing from "@/pages/Billing";
import NeekoPlusPurchase from "@/pages/NeekoPlusPurchase";
import StartCheckout from "@/pages/StartCheckout";
import Success from "@/pages/Success";
import Cancel from "@/pages/Cancel";

// AFL Pages
import AFLRankingsPage from "@/features/afl/rankings/AFLRankingsPage";
import AFLRoundEdgeBoard from "@/features/afl/edge/AFLRoundEdgeBoard";
import StartSitPage from "@/features/afl/start-sit/StartSitPage";
import MarketWatchPage from "@/features/afl/market-watch/MarketWatchPage";

// Admin
import Admin from "@/pages/Admin";
import AdminQueue from "@/pages/AdminQueue";
import DataPipelineStatusPage from "@/features/admin/DataPipelineStatusPage";
import PipelineHistory from "@/pages/PipelineHistory";

// Admin Pages
import AdminDashboard from "@/features/admin/pages/AdminDashboard";
import AdminHealth from "@/features/admin/pages/AdminHealth";
import AdminAnalytics from "@/features/admin/pages/AdminAnalytics";
import AdminPlayerLab from "@/features/admin/pages/AdminPlayerLab";
import AdminContentEngine from "@/features/admin/pages/AdminContentEngine";
import AdminMarketing from "@/features/admin/pages/AdminMarketing";
import AdminFounderTasks from "@/features/admin/pages/AdminFounderTasks";
import AdminNewCommandCenter from "@/features/admin/pages/AdminNewCommandCenter";

// Info Pages
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import FAQ from "@/pages/FAQ";
import Socials from "@/pages/Socials";

// Policy Pages
import Policies from "@/pages/policies/Policies";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Cookies from "@/pages/Cookies";

// 404
import NotFound from "@/pages/NotFound";

// Configure QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Helmet>
                <title>Neeko Sports Stats — AI AFL Fantasy Projections</title>
                <meta
                  name="description"
                  content="AI-powered AFL Fantasy projections, rankings, trade targets and Start/Sit analysis built to give fantasy coaches an edge."
                />
              </Helmet>

              <Routes>
                {/* PUBLIC ROUTES - NO LAYOUT */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/create-password" element={<CreatePassword />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* CHECKOUT ROUTES - MINIMAL LAYOUT */}
                <Route element={<MinimalLayout />}>
                  <Route path="/start-checkout" element={<StartCheckout />} />
                  <Route path="/success" element={<Success />} />
                  <Route path="/cancel" element={<Cancel />} />
                </Route>

                {/* MAIN APP ROUTES - WITH LAYOUT */}
                <Route element={<Layout />}>
                  {/* HOME */}
                  <Route path="/" element={<Index />} />

                  {/* SPORTS - AFL */}
                  <Route path="/sports/afl" element={<Navigate to="/sports/afl/rankings" replace />} />
                  <Route path="/sports/afl/rankings" element={<AFLRankingsPage />} />
                  <Route path="/sports/afl/edge-board" element={<AFLRoundEdgeBoard />} />
                  <Route path="/sports/afl/start-sit" element={<StartSitPage />} />
                  <Route path="/sports/afl/market-watch" element={<MarketWatchPage />} />

                  {/* LEGACY AFL REDIRECTS */}
                  <Route path="/afl/*" element={<Navigate to="/sports/afl/rankings" replace />} />

                  {/* ACCOUNT & PREMIUM */}
                  <Route path="/neeko-plus" element={<NeekoPlusPurchase />} />
                  <Route
                    path="/account"
                    element={
                      <RequireAuth>
                        <Account />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <RequireAuth>
                        <Dashboard />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/billing"
                    element={
                      <RequireAuth>
                        <Billing />
                      </RequireAuth>
                    }
                  />

                  {/* ADMIN */}
                  <Route
                    path="/admin"
                    element={
                      <RequireAdmin>
                        <Admin />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/queue"
                    element={
                      <RequireAdmin>
                        <AdminQueue />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/pipeline"
                    element={
                      <RequireAdmin>
                        <DataPipelineStatusPage />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/pipeline-history"
                    element={
                      <RequireAdmin>
                        <PipelineHistory />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/dashboard"
                    element={
                      <RequireAdmin>
                        <AdminDashboard />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/health"
                    element={
                      <RequireAdmin>
                        <AdminHealth />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/analytics"
                    element={
                      <RequireAdmin>
                        <AdminAnalytics />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/player-lab"
                    element={
                      <RequireAdmin>
                        <AdminPlayerLab />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/content"
                    element={
                      <RequireAdmin>
                        <AdminContentEngine />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/marketing"
                    element={
                      <RequireAdmin>
                        <AdminMarketing />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/tasks"
                    element={
                      <RequireAdmin>
                        <AdminFounderTasks />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/command"
                    element={
                      <RequireAdmin>
                        <AdminNewCommandCenter />
                      </RequireAdmin>
                    }
                  />

                  {/* INFO PAGES */}
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/socials" element={<Socials />} />

                  {/* POLICY PAGES */}
                  <Route path="/policies" element={<Policies />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/cookies" element={<Cookies />} />

                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>

              <Toaster />
              <Sonner />
            </BrowserRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
