import { useState, useEffect, useRef } from "react";
import { Link, Outlet } from "react-router-dom";

const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";
const GOLD = "#E0AE2D";

const MOBILE_NAV = [
  { label: "Features",       href: "#features"      },
  { label: "Screenshots",    href: "#screenshots"   },
  { label: "Neeko Pro",      href: "#neeko-pro"     },
  { label: "Policies",       to: "/policies"        },
  { label: "Privacy Policy", to: "/privacy-policy"  },
  { label: "Terms",          to: "/terms-conditions" },
  { label: "Refund Policy",  to: "/refund-policy"   },
  { label: "Contact",        to: "/contact"         },
  { label: "About",          to: "/about"           },
];

export function LandingLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  function close() { setMenuOpen(false); }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const headerH = scrolled ? 60 : 74;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#07090C" }}>

      {/* ── STICKY HEADER ─────────────────────────────────────────────────── */}
      <header
        ref={headerRef}
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          zIndex: 200,
          height: headerH,
          display: "flex",
          alignItems: "center",
          padding: "0 clamp(16px, 4vw, 40px)",
          background: scrolled ? "rgba(7,9,12,0.94)" : "rgba(7,9,12,0.60)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.09)" : "1px solid transparent",
          gap: 0,
          transition: "height 0.22s ease, background 0.22s ease, border-color 0.22s ease",
        }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flexShrink: 0 }} onClick={close}>
          <img
            src="/logo.png"
            alt=""
            className="lnav-logo-icon"
            style={{ width: "auto", objectFit: "contain", display: "block", flexShrink: 0 }}
          />
          <span className="lnav-wordmark" style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}>Neeko Stats</span>
        </Link>

        {/* Desktop nav center */}
        <nav className="lnav-desktop" style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 2,
          alignItems: "center",
        }}>
          {[
            { label: "Features",    href: "#features"    },
            { label: "Screenshots", href: "#screenshots" },
            { label: "Neeko Pro",   href: "#neeko-pro"  },
          ].map(({ label, href }) => (
            <a key={href} href={href} style={{
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(255,255,255,0.58)",
              textDecoration: "none",
              padding: "6px 13px",
              borderRadius: 7,
              transition: "color 0.15s, background 0.15s",
              whiteSpace: "nowrap",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = "#f0f0f0";
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.58)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >{label}</a>
          ))}
        </nav>

        {/* Right CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="lnav-cta"
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
            <span className="lnav-cta-text">Download</span>
          </a>

          {/* Hamburger — mobile only */}
          <button
            className="lnav-burger"
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

      {/* ── MOBILE OVERLAY ────────────────────────────────────────────────── */}
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

      {/* ── MOBILE DRAWER ─────────────────────────────────────────────────── */}
      <div
        className="lnav-drawer"
        style={{
          position: "fixed",
          top: headerH,
          left: 0,
          width: "90%",
          maxWidth: 340,
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
          display: "block",
          boxShadow: menuOpen ? "4px 8px 32px rgba(0,0,0,0.50)" : "none",
        }}
      >
        {MOBILE_NAV.map(item => {
          const isHash = "href" in item;
          const baseStyle: React.CSSProperties = {
            display: "block",
            fontSize: 15,
            fontWeight: 600,
            color: "rgba(255,255,255,0.72)",
            textDecoration: "none",
            padding: "13px 22px",
            transition: "color 0.15s, background 0.15s",
          };
          return isHash ? (
            <a key={item.label} href={(item as { href: string }).href} style={baseStyle}
              onClick={close}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = "#fff";
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >{item.label}</a>
          ) : (
            <Link key={item.label} to={(item as { to: string }).to} style={baseStyle}
              onClick={close}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = "#fff";
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >{item.label}</Link>
          );
        })}

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

      {/* ── PAGE CONTENT ──────────────────────────────────────────────────── */}
      <main style={{ paddingTop: headerH, transition: "padding-top 0.22s ease" }}>
        <Outlet />
      </main>

      <style>{`
        .lnav-logo-icon { height: 36px; }
        @media (max-width: 1023px) {
          .lnav-desktop { display: none !important; }
          .lnav-burger  { display: flex !important; }
          .lnav-logo-icon { height: 34px; }
        }
        @media (max-width: 479px) {
          .lnav-cta-text { display: none; }
        }
      `}</style>
    </div>
  );
}

export default LandingLayout;
