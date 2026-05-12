import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Crown, LogOut, Star, Users, TableProperties, Shield } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { label: "Stat Board",  to: "/stat-board",           icon: TableProperties },
  { label: "Fantasy Hub", to: "/fantasy",              icon: Star            },
  { label: "Players",     to: "/sports/afl/players",   icon: Users           },
  { label: "Teams",       to: "/sports/afl/teams",     icon: Shield          },
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

            {/* ── Mobile header (< lg) — burger left · logo centre · action right ── */}
            <div className="flex lg:hidden h-[60px] items-center px-3 relative">

              {/* LEFT — sidebar burger */}
              <SidebarTrigger className="h-[34px] w-[34px] border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.10] rounded-lg shrink-0" />

              {/* CENTRE — logo, absolutely positioned so it's truly centred */}
              <Link
                to="/"
                className="absolute left-1/2 -translate-x-1/2 flex items-center hover:opacity-80 transition"
                style={{ textDecoration: "none" }}
              >
                <img
                  src="/logo.png"
                  alt="Neeko Sports Logo"
                  style={{ width: 90, height: "auto", objectFit: "contain", display: "block" }}
                />
              </Link>

              {/* RIGHT — Neeko+ or crown */}
              <div className="ml-auto shrink-0">
                {isPremium ? (
                  <Link to="/account" style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 700,
                    color: "#facc15",
                    textDecoration: "none",
                    border: "1px solid rgba(250,204,21,0.30)",
                    padding: "6px 11px",
                    borderRadius: 7,
                    whiteSpace: "nowrap",
                  }}>
                    <Crown size={12} />
                    <span>Account</span>
                  </Link>
                ) : location.pathname !== "/neeko-plus" ? (
                  <Link to="/neeko-plus" style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 800,
                    color: "#130c00",
                    textDecoration: "none",
                    background: "linear-gradient(160deg,#fad52a 0%,#e8a800 100%)",
                    padding: "6px 11px",
                    borderRadius: 7,
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }}>
                    <Crown size={12} />
                    <span>Neeko+</span>
                  </Link>
                ) : null}
              </div>
            </div>

            {/* ── Desktop header (≥ lg) — unchanged ── */}
            <div className="hidden lg:flex h-[60px] items-center px-6 gap-0">

              {/* LOGO */}
              <Link to="/" className="flex items-center hover:opacity-80 transition shrink-0">
                <img
                  src="/logo.png"
                  alt="Neeko Sports Logo"
                  className="h-9 w-auto object-contain"
                />
              </Link>

              {/* CENTER NAV */}
              <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
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
              <div className="flex items-center gap-2 ml-auto shrink-0">
                {!user && (
                  <Link to="/auth">
                    <Button variant="outline" size="sm">Sign In</Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </Button>
                )}
                {isPremium ? (
                  <Link to="/account">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Crown className="h-4 w-4 text-[#facc15]" />
                      <span className="text-[#facc15]">Account</span>
                    </Button>
                  </Link>
                ) : location.pathname !== "/neeko-plus" ? (
                  <Link to="/neeko-plus">
                    <Button
                      size="sm"
                      className="gap-1.5 font-extrabold text-[#130c00]"
                      style={{ background: "linear-gradient(160deg,#fad52a 0%,#e8a800 100%)", border: "none" }}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      Neeko+
                    </Button>
                  </Link>
                ) : null}
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
