import { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { APP_STORE_URL } from "@/constants/appStore";

const APP_STORE = APP_STORE_URL;
const GOLD = "#E0AE2D";

const FOOTER_LINKS = [
  { label: "Policies", to: "/policies"      },
  { label: "Privacy",  to: "/privacy-policy" },
  { label: "Contact",  to: "/contact"        },
  { label: "About",    to: "/about"          },
];

export function PublicPageLayout() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headerH = scrolled ? 54 : 64;

  return (
    <div style={{ background: "#07090C", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 200,
        height: headerH,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(16px, 4vw, 40px)",
        background: scrolled ? "rgba(7,9,12,0.94)" : "rgba(7,9,12,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.09)" : "1px solid transparent",
        transition: "height 0.22s ease, background 0.22s ease, border-color 0.22s ease",
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flexShrink: 0 }}>
          <img src="/logo.png" alt="Neeko Stats" className="ppl-logo" style={{ width: "clamp(120px, 22vw, 158px)", height: "auto", objectFit: "contain", display: "block", flexShrink: 0 }} />
        </Link>

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
          <span className="ppl-cta-text">Download</span>
        </a>
      </header>

      {/* ── PAGE CONTENT ────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        paddingTop: headerH,
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
        borderTop: "1px solid rgba(255,255,255,0.07)",
        padding: "clamp(20px, 2.5vw, 36px) clamp(20px, 5vw, 40px)",
        paddingBottom: "calc(clamp(20px, 2.5vw, 36px) + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>

          {/* Mobile: centered stack. Desktop: two-column row */}
          <div className="ppl-footer-inner">

            <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }} className="ppl-footer-brand">
              <img src="/logo.png" alt="Neeko Stats" style={{ height: 20, width: "auto", opacity: 0.75 }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>AFL stats for iPhone.</span>
            </Link>

            <nav className="ppl-footer-nav" aria-label="Footer navigation">
              {FOOTER_LINKS.map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.48)", textDecoration: "none", whiteSpace: "nowrap", padding: "4px 0", transition: "color 0.15s" }}
                  className="ppl-footer-link"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <p style={{ margin: "14px 0 0", fontSize: 10.5, color: "rgba(255,255,255,0.14)", textAlign: "center" }}>
            &copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        @media (max-width: 479px) {
          .ppl-cta-text { display: none; }
          .ppl-logo { width: clamp(120px, 36vw, 142px) !important; }
          .ppl-footer-inner {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
          }
          .ppl-footer-brand { justify-content: center; }
          .ppl-footer-nav {
            display: grid;
            grid-template-columns: repeat(2, auto);
            gap: 8px 28px;
            justify-items: center;
          }
        }
        @media (min-width: 480px) {
          .ppl-footer-inner {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
          }
          .ppl-footer-nav { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; }
        }
        .ppl-footer-link:hover { color: rgba(255,255,255,0.72) !important; }
      `}</style>
    </div>
  );
}

export default PublicPageLayout;
