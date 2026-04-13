import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Crown, Menu, X, TrendingUp, ChartBar as BarChart2, Star, Award, Users } from "lucide-react";

const NAV_LINKS = [
  { label: "Current Week", to: "/sports/afl/current-round", icon: <TrendingUp size={14} /> },
  { label: "Market Watch", to: "/sports/afl/market-watch", icon: <BarChart2 size={14} /> },
  { label: "Captains", to: "/sports/afl/captains", icon: <Star size={14} /> },
  { label: "Rankings", to: "/sports/afl/rankings", icon: <Award size={14} /> },
  { label: "Players", to: "/sports/afl/players", icon: <Users size={14} /> },
];

export function LandingLayout() {
  const { user, isPremium, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0a0a0a" }}>

      {/* ── STICKY HEADER ──────────────────────────────────────────────── */}
      <header style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 100,
        height: 60,
        background: "rgba(8,10,14,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 0,
      }}>

        {/* LEFT — Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <img src="/logo.png" alt="Neeko" style={{ height: 80, width: "auto" }} />
        </Link>

        {/* CENTER — Nav links (desktop) */}
        <nav style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          margin: "0 auto",
        }}>
          {NAV_LINKS.map(link => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
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
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.88)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.58)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }
                }}
              >
                <span style={{ opacity: 0.7 }}>{link.icon}</span>
                <span className="nav-label">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* RIGHT — Auth buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!user && (
            <Link to="/auth" style={{
              fontSize: 13, fontWeight: 600,
              color: "rgba(255,255,255,0.80)",
              textDecoration: "none",
              padding: "7px 16px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              display: "none",
            }}
              className="sign-in-btn"
            >
              Sign In
            </Link>
          )}

          {!isPremium && (
            <Link to="/neeko-plus" style={{
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
            }}>
              <Crown size={12} /> Neeko+
            </Link>
          )}

          {isPremium && (
            <Link to="/account" style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700,
              color: "#facc15",
              textDecoration: "none",
              border: "1px solid rgba(250,204,21,0.35)",
              padding: "7px 16px",
              borderRadius: 7,
              whiteSpace: "nowrap",
            }}>
              <Crown size={12} /> Account
            </Link>
          )}

          {user && (
            <button onClick={signOut} style={{
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.35)",
              background: "none", border: "none",
              cursor: "pointer", padding: "7px 10px",
              display: "none",
            }}
              className="logout-btn"
            >
              Logout
            </button>
          )}

          {/* Hamburger (mobile) */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              display: "none",
              alignItems: "center", justifyContent: "center",
              width: 36, height: 36,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7,
              cursor: "pointer",
              color: "rgba(255,255,255,0.80)",
            }}
            className="hamburger-btn"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* ── MOBILE DRAWER ──────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 98,
            background: "rgba(0,0,0,0.55)",
          }}
        />
      )}
      <div style={{
        position: "fixed",
        top: 60, right: 0,
        width: 240,
        background: "#0e1116",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "0 0 0 12px",
        zIndex: 99,
        padding: "12px 0 20px",
        transform: menuOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        display: "none",
      }}
        className="mobile-drawer"
      >
        {NAV_LINKS.map(link => (
          <Link
            key={link.to}
            to={link.to}
            onClick={() => setMenuOpen(false)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 14, fontWeight: 600,
              color: location.pathname === link.to ? "#fff" : "rgba(255,255,255,0.65)",
              textDecoration: "none",
              padding: "11px 20px",
              borderLeft: location.pathname === link.to ? "2px solid #facc15" : "2px solid transparent",
              background: location.pathname === link.to ? "rgba(255,255,255,0.05)" : "transparent",
            }}
          >
            {link.icon} {link.label}
          </Link>
        ))}
        <div style={{ margin: "12px 16px 0", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {!user && (
            <Link to="/auth" onClick={() => setMenuOpen(false)} style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)", textDecoration: "none", padding: "8px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", textAlign: "center" }}>
              Sign In
            </Link>
          )}
          {!isPremium && (
            <Link to="/neeko-plus" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#130c00", textDecoration: "none", background: "linear-gradient(160deg, #fad52a, #e8a800)", padding: "9px 12px", borderRadius: 7 }}>
              <Crown size={13} /> Get Neeko+
            </Link>
          )}
          {user && (
            <button onClick={() => { signOut(); setMenuOpen(false); }} style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: "8px 12px", textAlign: "left" }}>
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── PAGE CONTENT ───────────────────────────────────────────────── */}
      <div style={{ paddingTop: 60 }}>
        <Outlet />
      </div>

      {/* ── RESPONSIVE STYLES ──────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 900px) {
          nav { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .mobile-drawer { display: block !important; }
        }
        @media (min-width: 901px) {
          .sign-in-btn { display: flex !important; }
          .logout-btn { display: block !important; }
          nav { display: flex !important; }
        }
        @media (max-width: 680px) {
          .nav-label { display: none; }
        }
      `}</style>
    </div>
  );
}

export default LandingLayout;
