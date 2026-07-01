import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const DARK = "#07090C";
const GOLD = "#E0AE2D";
const TEAL = "#22c55e";
const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";

const FEATURES = [
  {
    icon: "▦",
    title: "Match Boards",
    copy: "Pick any match, set your threshold. See hit rates, last-10 form and projections for every player — before bounce.",
    color: TEAL,
  },
  {
    icon: "◈",
    title: "Player Hit Rates",
    copy: "How often does a player hit 25+ disposals? 2+ goals? Historical hit rates across every stat line, every matchup.",
    color: GOLD,
  },
  {
    icon: "◉",
    title: "Team Trends",
    copy: "Identify teams running hot, leaking points, or trending into tough draws. Form across the last 5 rounds at a glance.",
    color: "#60a5fa",
  },
  {
    icon: "◆",
    title: "Neeko Pro",
    copy: "Unlock every match, every player, every lens for the full season — or grab a Round Pass when you need it most.",
    color: GOLD,
  },
];

const SCREENSHOTS = [
  { src: "/image.png", alt: "Neeko Stats match board screen" },
  { src: "/image copy.png", alt: "Neeko Stats player stats screen" },
  { src: "/image copy copy.png", alt: "Neeko Stats team trends screen" },
];

export default function Index() {
  return (
    <div style={{ background: DARK, overflowX: "hidden", minHeight: "100vh", fontFamily: "inherit" }}>
      <Helmet>
        <title>Neeko Stats — AFL Stats App for iPhone</title>
        <meta
          name="description"
          content="Neeko Stats is the AFL stats app for fantasy footy. Hit rates, match boards, player trends and team form — in your pocket, before the bounce. Now on iOS."
        />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Stats — AFL Stats App for iPhone" />
        <meta property="og:description" content="AFL hit rates, match boards and team trends in your pocket. Now on iOS." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ── HERO ──────────────────────────────────────────────────────────────────── */}
      <section className="n-hero">
        <div className="n-hero-bg" aria-hidden="true" />

        <div className="n-hero-inner">
          {/* Text column */}
          <div className="n-hero-text">
            <p className="n-eyebrow">Now on iOS</p>

            <h1 className="n-h1">
              AFL stats{" "}
              <span style={{ color: GOLD, textShadow: "0 0 40px rgba(224,174,45,0.35)" }}>
                before bounce.
              </span>
            </h1>

            <p className="n-sub">
              Player trends, hit rates, match boards and team form in your pocket.
            </p>

            <div className="n-ctas">
              <a
                href={APP_STORE}
                target="_blank"
                rel="noopener noreferrer"
                className="n-btn-primary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Download on the App Store
              </a>
            </div>

            <div className="n-pills">
              {["600+ AFL players tracked", "Updated before every lockout", "Disposals, goals & more"].map((t) => (
                <span key={t} className="n-pill">{t}</span>
              ))}
            </div>
          </div>

          {/* Screenshot column */}
          <div className="n-hero-visual">
            <div className="n-phone-frame">
              <img
                src="/hero/image.png"
                alt="Neeko Stats app on iPhone"
                className="n-phone-img"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────────────── */}
      <section className="n-section" style={{ background: "#060809" }}>
        <div className="n-container">
          <div className="n-section-header">
            <p className="n-label">The full toolkit</p>
            <h2 className="n-h2">Everything you need before Sunday lockout.</h2>
          </div>

          <div className="n-feature-grid">
            {FEATURES.map(({ icon, title, copy, color }) => (
              <div
                key={title}
                className="n-feature-card"
                style={{ borderColor: `${color}22` }}
              >
                <div className="n-feature-icon" style={{ color, background: `${color}12` }}>
                  {icon}
                </div>
                <p className="n-feature-title">{title}</p>
                <p className="n-feature-copy">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCREENSHOTS ───────────────────────────────────────────────────────────── */}
      <section className="n-section n-screenshots-section">
        <div className="n-container">
          <div className="n-section-header">
            <p className="n-label" style={{ color: `${GOLD}99` }}>See it in action</p>
            <h2 className="n-h2">Your stats. Your edge.</h2>
            <p className="n-section-sub">
              Every screen built for speed. Find the players and matchups that matter in seconds.
            </p>
          </div>

          <div className="n-screenshots-grid">
            {SCREENSHOTS.map(({ src, alt }) => (
              <div key={src} className="n-screenshot-wrap">
                <div className="n-screenshot-frame">
                  <img src={src} alt={alt} className="n-screenshot-img" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEEKO PRO ─────────────────────────────────────────────────────────────── */}
      <section className="n-section n-pro-section">
        <div className="n-pro-bg" aria-hidden="true" />
        <div className="n-container" style={{ position: "relative" }}>
          <div className="n-pro-inner">
            <div className="n-pro-badge">Neeko Pro</div>
            <h2 className="n-h2" style={{ marginBottom: 16 }}>
              Unlock every{" "}
              <span style={{ color: GOLD }}>match board.</span>
            </h2>
            <p className="n-section-sub" style={{ maxWidth: 480, margin: "0 auto 32px" }}>
              Free access shows a preview match. Neeko Pro unlocks every match, every player and every stat lens for the full season — or grab a Round Pass when you need it.
            </p>

            <div className="n-pro-features">
              {[
                { label: "Every match unlocked", color: TEAL },
                { label: "All stat lenses", color: TEAL },
                { label: "Player hit rates", color: TEAL },
                { label: "Team trends", color: TEAL },
                { label: "Round Pass available", color: GOLD },
                { label: "Season Pass available", color: GOLD },
              ].map(({ label, color }) => (
                <div key={label} className="n-pro-feature" style={{ color }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M13.5 3.5L6 11 2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  {label}
                </div>
              ))}
            </div>

            <a
              href={APP_STORE}
              target="_blank"
              rel="noopener noreferrer"
              className="n-btn-primary"
              style={{ marginTop: 32, display: "inline-flex" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Get Neeko Pro on iOS
            </a>
          </div>
        </div>
      </section>

      {/* ── TRUST ─────────────────────────────────────────────────────────────────── */}
      <section className="n-section" style={{ background: "#060809" }}>
        <div className="n-container">
          <div className="n-trust-inner">
            <div className="n-trust-text">
              <p className="n-label">Built for fans and fantasy players</p>
              <h2 className="n-h2" style={{ textAlign: "left", marginBottom: 16 }}>
                Stats and research.<br />Nothing else.
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: 0 }}>
                Neeko Stats is an AFL statistics and trends research tool. We surface historical hit rates, form data and matchup context to help fantasy footy players and fans make informed decisions.
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", lineHeight: 1.6, marginTop: 16 }}>
                Neeko Stats does not provide betting tips, does not partner with any bookmaker, and does not endorse or encourage gambling. All data is for research and entertainment purposes only.
              </p>
            </div>
            <div className="n-trust-cards">
              {[
                { stat: "600+", label: "AFL players tracked", color: TEAL },
                { stat: "All rounds", label: "every season, every week", color: GOLD },
                { stat: "iOS", label: "native iPhone app", color: "#60a5fa" },
              ].map(({ stat, label, color }) => (
                <div key={stat} className="n-trust-card">
                  <p className="n-trust-stat" style={{ color }}>{stat}</p>
                  <p className="n-trust-label">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER CTA ────────────────────────────────────────────────────────────── */}
      <section className="n-footer-cta">
        <div className="n-container" style={{ textAlign: "center" }}>
          <p className="n-eyebrow" style={{ animationDelay: "0s" }}>Available now</p>
          <h2 className="n-h2" style={{ marginBottom: 16, fontSize: "clamp(24px, 3vw, 40px)" }}>
            Get the edge before bounce.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.50)", marginBottom: 32, lineHeight: 1.6 }}>
            Download Neeko Stats free on iPhone. Upgrade to Pro when you're ready.
          </p>
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="n-btn-primary n-btn-lg"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────────── */}
      <footer className="n-footer">
        <div className="n-container">
          <div className="n-footer-inner">
            <div className="n-footer-brand">
              <img src="/logo.png" alt="Neeko Stats" className="n-footer-logo" />
              <p className="n-footer-tagline">AFL stats for fantasy players — on iOS.</p>
            </div>

            <nav className="n-footer-nav" aria-label="Footer">
              {[
                { label: "Privacy Policy", to: "/privacy-policy" },
                { label: "Terms", to: "/terms-conditions" },
                { label: "Refund Policy", to: "/refund-policy" },
                { label: "Contact", to: "/contact" },
                { label: "About", to: "/about" },
              ].map(({ label, to }) => (
                <Link key={to} to={to} className="n-footer-link">{label}</Link>
              ))}
            </nav>
          </div>

          <p className="n-copyright">
            &copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        /* ── Animations ──────────────────────────────────────────────────────────── */
        @keyframes nFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }

        .n-eyebrow {
          margin: 0 0 20px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: ${TEAL};
          text-shadow: 0 0 20px rgba(34,197,94,0.28);
          opacity: 0;
          animation: nFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s forwards;
        }
        .n-h1 {
          margin: 0 0 22px;
          font-size: clamp(36px, 5.5vw, 72px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.04em;
          color: #f4f4f4;
          opacity: 0;
          animation: nFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.18s forwards;
        }
        .n-sub {
          margin: 0 0 36px;
          font-size: clamp(15px, 1.2vw, 19px);
          color: rgba(255,255,255,0.66);
          line-height: 1.65;
          font-weight: 400;
          opacity: 0;
          animation: nFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.30s forwards;
        }
        .n-ctas {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          opacity: 0;
          animation: nFadeUp 0.50s cubic-bezier(0.22,1,0.36,1) 0.42s forwards;
        }
        .n-pills {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 22px;
          opacity: 0;
          animation: nFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.54s forwards;
        }
        .n-pill {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255,255,255,0.50);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          padding: 4px 11px;
          border-radius: 999px;
          white-space: nowrap;
        }

        /* ── Buttons ─────────────────────────────────────────────────────────────── */
        .n-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%);
          color: #07090C;
          font-weight: 800;
          font-size: clamp(13px, 1vw, 16px);
          padding: 14px 28px;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 28px rgba(224,174,45,0.30), 0 4px 12px rgba(0,0,0,0.50);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          white-space: nowrap;
        }
        .n-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 36px rgba(224,174,45,0.42), 0 4px 12px rgba(0,0,0,0.50);
        }
        .n-btn-lg {
          font-size: clamp(14px, 1.1vw, 18px);
          padding: 16px 36px;
          border-radius: 14px;
        }

        /* ── Hero ────────────────────────────────────────────────────────────────── */
        .n-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          padding: 80px clamp(20px, 5vw, 64px) 60px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .n-hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 65% 55% at 40% -5%, rgba(34,197,94,0.09) 0%, transparent 65%),
            radial-gradient(ellipse 50% 40% at 85% 55%, rgba(224,174,45,0.06) 0%, transparent 55%),
            radial-gradient(ellipse 40% 30% at 10% 80%, rgba(96,165,250,0.04) 0%, transparent 50%);
          pointer-events: none;
        }
        .n-hero-inner {
          position: relative;
          max-width: 1160px;
          margin: 0 auto;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
          align-items: center;
        }
        .n-hero-text {
          max-width: 600px;
        }
        .n-hero-visual {
          display: flex;
          justify-content: center;
          align-items: flex-end;
          opacity: 0;
          animation: nFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.60s forwards;
        }
        .n-phone-frame {
          position: relative;
          width: clamp(200px, 45vw, 320px);
          animation: nFloat 4s ease-in-out 1.2s infinite;
          filter: drop-shadow(0 32px 64px rgba(0,0,0,0.70)) drop-shadow(0 8px 24px rgba(34,197,94,0.12));
        }
        .n-phone-img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 28px;
        }

        /* ── Layout helpers ──────────────────────────────────────────────────────── */
        .n-section {
          padding: clamp(56px, 6vw, 96px) clamp(20px, 5vw, 64px);
        }
        .n-container {
          max-width: 1160px;
          margin: 0 auto;
          width: 100%;
        }
        .n-section-header {
          text-align: center;
          margin-bottom: clamp(36px, 4vw, 56px);
        }
        .n-label {
          margin: 0 0 10px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.32);
        }
        .n-h2 {
          margin: 0;
          font-size: clamp(22px, 2.6vw, 36px);
          font-weight: 900;
          color: #f0f0f0;
          letter-spacing: -0.03em;
          line-height: 1.15;
          text-align: center;
        }
        .n-section-sub {
          margin: 16px auto 0;
          font-size: clamp(14px, 1vw, 16px);
          color: rgba(255,255,255,0.52);
          line-height: 1.7;
          text-align: center;
        }

        /* ── Features ────────────────────────────────────────────────────────────── */
        .n-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .n-feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 24px 22px;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .n-feature-card:hover {
          background: rgba(255,255,255,0.055);
          transform: translateY(-2px);
        }
        .n-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-size: 18px;
          margin-bottom: 14px;
        }
        .n-feature-title {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 800;
          color: #ebebeb;
          letter-spacing: -0.01em;
        }
        .n-feature-copy {
          margin: 0;
          font-size: 13px;
          color: rgba(255,255,255,0.50);
          line-height: 1.65;
        }

        /* ── Screenshots ─────────────────────────────────────────────────────────── */
        .n-screenshots-section {
          background: ${DARK};
        }
        .n-screenshots-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          align-items: end;
        }
        .n-screenshot-wrap {
          display: flex;
          justify-content: center;
        }
        .n-screenshot-frame {
          width: 100%;
          max-width: 260px;
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 20px 48px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.40);
          border: 1px solid rgba(255,255,255,0.07);
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .n-screenshot-frame:hover {
          transform: translateY(-6px);
          box-shadow: 0 28px 60px rgba(0,0,0,0.65), 0 8px 24px rgba(34,197,94,0.10);
        }
        .n-screenshot-img {
          width: 100%;
          height: auto;
          display: block;
        }
        /* stagger the middle screenshot up a bit on desktop */
        .n-screenshots-grid .n-screenshot-wrap:nth-child(2) .n-screenshot-frame {
          transform: translateY(-16px);
        }
        .n-screenshots-grid .n-screenshot-wrap:nth-child(2) .n-screenshot-frame:hover {
          transform: translateY(-22px);
        }

        /* ── Neeko Pro ───────────────────────────────────────────────────────────── */
        .n-pro-section {
          position: relative;
          background: ${DARK};
          overflow: hidden;
        }
        .n-pro-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 60% at 50% 100%, rgba(224,174,45,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 30% at 0% 50%, rgba(34,197,94,0.04) 0%, transparent 55%);
          pointer-events: none;
        }
        .n-pro-inner {
          text-align: center;
          max-width: 640px;
          margin: 0 auto;
        }
        .n-pro-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: ${GOLD};
          background: rgba(224,174,45,0.10);
          border: 1px solid rgba(224,174,45,0.22);
          padding: 5px 14px;
          border-radius: 999px;
          margin-bottom: 20px;
        }
        .n-pro-features {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 16px;
          justify-content: center;
          margin-top: 8px;
        }
        .n-pro-feature {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 7px 14px;
          border-radius: 999px;
        }

        /* ── Trust ───────────────────────────────────────────────────────────────── */
        .n-trust-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 40px;
          align-items: center;
        }
        .n-trust-text .n-h2 {
          text-align: left;
        }
        .n-trust-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .n-trust-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 20px 16px;
          text-align: center;
        }
        .n-trust-stat {
          margin: 0 0 6px;
          font-size: clamp(22px, 2.5vw, 30px);
          font-weight: 900;
          letter-spacing: -0.03em;
        }
        .n-trust-label {
          margin: 0;
          font-size: 12px;
          color: rgba(255,255,255,0.40);
          line-height: 1.4;
        }

        /* ── Footer CTA ──────────────────────────────────────────────────────────── */
        .n-footer-cta {
          background: #060809;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: clamp(64px, 7vw, 104px) clamp(20px, 5vw, 64px);
        }

        /* ── Footer ──────────────────────────────────────────────────────────────── */
        .n-footer {
          background: #03050A;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: clamp(32px, 4vw, 52px) clamp(20px, 5vw, 64px);
        }
        .n-footer-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 24px;
          margin-bottom: 28px;
        }
        .n-footer-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .n-footer-logo {
          height: 28px;
          width: auto;
          opacity: 0.85;
        }
        .n-footer-tagline {
          margin: 0;
          font-size: 13px;
          color: rgba(255,255,255,0.35);
        }
        .n-footer-nav {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          align-items: center;
        }
        .n-footer-link {
          font-size: 12px;
          color: rgba(255,255,255,0.38);
          text-decoration: none;
          transition: color 0.15s ease;
          white-space: nowrap;
        }
        .n-footer-link:hover {
          color: rgba(255,255,255,0.72);
        }
        .n-copyright {
          margin: 0;
          font-size: 11px;
          color: rgba(255,255,255,0.18);
          text-align: center;
        }

        /* ── Mobile ──────────────────────────────────────────────────────────────── */
        @media (max-width: 640px) {
          .n-hero {
            min-height: auto;
            padding-top: 72px;
            padding-bottom: 40px;
          }
          .n-hero-inner {
            gap: 36px;
          }
          /* screenshot first on mobile */
          .n-hero-visual { order: -1; }
          .n-hero-text   { order: 1; }
          .n-phone-frame {
            width: clamp(180px, 60vw, 240px);
          }
          .n-ctas { flex-direction: column; align-items: flex-start; }
          .n-ctas .n-btn-primary { width: 100%; max-width: 320px; justify-content: center; }
          .n-feature-grid { grid-template-columns: 1fr; }
          .n-screenshots-grid { grid-template-columns: 1fr; gap: 16px; }
          .n-screenshots-grid .n-screenshot-wrap { max-width: 280px; margin: 0 auto; width: 100%; }
          .n-screenshots-grid .n-screenshot-wrap:nth-child(2) .n-screenshot-frame { transform: none; }
          .n-screenshots-grid .n-screenshot-wrap:nth-child(2) .n-screenshot-frame:hover { transform: translateY(-4px); }
          .n-trust-inner { grid-template-columns: 1fr; }
          .n-trust-cards { grid-template-columns: 1fr; gap: 10px; }
          .n-trust-text .n-h2 { text-align: center; }
          .n-footer-inner { flex-direction: column; align-items: flex-start; }
          .n-footer-brand { flex-direction: column; align-items: flex-start; gap: 6px; }
        }

        /* ── Tablet ──────────────────────────────────────────────────────────────── */
        @media (min-width: 641px) and (max-width: 1023px) {
          .n-hero-inner { grid-template-columns: 1fr; }
          .n-hero-text { max-width: 100%; }
          .n-hero-visual { order: -1; }
          .n-phone-frame { width: clamp(220px, 35vw, 280px); animation: none; }
          .n-screenshots-grid { grid-template-columns: repeat(3, 1fr); }
          .n-trust-inner { grid-template-columns: 1fr; }
          .n-trust-cards { grid-template-columns: repeat(3, 1fr); }
        }

        /* ── Desktop ─────────────────────────────────────────────────────────────── */
        @media (min-width: 1024px) {
          .n-hero-inner {
            grid-template-columns: 1fr auto;
            gap: 80px;
          }
          .n-hero-visual { order: 1; }
          .n-hero-text { order: -1; }
          .n-phone-frame { width: clamp(260px, 22vw, 340px); }
          .n-trust-inner { grid-template-columns: 1fr 1fr; }
          .n-trust-cards { grid-template-columns: 1fr; gap: 12px; }
          .n-trust-card { display: flex; align-items: center; gap: 16px; text-align: left; }
          .n-trust-stat { font-size: clamp(20px, 1.8vw, 26px); margin-bottom: 0; }
        }
      `}</style>
    </div>
  );
}
