import { Link, useLocation } from "react-router-dom";
import { Crown, TableProperties, Star, Users, Shield, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDesktopSidebar } from "@/components/DesktopSidebar";

const NAV_LINKS = [
  { label: "Stat Board",  to: "/stat-board",          icon: TableProperties },
  { label: "Fantasy Hub", to: "/fantasy",             icon: Star            },
  { label: "Players",     to: "/sports/afl/players",  icon: Users           },
  { label: "Teams",       to: "/sports/afl/teams",    icon: Shield          },
];

/**
 * Shared desktop-only header (≥ 1024px).
 * Hidden below lg — mobile rendering is handled by MobileShell (app pages)
 * or the LandingLayout hamburger drawer (landing page).
 */
export function DesktopHeader({ hideBurger = false }: { hideBurger?: boolean }) {
  const { user, isPremium, signOut } = useAuth();
  const location = useLocation();
  const { toggle } = useDesktopSidebar();

  return (
    <header
      className="hidden lg:flex"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 100,
        height: 60,
        alignItems: "center",
        background: "rgba(8,10,14,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px 0 12px",
        gap: 0,
      }}
    >
      {/* LEFT — Burger + Logo */}
      {!hideBurger && (
        <button
          onClick={toggle}
          aria-label="Open sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 7,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.50)",
            cursor: "pointer",
            flexShrink: 0,
            marginRight: 6,
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.50)";
          }}
        >
          <Menu size={18} />
        </button>
      )}

      <Link
        to="/"
        style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
      >
        <img
          src="/logo.png"
          alt="Neeko Sports"
          style={{ width: 140, height: "auto", objectFit: "contain", display: "block" }}
        />
      </Link>

      {/* CENTER — Nav links */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {NAV_LINKS.map(({ label, to, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12.5, fontWeight: active ? 700 : 500,
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

      {/* RIGHT — Auth / CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
        {!user && (
          <Link
            to="/auth"
            style={{
              fontSize: 13, fontWeight: 600,
              color: "rgba(255,255,255,0.80)",
              textDecoration: "none",
              padding: "7px 16px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Sign In
          </Link>
        )}

        {user && (
          <button
            onClick={signOut}
            style={{
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.35)",
              background: "none", border: "none",
              cursor: "pointer", padding: "7px 10px",
              whiteSpace: "nowrap",
            }}
          >
            Logout
          </button>
        )}

        {isPremium ? (
          <Link
            to="/account"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700,
              color: "#facc15",
              textDecoration: "none",
              border: "1px solid rgba(250,204,21,0.35)",
              padding: "7px 16px",
              borderRadius: 7,
              whiteSpace: "nowrap",
            }}
          >
            <Crown size={12} /> Account
          </Link>
        ) : location.pathname !== "/neeko-plus" ? (
          <Link
            to="/neeko-plus"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 800,
              color: "#130c00",
              textDecoration: "none",
              background: "linear-gradient(160deg, #fad52a 0%, #e8a800 100%)",
              padding: "7px 16px",
              borderRadius: 7,
              letterSpacing: "0.01em",
              boxShadow: "0 2px 10px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.30)",
              whiteSpace: "nowrap",
            }}
          >
            <Crown size={12} /> Neeko+
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export default DesktopHeader;
