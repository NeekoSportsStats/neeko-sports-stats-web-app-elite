import { useState } from "react";
import { Link, Outlet } from "react-router-dom";

const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";
const GOLD = "#E0AE2D";

const MOBILE_NAV = [
  { label: "Features",       href: "#features"     },
  { label: "Screenshots",    href: "#screenshots"  },
  { label: "Neeko Pro",      href: "#neeko-pro"    },
  { label: "Contact",        to: "/contact"        },
  { label: "Privacy Policy", to: "/privacy-policy" },
];

export function LandingLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  function close() { setMenuOpen(false); }

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#07090C" }}>

      {/* ── STICKY HEADER ─────────────────────────────────────────────────── */}
      <header style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 200,
        height: 60,
        display: "flex",
        alignItems: "center",
        padding: "0 clamp(16px, 4vw, 40px)",
        background: "rgba(7,9,12,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        gap: 0,
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }} onClick={close}>
          <img src="/logo.png" alt="Neeko Stats" style={{ height: 28, width: "auto", objectFit: "contain", display: "block" }} />
        </Link>

        {/* Desktop nav center */}
        <nav className="lnav-desktop" style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 4,
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
              color: "rgba(255,255,255,0.60)",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 7,
              transition: "color 0.15s",
              whiteSpace: "nowrap",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f0f0f0"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)"; }}
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
            style={{
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7,
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
              flexShrink: 0,
            }}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* ── MOBILE OVERLAY ────────────────────────────────────────────────── */}
      {menuOpen && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 198, background: "rgba(0,0,0,0.55)" }} />
      )}

      {/* ── MOBILE DRAWER ─────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed",
        top: 60, left: 0,
        width: 240,
        background: "#0e1116",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "0 0 12px 0",
        zIndex: 199,
        padding: "8px 0 20px",
        transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        display: "block",
      }}>
        {MOBILE_NAV.map(item => {
          const isHash = "href" in item;
          const style = {
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(255,255,255,0.75)" as string,
            textDecoration: "none",
            padding: "11px 20px",
            transition: "color 0.15s",
          } as const;
          return isHash ? (
            <a key={item.label} href={(item as { href: string }).href} style={style}
              onClick={close}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f0f0f0"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
            >{item.label}</a>
          ) : (
            <Link key={item.label} to={(item as { to: string }).to} style={style}
              onClick={close}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f0f0f0"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
            >{item.label}</Link>
          );
        })}

        <div style={{ margin: "12px 16px 0", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 800,
              color: "#07090C",
              textDecoration: "none",
              background: `linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%)`,
              padding: "10px 16px",
              borderRadius: 8,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        </div>
      </div>

      {/* ── PAGE CONTENT ──────────────────────────────────────────────────── */}
      <main style={{ paddingTop: 60 }}>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 1023px) {
          .lnav-desktop { display: none !important; }
          .lnav-burger  { display: flex !important; }
        }
        @media (max-width: 479px) {
          .lnav-cta-text { display: none; }
        }
      `}</style>
    </div>
  );
}

export default LandingLayout;
