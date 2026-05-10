import { lazy, Suspense } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { RefreshCw, Shield } from "lucide-react";
import { AdminUIStateProvider, useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { ADMIN_SECTIONS, ADMIN_DEFAULT_PATH } from "@/features/admin/config/adminSections";

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function GlobalJobBar() {
  const { state } = useAdminUIState();
  if (!state.activeJobType) return null;
  return (
    <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2.5 flex items-center gap-3">
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-amber-300 truncate">{state.activeJobLabel ?? "Job running…"}</span>
          <span className="text-[11px] text-amber-500 ml-2 shrink-0 tabular-nums">{state.activeJobPct}%</span>
        </div>
        <div className="h-1 bg-amber-900/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-amber-500"
            style={{ width: `${state.activeJobPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function AdminShell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-4 h-14">
            <button
              onClick={() => navigate(ADMIN_DEFAULT_PATH)}
              className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
            >
              <Shield className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold tracking-tight">Operator Console</span>
            </button>

            <div className="h-4 w-px bg-border" />

            <nav
              className="flex items-center gap-0 overflow-x-auto flex-1"
              style={{ scrollbarWidth: "none" }}
            >
              {ADMIN_SECTIONS.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors mr-0.5 ${
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="shrink-0 text-[11px] text-muted-foreground hidden sm:block">{user?.email}</div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-6">
        <GlobalJobBar />
        <Suspense fallback={<TabLoadingFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

function AdminShellWithProvider() {
  return (
    <AdminUIStateProvider>
      <AdminShell />
    </AdminUIStateProvider>
  );
}

export const AdminDashboardPage    = lazy(() => import("@/features/admin/pages/AdminDashboard"));
export const AdminHealthPage       = lazy(() => import("@/features/admin/pages/AdminHealth"));
export const AdminUserMetricsPage  = lazy(() => import("@/features/admin/pages/AdminAnalytics"));
export const AdminCommandPage      = lazy(() => import("@/features/admin/pages/AdminNewCommandCenter"));
export const AdminContentIntelPage = lazy(() => import("@/features/admin/pages/AdminContentIntel"));
export const AdminPlayerLabPage    = lazy(() => import("@/features/admin/pages/AdminPlayerLab"));
export const AdminMarketingPage    = lazy(() => import("@/features/admin/pages/AdminMarketing"));
export const AdminInternalOpsPage  = lazy(() => import("@/features/admin/pages/AdminAdminHub"));

export { AdminShellWithProvider as AdminShell };
export default AdminShellWithProvider;

export { Navigate };
