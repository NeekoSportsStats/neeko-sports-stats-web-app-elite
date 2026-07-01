import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const DARK  = "#07090C";
const GOLD  = "#E0AE2D";
const TEAL  = "#22c55e";
const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";

const APPLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const FEATURES = [
  {
    label: "Match Boards",
    copy:  "Pick a game and scan player lines, hit rates and recent form across every stat.",
    color: TEAL,
    icon:  "▦",
  },
  {
    label: "Player Profiles",
    copy:  "View season averages, recent results, trend charts and hit-rate lines by stat.",
    color: GOLD,
    icon:  "◎",
  },
  {
    label: "Team Trends",
    copy:  "Compare ladder position, scoring, defence and last-5 form across every AFL team.",
    color: "#60a5fa",
    icon:  "◉",
  },
  {
    label: "Neeko Pro",
    copy:  "Unlock every match board, stat lens and matchup view. $9.99 / month.",
    color: GOLD,
    icon:  "◆",
  },
];

const SCREENSHOTS = [
  { src: "/images/app-screenshots/01-stat-board.png",    caption: "AFL Stat Board",     sub: "Hit rates & form by match" },
  { src: "/images/app-screenshots/02-player-profile.png", caption: "Player Profile",   sub: "Trends, averages & history" },
  { src: "/images/app-screenshots/05-teams-list.png",    caption: "Team Trends",        sub: "Ladder, scoring & form" },
  { src: "/images/app-screenshots/06-team-profile.png",  caption: "Team Profile",       sub: "Season summary & leaders" },
];

const PRO_FEATURES = [
  "Every match board this round",
  "All stat lenses: disposals, goals, marks & tackles",
  "Full hit-rate lines and fine thresholds",
  "Matchup Compare access",
  "Team and match context",
];

export default function Index() {
  return (
    <div style={{ background: DARK, overflowX: "hidden", minHeight: "100vh" }}>
      <Helmet>
        <title>Neeko Stats — AFL Stats App for iPhone</title>
        <meta name="description" content="Neeko Stats is the AFL stats app for iPhone. Player hit rates, match boards, team form and recent trends — before the bounce." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Stats — AFL Stats App for iPhone" />
        <meta property="og:description" content="AFL hit rates, match boards and team trends in your pocket. Now on iOS." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="ix-hero">
        <div className="ix-hero-glow" aria-hidden="true" />

        <div className="ix-hero-inner">

          {/* Phone screenshot — above text on mobile, right column on desktop */}
          <div className="ix-hero-visual">
            <div className="ix-phone">
              <img
                src="/images/app-screenshots/01-stat-board.png"
                alt="Neeko Stats AFL Stat Board on iPhone"
                className="ix-phone-img"
                loading="eager"
              />
            </div>
          </div>

          {/* Text column */}
          <div className="ix-hero-text">
            <p className="ix-eyebrow">Now on iOS</p>
            <h1 className="ix-h1">
              AFL stats{" "}
              <span style={{ color: GOLD, textShadow: "0 0 36px rgba(224,174,45,0.32)" }}>
                before bounce.
              </span>
            </h1>
            <p className="ix-sub">
              Player hit rates, match boards, team form and recent trends — built for iPhone.
            </p>

            <div className="ix-ctas">
              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ix-btn-primary">
                {APPLE_ICON}
                Download on the App Store
              </a>
            </div>

            <div className="ix-pills">
              {[
                "600+ AFL players",
                "Updated before each round",
                "No betting tips — stats research only",
              ].map(t => (
                <span key={t} className="ix-pill">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" className="ix-section" style={{ background: "#060809" }}>
        <div className="ix-container">
          <div className="ix-section-head">
            <p className="ix-label">What's inside</p>
            <h2 className="ix-h2">Everything before lockout.</h2>
          </div>

          <div className="ix-feature-grid">
            {FEATURES.map(({ label, copy, color, icon }) => (
              <div key={label} className="ix-feature-card" style={{ borderColor: `${color}1e` }}>
                <div className="ix-feature-icon" style={{ color, background: `${color}12` }}>{icon}</div>
                <p className="ix-feature-title">{label}</p>
                <p className="ix-feature-copy">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCREENSHOTS ──────────────────────────────────────────────────────── */}
      <section id="screenshots" className="ix-section" style={{ background: DARK }}>
        <div className="ix-container">
          <div className="ix-section-head">
            <p className="ix-label" style={{ color: `${GOLD}99` }}>See the board before the bounce</p>
            <h2 className="ix-h2">Built for iPhone.</h2>
            <p className="ix-section-sub">Every screen optimised for fast decisions before game day.</p>
          </div>

          {/* Desktop grid */}
          <div className="ix-shots-grid">
            {SCREENSHOTS.map(({ src, caption, sub }, i) => (
              <div key={src} className="ix-shot-wrap" style={{ marginTop: i === 1 || i === 3 ? -24 : 0 }}>
                <div className="ix-shot-frame">
                  <img src={src} alt={caption} className="ix-shot-img" loading="lazy" />
                </div>
                <p className="ix-shot-caption">{caption}</p>
                <p className="ix-shot-sub">{sub}</p>
              </div>
            ))}
          </div>

          {/* Mobile swipe strip */}
          <div className="ix-shots-scroll">
            {SCREENSHOTS.map(({ src, caption, sub }) => (
              <div key={src} className="ix-shots-scroll-item">
                <div className="ix-shot-frame">
                  <img src={src} alt={caption} className="ix-shot-img" loading="lazy" />
                </div>
                <p className="ix-shot-caption">{caption}</p>
                <p className="ix-shot-sub">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEEKO PRO ────────────────────────────────────────────────────────── */}
      <section id="neeko-pro" className="ix-section ix-pro-section">
        <div className="ix-pro-glow" aria-hidden="true" />
        <div className="ix-container" style={{ position: "relative" }}>
          <div className="ix-pro-inner">

            {/* Pro screenshot */}
            <div className="ix-pro-visual">
              <div className="ix-shot-frame" style={{ maxWidth: 280, margin: "0 auto" }}>
                <img
                  src="/images/app-screenshots/04-pro-unlock.png"
                  alt="Neeko Pro unlock screen"
                  className="ix-shot-img"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Pro copy */}
            <div className="ix-pro-copy">
              <div className="ix-pro-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Neeko Pro
              </div>
              <h2 className="ix-h2" style={{ textAlign: "left", marginBottom: 14 }}>
                Unlock every{" "}
                <span style={{ color: GOLD }}>match board.</span>
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.58)", lineHeight: 1.65, margin: "0 0 24px" }}>
                Neeko Pro unlocks full-round access — every stat lens, fine-line thresholds, matchup compare and team context.
              </p>

              <div className="ix-pro-feats">
                {PRO_FEATURES.map(f => (
                  <div key={f} className="ix-pro-feat">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <polyline points="2,8 6,12 14,4" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>

              <p className="ix-pro-price">$9.99 / month</p>

              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ix-btn-primary" style={{ marginTop: 4 }}>
                {APPLE_ICON}
                Download on the App Store
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ────────────────────────────────────────────────────────────── */}
      <section className="ix-section" style={{ background: "#060809" }}>
        <div className="ix-container">
          <div className="ix-trust-inner">
            <div className="ix-trust-text">
              <p className="ix-label">For fans and fantasy players</p>
              <h2 className="ix-h2" style={{ textAlign: "left", marginBottom: 16 }}>
                Stats and research.<br />Nothing else.
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: 0 }}>
                Neeko Stats surfaces AFL hit rates, form data and matchup context for research and entertainment purposes.
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", lineHeight: 1.65, marginTop: 14 }}>
                Neeko Stats does not provide betting tips, does not partner with any bookmaker, and does not endorse or encourage gambling.
              </p>
            </div>
            <div className="ix-trust-stats">
              {[
                { n: "600+",   label: "AFL players tracked",    color: TEAL },
                { n: "18",     label: "teams, all positions",   color: GOLD },
                { n: "iOS",    label: "native iPhone app",      color: "#60a5fa" },
              ].map(({ n, label, color }) => (
                <div key={n} className="ix-trust-card">
                  <p className="ix-trust-n" style={{ color }}>{n}</p>
                  <p className="ix-trust-label">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="ix-section ix-cta-section">
        <div className="ix-container" style={{ textAlign: "center" }}>
          <p className="ix-eyebrow" style={{ animationDelay: "0s" }}>Available now</p>
          <h2 className="ix-h2" style={{ fontSize: "clamp(24px, 3vw, 40px)", marginBottom: 14 }}>
            Get the edge before bounce.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.48)", marginBottom: 32, lineHeight: 1.6 }}>
            Download Neeko Stats free on iPhone. Upgrade to Pro when you're ready.
          </p>
          <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ix-btn-primary ix-btn-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="ix-footer">
        <div className="ix-container">
          <div className="ix-footer-row">
            <div className="ix-footer-brand">
              <img src="/logo.png" alt="Neeko Stats" style={{ height: 24, width: "auto", opacity: 0.8 }} />
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
                AFL stats for iPhone.
              </p>
            </div>
            <nav className="ix-footer-nav" aria-label="Footer navigation">
              {[
                { label: "Privacy Policy", to: "/privacy-policy"  },
                { label: "Terms",          to: "/terms-conditions" },
                { label: "Refund Policy",  to: "/refund-policy"   },
                { label: "Contact",        to: "/contact"         },
                { label: "About",          to: "/about"           },
              ].map(({ label, to }) => (
                <Link key={to} to={to} className="ix-footer-link">{label}</Link>
              ))}
            </nav>
          </div>
          <p className="ix-copyright">&copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.</p>
        </div>
      </footer>

      <style>{`
        /* ── Animations ────────────────────────────────────────────────────── */
        @keyframes ixFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ixFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }

        .ix-eyebrow {
          margin: 0 0 18px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: ${TEAL};
          text-shadow: 0 0 18px rgba(34,197,94,0.28);
          opacity: 0;
          animation: ixFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.05s forwards;
        }
        .ix-h1 {
          margin: 0 0 18px;
          font-size: clamp(34px, 5.5vw, 68px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.04em;
          color: #f4f4f4;
          opacity: 0;
          animation: ixFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.15s forwards;
        }
        .ix-sub {
          margin: 0 0 28px;
          font-size: clamp(15px, 1.2vw, 18px);
          color: rgba(255,255,255,0.62);
          line-height: 1.65;
          opacity: 0;
          animation: ixFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.28s forwards;
        }
        .ix-ctas {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          opacity: 0;
          animation: ixFadeUp 0.50s cubic-bezier(0.22,1,0.36,1) 0.40s forwards;
        }
        .ix-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 20px;
          opacity: 0;
          animation: ixFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.52s forwards;
        }
        .ix-pill {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255,255,255,0.46);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          padding: 4px 11px;
          border-radius: 999px;
          white-space: nowrap;
        }

        /* ── Button ─────────────────────────────────────────────────────────── */
        .ix-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%);
          color: #07090C;
          font-weight: 800;
          font-size: clamp(13px, 1vw, 16px);
          padding: 14px 26px;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 24px rgba(224,174,45,0.28), 0 3px 10px rgba(0,0,0,0.45);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          white-space: nowrap;
        }
        .ix-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(224,174,45,0.40), 0 3px 10px rgba(0,0,0,0.45);
        }
        .ix-btn-lg {
          font-size: clamp(14px, 1.1vw, 17px);
          padding: 16px 34px;
          border-radius: 14px;
        }

        /* ── Hero ───────────────────────────────────────────────────────────── */
        .ix-hero {
          position: relative;
          overflow: hidden;
          padding: clamp(48px, 7vw, 88px) clamp(20px, 5vw, 64px) clamp(40px, 5vw, 72px);
        }
        .ix-hero-glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 65% 55% at 35% -5%, rgba(34,197,94,0.09) 0%, transparent 60%),
            radial-gradient(ellipse 45% 35% at 85% 55%, rgba(224,174,45,0.06) 0%, transparent 55%);
          pointer-events: none;
        }
        .ix-hero-inner {
          position: relative;
          max-width: 1160px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 36px;
          align-items: center;
        }
        /* screenshot ABOVE text on mobile */
        .ix-hero-visual { order: -1; display: flex; justify-content: center; }
        .ix-hero-text   { order: 1; }

        .ix-phone {
          width: clamp(180px, 52vw, 280px);
          opacity: 0;
          animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.0s forwards;
        }
        .ix-phone-img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 28px;
          box-shadow: 0 28px 60px rgba(0,0,0,0.65), 0 6px 20px rgba(34,197,94,0.10);
        }

        /* ── Layout helpers ─────────────────────────────────────────────────── */
        .ix-section {
          padding: clamp(48px, 5.5vw, 88px) clamp(20px, 5vw, 64px);
        }
        .ix-container {
          max-width: 1160px;
          margin: 0 auto;
          width: 100%;
        }
        .ix-section-head {
          text-align: center;
          margin-bottom: clamp(32px, 4vw, 52px);
        }
        .ix-label {
          margin: 0 0 10px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.28);
        }
        .ix-h2 {
          margin: 0;
          font-size: clamp(22px, 2.6vw, 34px);
          font-weight: 900;
          color: #f0f0f0;
          letter-spacing: -0.03em;
          line-height: 1.15;
          text-align: center;
        }
        .ix-section-sub {
          margin: 14px auto 0;
          font-size: clamp(13px, 1vw, 15px);
          color: rgba(255,255,255,0.48);
          line-height: 1.7;
          text-align: center;
        }

        /* ── Feature grid ───────────────────────────────────────────────────── */
        .ix-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .ix-feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 18px 16px;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .ix-feature-card:hover {
          background: rgba(255,255,255,0.05);
          transform: translateY(-2px);
        }
        .ix-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 9px;
          font-size: 16px;
          margin-bottom: 12px;
        }
        .ix-feature-title {
          margin: 0 0 6px;
          font-size: 14px;
          font-weight: 800;
          color: #ebebeb;
          letter-spacing: -0.01em;
        }
        .ix-feature-copy {
          margin: 0;
          font-size: 12.5px;
          color: rgba(255,255,255,0.46);
          line-height: 1.6;
        }

        /* ── Screenshots desktop grid ───────────────────────────────────────── */
        .ix-shots-grid {
          display: none;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
          align-items: end;
        }
        .ix-shot-wrap { text-align: center; }
        .ix-shot-frame {
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 18px 44px rgba(0,0,0,0.55), 0 3px 12px rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.07);
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .ix-shot-frame:hover {
          transform: translateY(-5px);
          box-shadow: 0 26px 56px rgba(0,0,0,0.65), 0 6px 18px rgba(34,197,94,0.09);
        }
        .ix-shot-img {
          width: 100%;
          height: auto;
          display: block;
        }
        .ix-shot-caption {
          margin: 10px 0 2px;
          font-size: 13px;
          font-weight: 700;
          color: #e8e8e8;
        }
        .ix-shot-sub {
          margin: 0;
          font-size: 11.5px;
          color: rgba(255,255,255,0.38);
        }

        /* ── Screenshots mobile scroll ──────────────────────────────────────── */
        .ix-shots-scroll {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding-bottom: 12px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .ix-shots-scroll::-webkit-scrollbar { display: none; }
        .ix-shots-scroll-item {
          flex: 0 0 clamp(160px, 52vw, 220px);
          scroll-snap-align: start;
          text-align: center;
        }
        .ix-shots-scroll .ix-shot-frame { border-radius: 18px; }

        /* ── Neeko Pro ──────────────────────────────────────────────────────── */
        .ix-pro-section {
          background: ${DARK};
          overflow: hidden;
          position: relative;
        }
        .ix-pro-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 110%, rgba(224,174,45,0.07) 0%, transparent 60%);
          pointer-events: none;
        }
        .ix-pro-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 40px;
          align-items: center;
        }
        .ix-pro-visual { display: flex; justify-content: center; }
        .ix-pro-copy   {}
        .ix-pro-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: ${GOLD};
          background: rgba(224,174,45,0.10);
          border: 1px solid rgba(224,174,45,0.22);
          padding: 5px 14px;
          border-radius: 999px;
          margin-bottom: 18px;
        }
        .ix-pro-feats {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-bottom: 20px;
        }
        .ix-pro-feat {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.78);
        }
        .ix-pro-price {
          margin: 0 0 20px;
          font-size: 22px;
          font-weight: 900;
          color: ${GOLD};
          letter-spacing: -0.02em;
        }

        /* ── Trust ──────────────────────────────────────────────────────────── */
        .ix-trust-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 32px;
          align-items: center;
        }
        .ix-trust-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .ix-trust-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 16px 12px;
          text-align: center;
        }
        .ix-trust-n {
          margin: 0 0 5px;
          font-size: clamp(20px, 2.5vw, 28px);
          font-weight: 900;
          letter-spacing: -0.03em;
        }
        .ix-trust-label {
          margin: 0;
          font-size: 11px;
          color: rgba(255,255,255,0.38);
          line-height: 1.4;
        }

        /* ── CTA section ────────────────────────────────────────────────────── */
        .ix-cta-section {
          background: #060809;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        /* ── Footer ─────────────────────────────────────────────────────────── */
        .ix-footer {
          background: #03050A;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: clamp(28px, 3.5vw, 48px) clamp(20px, 5vw, 64px);
        }
        .ix-footer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 22px;
        }
        .ix-footer-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ix-footer-nav {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
          align-items: center;
        }
        .ix-footer-link {
          font-size: 12px;
          color: rgba(255,255,255,0.36);
          text-decoration: none;
          transition: color 0.15s ease;
          white-space: nowrap;
        }
        .ix-footer-link:hover { color: rgba(255,255,255,0.72); }
        .ix-copyright {
          margin: 0;
          font-size: 11px;
          color: rgba(255,255,255,0.16);
          text-align: center;
        }

        /* ── Mobile ─────────────────────────────────────────────────────────── */
        @media (max-width: 639px) {
          .ix-hero { padding-top: 36px; padding-bottom: 32px; }
          .ix-phone { width: clamp(160px, 62vw, 240px); }
          .ix-hero-inner { gap: 24px; }
          .ix-ctas { flex-direction: column; align-items: flex-start; }
          .ix-ctas .ix-btn-primary { width: 100%; max-width: 320px; justify-content: center; }
          .ix-feature-grid { grid-template-columns: 1fr; gap: 10px; }
          .ix-shots-grid { display: none !important; }
          .ix-trust-stats { grid-template-columns: 1fr; gap: 10px; }
          .ix-trust-inner .ix-h2 { text-align: center; }
          .ix-footer-row { flex-direction: column; align-items: flex-start; }
          .ix-pro-price { font-size: 20px; }
        }

        /* ── Tablet ─────────────────────────────────────────────────────────── */
        @media (min-width: 640px) and (max-width: 1023px) {
          .ix-shots-grid { display: none !important; }
          .ix-trust-stats { grid-template-columns: repeat(3, 1fr); }
          .ix-feature-grid { grid-template-columns: repeat(2, 1fr); }
          .ix-pro-inner { grid-template-columns: 1fr; }
        }

        /* ── Desktop ────────────────────────────────────────────────────────── */
        @media (min-width: 1024px) {
          .ix-hero-inner {
            grid-template-columns: 1fr auto;
            gap: 80px;
          }
          .ix-hero-visual { order: 1; }
          .ix-hero-text   { order: -1; }
          .ix-phone {
            width: clamp(260px, 20vw, 320px);
            animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.55s forwards, ixFloat 4.5s ease-in-out 1.4s infinite;
          }
          .ix-shots-grid   { display: grid !important; }
          .ix-shots-scroll { display: none; }
          .ix-pro-inner { grid-template-columns: auto 1fr; gap: 60px; }
          .ix-pro-visual .ix-shot-frame { max-width: 260px; }
          .ix-trust-inner { grid-template-columns: 1fr 1fr; }
          .ix-trust-stats { grid-template-columns: 1fr; gap: 10px; }
          .ix-trust-card {
            display: flex;
            align-items: center;
            gap: 14px;
            text-align: left;
          }
          .ix-trust-n { font-size: clamp(18px, 1.8vw, 24px); margin-bottom: 0; }
        }
      `}</style>
    </div>
  );
}
