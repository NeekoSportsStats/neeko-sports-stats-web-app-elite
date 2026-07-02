import { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";

const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";
const GOLD = "#E0AE2D";

export function LandingLayout() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headerH = scrolled ? 60 : 74;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#07090C" }}>

      {/* ── STICKY HEADER ─────────────────────────────────────────────────── */}
      <header
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          zIndex: 200,
          height: headerH,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 clamp(16px, 4vw, 40px)",
          background: scrolled ? "rgba(7,9,12,0.94)" : "rgba(7,9,12,0.60)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.09)" : "1px solid transparent",
          transition: "height 0.22s ease, background 0.22s ease, border-color 0.22s ease",
        }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <img
            src="/logo.png"
            alt="Neeko Stats"
            style={{ height: 44, width: "auto", objectFit: "contain", display: "block", flexShrink: 0 }}
          />
        </Link>

        {/* Right CTA */}
        <a
          href={APP_STORE}
          target="_blank"
          rel="noopener noreferrer"
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
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <span className="lnav-cta-text">Download</span>
        </a>
      </header>

      {/* ── PAGE CONTENT ──────────────────────────────────────────────────── */}
      <main style={{ paddingTop: headerH, transition: "padding-top 0.22s ease" }}>
        <Outlet />
      </main>

      <style>{`
        @media (max-width: 479px) {
          .lnav-cta-text { display: none; }
        }
      `}</style>
    </div>
  );
}

export default LandingLayout;
