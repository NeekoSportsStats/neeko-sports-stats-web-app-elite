import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileShell } from "@/components/MobileShell";
import { DesktopHeader } from "@/components/DesktopHeader";
import { DesktopSidebar, DesktopSidebarProvider } from "@/components/DesktopSidebar";
import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <DesktopSidebarProvider>
      {/* ── Mobile shell (< lg / 1024px) ─────────────────────────────────── */}
      {/* Rendered outside SidebarProvider so it never participates in the   */}
      {/* flex row that SidebarProvider creates, eliminating the right-side   */}
      {/* dead column bug on mobile.                                          */}
      <div className="lg:hidden">
        <MobileShell />
        {/* AppSidebar: on mobile renders a Sheet (portal) — zero layout width */}
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
        </SidebarProvider>
      </div>

      {/* ── Desktop layout (≥ lg) ─────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <DesktopHeader />
        <DesktopSidebar />
      </div>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      {/*   Mobile (< lg):  full viewport width, 102px top padding            */}
      {/*   Desktop (≥ lg): full width minus no sidebar reservation            */}
      <main
        className="min-h-screen bg-background overflow-auto pt-[102px] lg:pt-[60px]"
        style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
      >
        <Outlet />
      </main>
    </DesktopSidebarProvider>
  );
}

export default Layout;
