import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Crown, Menu, X, TableProperties, Star, Users, Shield } from "lucide-react";

const NAV_LINKS = [
  { label: "Stat Board",  to: "/stat-board",          icon: TableProperties },
  { label: "Fantasy Hub", to: "/fantasy",             icon: Star            },
  { label: "Players",     to: "/sports/afl/players",  icon: Users           },
  { label: "Teams",       to: "/sports/afl/teams",    icon: Shield          },
];

export function LandingLayout() {
  const { user, isPremium, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0a0a0a" }}>

      {/* ── STICKY HEADER ──────────────────────────────────────────────── */}
      <header className="landing-layout-header" style={{
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
        padding: "0 16px 0 8px",
        gap: 0,
      }}>

        {/* LEFT — Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <img src="/logo.png" alt="Neeko" style={{ height: 40, width: "auto" }} />
        </Link>

        {/* CENTER — Nav links — matches Layout.tsx exactly */}
        <nav className="landing-nav" style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}>
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
                <Icon size={13} style={{ opacity: 0.7 }} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* RIGHT — Auth buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          {!user && (
            <Link to="/auth" className="landing-sign-in" style={{
              fontSize: 13, fontWeight: 600,
              color: "rgba(255,255,255,0.80)",
              textDecoration: "none",
              padding: "7px 16px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}>
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
            <button onClick={signOut} className="landing-logout" style={{
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.35)",
              background: "none", border: "none",
              cursor: "pointer", padding: "7px 10px",
            }}>
              Logout
            </button>
          )}

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="landing-hamburger"
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
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* ── MOBILE OVERLAY ─────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 98,
            background: "rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* ── MOBILE DRAWER ──────────────────────────────────────────────── */}
      <div
        className="landing-drawer"
        style={{
          position: "fixed",
          top: 60, left: 0,
          width: 240,
          background: "#0e1116",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "0 0 12px 0",
          zIndex: 99,
          padding: "12px 0 20px",
          transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          display: "none",
        }}
      >
        {NAV_LINKS.map(({ label, to, icon: Icon }) => {
          const mobileActive = location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 14, fontWeight: 600,
                color: mobileActive ? "#fff" : "rgba(255,255,255,0.65)",
                textDecoration: "none",
                padding: "11px 20px",
                borderLeft: mobileActive ? "2px solid #facc15" : "2px solid transparent",
                background: mobileActive ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              <Icon size={15} style={{ opacity: 0.7 }} /> {label}
            </Link>
          );
        })}

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
          {isPremium && (
            <Link to="/account" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#facc15", textDecoration: "none", border: "1px solid rgba(250,204,21,0.25)", padding: "9px 12px", borderRadius: 7 }}>
              <Crown size={13} /> Account
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
      <div className="landing-layout-content" style={{ paddingTop: 60 }}>
        <Outlet />
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer style={{
        background: "#060708",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "22px clamp(16px, 4vw, 32px)",
      }}>
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
            © {new Date().getFullYear()} Neeko Sports Stats
          </p>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
            {[
              { label: "Policies", to: "/policies" },
              { label: "Contact",  to: "/contact"  },
              { label: "About",    to: "/about"     },
              { label: "FAQ",      to: "/faq"       },
            ].map(link => (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.32)",
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.80)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)"; }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* ── RESPONSIVE STYLES ──────────────────────────────────────────── */}
      <style>{`
        /* Hide layout header on mobile where MobileLanding renders its own */
        @media (max-width: 767px) {
          .landing-layout-header { display: none !important; }
          .landing-layout-content { padding-top: 0 !important; }
        }
        /* Hide sign-in and logout below 1024px (hamburger drawer handles auth actions) */
        .landing-sign-in { display: none; }
        .landing-logout { display: none; }
        /* Match Layout.tsx: hide nav below 1024px (lg), show hamburger */
        @media (max-width: 1023px) {
          .landing-nav { display: none !important; }
          .landing-hamburger { display: flex !important; }
          .landing-drawer { display: block !important; }
        }
        @media (min-width: 1024px) {
          .landing-sign-in { display: flex !important; }
          .landing-logout { display: block !important; }
        }
        @media (max-width: 600px) {
          footer > div {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          footer nav { justify-content: center !important; }
        }
      `}</style>
    </div>
  );
}

export default LandingLayout;
