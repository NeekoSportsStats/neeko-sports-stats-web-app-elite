import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileShell } from "@/components/MobileShell";
import { DesktopHeader } from "@/components/DesktopHeader";
import { DesktopSidebar, DESKTOP_SIDEBAR_WIDTH } from "@/components/DesktopSidebar";
import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <SidebarProvider defaultOpen={false}>
      {/* ── Mobile shell (< lg / 1024px) — unchanged ─────────────────────── */}
      <div className="lg:hidden">
        <MobileShell />
        {/* AppSidebar provides the drawer used by MobileShell's burger trigger */}
        <AppSidebar />
      </div>

      {/* ── Desktop header (≥ lg) ─────────────────────────────────────────── */}
      <DesktopHeader />

      {/* ── Desktop sidebar (≥ lg) ────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <DesktopSidebar />
      </div>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      {/*   Mobile (< lg):  full width, 102px top padding for mobile shell     */}
      {/*   Desktop (≥ lg): left margin = sidebar width, 60px top for header   */}
      <main className="min-h-screen bg-background overflow-auto pt-[102px] lg:pt-[60px] lg:ml-[220px]">
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

export default Layout;
