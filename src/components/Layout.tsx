import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileShell } from "@/components/MobileShell";
import { DesktopHeader } from "@/components/DesktopHeader";
import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <SidebarProvider defaultOpen={false}>
      {/* Mobile shell — only visible below lg breakpoint */}
      <div className="lg:hidden">
        <MobileShell />
      </div>

      {/* Desktop header — only visible at lg and above */}
      <DesktopHeader />

      <div className="min-h-screen w-full bg-background flex">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden lg:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col">
          {/* BODY — desktop: offset 60px fixed header; mobile: offset 102px mobile shell */}
          <main className="flex-1 overflow-auto pt-[102px] lg:pt-[60px]">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Layout;
