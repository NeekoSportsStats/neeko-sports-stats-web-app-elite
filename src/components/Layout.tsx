import { MobileShell } from "@/components/MobileShell";
import { DesktopHeader } from "@/components/DesktopHeader";
import { DesktopSidebar, DesktopSidebarProvider } from "@/components/DesktopSidebar";
import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <DesktopSidebarProvider>
      {/* ── Mobile shell (< lg / 1024px) ─────────────────────────────────── */}
      {/* position:fixed — no document flow impact, zero height in layout     */}
      <div className="lg:hidden">
        <MobileShell />
      </div>

      {/* ── Desktop chrome (≥ lg) — position:fixed, no layout height ─────── */}
      <div className="hidden lg:block">
        <DesktopHeader />
        <DesktopSidebar />
      </div>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      {/*   Mobile (< lg):  pt-[102px] clears the fixed double-row header     */}
      {/*   Desktop (≥ lg): pt-[60px]  clears the fixed desktop header        */}
      <main
        className="min-h-screen bg-background pt-[102px] lg:pt-[60px]"
        style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
      >
        <Outlet />
      </main>
    </DesktopSidebarProvider>
  );
}

export default Layout;
