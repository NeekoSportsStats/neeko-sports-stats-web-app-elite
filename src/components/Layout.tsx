import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Crown, LogOut, Star, Users, TableProperties } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { label: "Stat Board",  to: "/stat-board",           icon: TableProperties },
  { label: "Fantasy Hub", to: "/fantasy",              icon: Star      },
  { label: "Players",     to: "/sports/afl/players",   icon: Users     },
];

export function Layout() {
  const { user, isPremium, signOut } = useAuth();
  const location = useLocation();

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen w-full bg-background flex">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          {/* HEADER */}
          <header className="fixed top-0 left-0 right-0 z-40 w-full border-b border-white/[0.07] bg-[rgba(8,10,14,0.82)] backdrop-blur-[12px]">
            <div className="flex h-[60px] items-center px-4 sm:px-6 gap-0">

              {/* Sidebar trigger — mobile only */}
              <SidebarTrigger className="mr-2 h-8 w-8 border border-white/10 bg-white/5 hover:bg-white/10" />

              {/* LOGO */}
              <Link to="/" className="flex items-center hover:opacity-80 transition shrink-0">
                <img
                  src="/logo.png"
                  alt="Neeko Sports Logo"
                  className="h-[5rem] w-auto -my-3"
                />
              </Link>

              {/* CENTER NAV — desktop only, hidden on mobile (sidebar handles it) */}
              <nav className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
                {NAV_LINKS.map(({ label, to, icon: Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return (
                    <Link
                      key={to}
                      to={to}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 500,
                        color: active ? "#fff" : "rgba(255,255,255,0.58)",
                        textDecoration: "none",
                        padding: "6px 11px",
                        borderRadius: 7,
                        background: active ? "rgba(255,255,255,0.08)" : "transparent",
                        border: active ? "1px solid rgba(255,255,255,0.10)" : "1px solid transparent",
                        transition: "all 0.15s ease",
                        whiteSpace: "nowrap",
                        letterSpacing: "0.01em",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.88)";
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.58)";
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }
                      }}
                    >
                      <Icon size={13} style={{ opacity: 0.7 }} />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              {/* RIGHT BUTTONS */}
              <div className="flex items-center gap-1.5 lg:gap-2 ml-auto shrink-0">
                {isPremium ? (
                  <Link to="/account">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Crown className="h-4 w-4 text-[#facc15]" />
                      <span className="hidden sm:inline text-[#facc15]">Account</span>
                    </Button>
                  </Link>
                ) : (
                  <Link to="/neeko-plus">
                    <Button
                      size="sm"
                      className="gap-1.5 font-extrabold text-[#130c00]"
                      style={{ background: "linear-gradient(160deg,#fad52a 0%,#e8a800 100%)", border: "none" }}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Neeko+</span>
                    </Button>
                  </Link>
                )}

                {user ? (
                  <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 hidden sm:flex">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                ) : (
                  <Link to="/auth">
                    <Button variant="default" size="sm">
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </header>

          {/* BODY — pt-[60px] offsets the fixed header */}
          <main className="flex-1 overflow-auto pt-[60px]">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Layout;
