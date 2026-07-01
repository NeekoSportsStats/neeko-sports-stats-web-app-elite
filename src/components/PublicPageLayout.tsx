import { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";

const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";
const GOLD = "#E0AE2D";

export function PublicPageLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function close() { setMenuOpen(false); }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const FOOTER_LINKS = [
    { label: "Privacy Policy", to: "/privacy-policy"  },
    { label: "Terms",          to: "/terms-conditions" },
    { label: "Refund Policy",  to: "/refund-policy"   },
    { label: "Contact",        to: "/contact"         },
    { label: "About",          to: "/about"           },
  ];

  return (
    <div style={{ background: "#07090C", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 200,
        height: scrolled ? 54 : 64,
        display: "flex",
        alignItems: "center",
        padding: "0 clamp(16px, 4vw, 40px)",
        background: scrolled ? "rgba(7,9,12,0.94)" : "rgba(7,9,12,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.09)" : "1px solid transparent",
        gap: 0,
        transition: "height 0.22s ease, background 0.22s ease, border-color 0.22s ease",
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }} onClick={close}>
          <img src="/logo.png" alt="Neeko Stats" style={{ height: 28, width: "auto", objectFit: "contain", display: "block" }} />
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="ppl-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 800,
              color: "#07090C",
              textDecoration: "none",
              background: `linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%)`,
              padding: "7px 16px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(224,174,45,0.28)",
              letterSpacing: "0.01em",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span className="ppl-cta-text">Download</span>
          </a>

          {/* Hamburger — mobile only */}
          <button
            className="ppl-burger"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            style={{
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              background: menuOpen ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              cursor: "pointer",
              color: "rgba(255,255,255,0.80)",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* ── MOBILE OVERLAY ──────────────────────────────────────────────────── */}
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 198,
          background: "rgba(0,0,0,0.55)",
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition: "opacity 0.20s ease",
        }}
      />

      {/* ── MOBILE DRAWER ───────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed",
        top: scrolled ? 54 : 64,
        left: 0,
        width: "88%",
        maxWidth: 320,
        background: "rgba(10,13,18,0.98)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderTop: "none",
        borderRadius: "0 0 14px 0",
        zIndex: 199,
        padding: "6px 0 20px",
        transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1), top 0.22s ease",
        boxShadow: menuOpen ? "4px 8px 32px rgba(0,0,0,0.50)" : "none",
      }}
        className="ppl-drawer"
      >
        {[
          { label: "Home",           to: "/"               },
          { label: "Privacy Policy", to: "/privacy-policy" },
          { label: "Terms",          to: "/terms-conditions"},
          { label: "Refund Policy",  to: "/refund-policy"  },
          { label: "Contact",        to: "/contact"        },
          { label: "About",          to: "/about"          },
        ].map(({ label, to }) => (
          <Link
            key={to}
            to={to}
            onClick={close}
            style={{
              display: "block",
              fontSize: 15,
              fontWeight: 600,
              color: "rgba(255,255,255,0.72)",
              textDecoration: "none",
              padding: "13px 22px",
            }}
          >
            {label}
          </Link>
        ))}
        <div style={{ margin: "10px 16px 0", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 800,
              color: "#07090C",
              textDecoration: "none",
              background: `linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%)`,
              padding: "13px 16px",
              borderRadius: 10,
              width: "100%",
              boxSizing: "border-box",
              boxShadow: "0 4px 16px rgba(224,174,45,0.25)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        </div>
      </div>

      {/* ── PAGE CONTENT ────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        paddingTop: scrolled ? 54 : 64,
        transition: "padding-top 0.22s ease",
        color: "rgba(255,255,255,0.85)",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "clamp(32px, 5vw, 64px) clamp(20px, 5vw, 40px)" }}>
          <Outlet />
        </div>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{
        background: "#03050A",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "clamp(24px, 3vw, 44px) clamp(20px, 5vw, 40px)",
        paddingBottom: "calc(clamp(24px, 3vw, 44px) + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 18 }}>
            <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src="/logo.png" alt="Neeko Stats" style={{ height: 22, width: "auto", opacity: 0.8 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>AFL stats for iPhone.</span>
            </Link>
            <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              {FOOTER_LINKS.map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.36)", textDecoration: "none", padding: "6px 2px", whiteSpace: "nowrap" }}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.16)", textAlign: "center" }}>
            &copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        @media (max-width: 1023px) {
          .ppl-burger { display: flex !important; }
        }
        @media (max-width: 479px) {
          .ppl-cta-text { display: none; }
        }
      `}</style>
    </div>
  );
}

export default PublicPageLayout;
