import { lazy, Suspense } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { RefreshCw, Shield, Dot } from "lucide-react";
import { AdminUIStateProvider, useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { ADMIN_SECTIONS, ADMIN_DEFAULT_PATH } from "@/features/admin/config/adminSections";

function TabLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground/40 tracking-wide uppercase">Loading</p>
    </div>
  );
}

function GlobalJobBar() {
  const { state } = useAdminUIState();
  if (!state.activeJobType) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-500/25 bg-amber-950/15 px-4 py-3 flex items-center gap-3">
      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-amber-950/50 border border-amber-500/30">
        <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-amber-300 truncate">{state.activeJobLabel ?? "Job running…"}</span>
          <span className="text-[11px] text-amber-500/80 ml-2 shrink-0 tabular-nums font-mono">{state.activeJobPct}%</span>
        </div>
        <div className="h-1 bg-amber-950/60 rounded-full overflow-hidden border border-amber-900/40">
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
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-20 shadow-[0_1px_0_0_rgba(255,255,255,0.03)]">
        <div className="container mx-auto max-w-[1400px] px-4 sm:px-6">
          <div className="flex items-center gap-0 h-12">

            {/* Brand */}
            <button
              onClick={() => navigate(ADMIN_DEFAULT_PATH)}
              className="flex items-center gap-2 shrink-0 pr-4 mr-1 hover:opacity-75 transition-opacity group"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded bg-foreground/90 group-hover:bg-foreground transition-colors">
                <Shield className="h-3.5 w-3.5 text-background" />
              </div>
              <span className="text-[13px] font-bold tracking-tight text-foreground hidden sm:block">
                Neeko <span className="text-muted-foreground font-medium">Ops</span>
              </span>
            </button>

            <div className="h-4 w-px bg-border/50 mx-3 shrink-0" />

            {/* Nav */}
            <nav
              className="flex items-center gap-0.5 overflow-x-auto flex-1 -mx-1 px-1"
              style={{ scrollbarWidth: "none" }}
            >
              {ADMIN_SECTIONS.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-foreground/10 text-foreground ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-3.5 w-3.5 shrink-0 transition-colors ${isActive ? "text-foreground" : "text-muted-foreground/70"}`} />
                      {label}
                      {isActive && (
                        <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t bg-foreground/40" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* User email */}
            {user?.email && (
              <>
                <div className="h-4 w-px bg-border/50 mx-3 shrink-0 hidden sm:block" />
                <div className="shrink-0 hidden sm:flex items-center gap-1.5">
                  <Dot className="h-3 w-3 text-emerald-500" />
                  <span className="text-[11px] text-muted-foreground/70 font-mono truncate max-w-[160px]">{user.email}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="container mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
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
