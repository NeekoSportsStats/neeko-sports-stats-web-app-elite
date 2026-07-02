import { Helmet } from "react-helmet-async";

const DARK  = "#07090C";
const GOLD  = "#E0AE2D";
const TEAL  = "#22c55e";
const APP_STORE = "https://apps.apple.com/au/app/neeko-stats/id6744005975";

const APPLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const FEATURES = [
  {
    icon: "▦",
    color: TEAL,
    label: "Match Boards",
    copy: "Every player in a game, side by side. Hit rates, recent form and stat lines — before lockout.",
  },
  {
    icon: "◎",
    color: GOLD,
    label: "Player Profiles",
    copy: "Season averages, round-by-round trends, hit-rate lines and recent form for 600+ AFL players.",
  },
  {
    icon: "◉",
    color: "#60a5fa",
    label: "Team Trends",
    copy: "Compare scoring, defence and last-5 form across all 18 AFL teams in one place.",
  },
  {
    icon: "◆",
    color: GOLD,
    label: "Neeko Pro",
    copy: "Full-round boards, all stat lenses, fine-line thresholds and matchup compare — fully unlocked.",
  },
];

const PRO_FEATURES = [
  "Every match board this round",
  "All stat lenses — disposals, goals, marks, tackles",
  "Full hit-rate lines and fine thresholds",
  "Matchup Compare access",
  "Team and match context",
];

export default function About() {
  return (
    <div style={{ background: DARK, color: "#f0f0f0", overflowX: "hidden" }}>
      <Helmet>
        <title>About Neeko Stats | AFL Stats App for iPhone</title>
        <meta name="description" content="Neeko Stats is the AFL stats app for iPhone. Player hit rates, match boards, team form and recent trends — built for research before the bounce." />
        <link rel="canonical" href="https://neekostats.com.au/about" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/about" />
        <meta property="og:title" content="About Neeko Stats | AFL Stats App for iPhone" />
        <meta property="og:description" content="Neeko Stats is the AFL stats app for iPhone. Player hit rates, match boards, team form and recent trends — built for research before the bounce." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="ab-hero">
        <div className="ab-glow" aria-hidden="true" />
        <div className="ab-container ab-hero-inner">
          <p className="ab-eyebrow">About Neeko Stats</p>
          <h1 className="ab-h1">
            AFL stats for iPhone.<br />
            <span style={{ color: GOLD }}>Built for research.</span>
          </h1>
          <p className="ab-sub">
            Neeko Stats gives AFL fans fast access to player hit rates, match boards, team form and matchup context — all on iPhone, before lockout.
          </p>
          <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ab-btn-primary">
            {APPLE_ICON}
            Download on the App Store
          </a>
          <div className="ab-chips">
            <span className="ab-chip">600+ players</span>
            <span className="ab-chip">All 18 teams</span>
            <span className="ab-chip">Stats research only</span>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section className="ab-section" style={{ background: "#060809" }}>
        <div className="ab-container">
          <div className="ab-section-head">
            <p className="ab-label">What's inside</p>
            <h2 className="ab-h2">Everything before lockout.</h2>
            <p className="ab-section-sub">Four core tools, all on your iPhone — no browser needed, no juggling tabs.</p>
          </div>
          <div className="ab-feature-grid">
            {FEATURES.map(({ icon, color, label, copy }) => (
              <div key={label} className="ab-feature-card" style={{ borderColor: `${color}1e` }}>
                <div className="ab-feature-icon" style={{ color, background: `${color}12` }}>{icon}</div>
                <p className="ab-feature-title">{label}</p>
                <p className="ab-feature-copy">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEEKO PRO ───────────────────────────────────────────────────────── */}
      <section className="ab-section ab-pro-section">
        <div className="ab-pro-glow" aria-hidden="true" />
        <div className="ab-container" style={{ position: "relative" }}>
          <div className="ab-pro-centered">
            <div className="ab-pro-card">
              <div className="ab-pro-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Neeko Pro
              </div>
              <h2 className="ab-h2" style={{ textAlign: "left", marginBottom: 10, fontSize: "clamp(22px, 2.4vw, 32px)" }}>
                Unlock every{" "}
                <span style={{ color: GOLD }}>match board.</span>
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, margin: "0 0 22px" }}>
                Full-round access — every stat lens, fine-line thresholds, matchup compare and team context. Everything you need before lockout.
              </p>
              <div className="ab-pro-feats">
                {PRO_FEATURES.map(f => (
                  <div key={f} className="ab-pro-feat">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <polyline points="2,8 6,12 14,4" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: GOLD, letterSpacing: "-0.03em", lineHeight: 1 }}>$9.99</p>
                <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.40)" }}>/ month · billed via Apple</span>
              </div>
              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ab-btn-primary ab-pro-cta">
                {APPLE_ICON}
                Download on the App Store
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ───────────────────────────────────────────────────────────── */}
      <section className="ab-section" style={{ background: "#060809" }}>
        <div className="ab-container">
          <div className="ab-trust-inner">
            <div className="ab-trust-text">
              <p className="ab-label">For AFL stats research</p>
              <h2 className="ab-h2" style={{ textAlign: "left", marginBottom: 14 }}>
                Stats and research.<br />Nothing else.
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: 0 }}>
                Neeko Stats surfaces AFL hit rates, form data and matchup context for research and entertainment purposes.
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", lineHeight: 1.65, marginTop: 14 }}>
                Neeko Stats does not provide betting tips, does not partner with any bookmaker, and does not endorse or encourage gambling.
              </p>
            </div>
            <div className="ab-trust-stats">
              {[
                { n: "600+", label: "AFL players tracked", color: TEAL },
                { n: "18",   label: "teams, all positions", color: GOLD },
                { n: "iOS",  label: "native iPhone app",   color: "#60a5fa" },
              ].map(({ n, label, color }) => (
                <div key={n} className="ab-trust-card">
                  <p className="ab-trust-n" style={{ color }}>{n}</p>
                  <p className="ab-trust-label">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ─────────────────────────────────────────────────────────── */}
      <section className="ab-section">
        <div className="ab-container">
          <div className="ab-contact-card">
            <p className="ab-label" style={{ marginBottom: 10 }}>Get in touch</p>
            <h2 className="ab-h2" style={{ textAlign: "left", marginBottom: 10, fontSize: "clamp(20px, 2.2vw, 28px)" }}>
              Questions or feedback?
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, marginBottom: 22 }}>
              Based in Melbourne, Victoria, Australia.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <a
                href="mailto:matthew@neekostats.com.au"
                className="ab-contact-link"
              >
                matthew@neekostats.com.au
              </a>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .ab-container {
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
        }
        .ab-section {
          padding: clamp(48px, 5.5vw, 88px) clamp(20px, 5vw, 64px);
        }
        .ab-section-head {
          text-align: center;
          margin-bottom: clamp(28px, 4vw, 52px);
        }
        .ab-label {
          margin: 0 0 10px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.28);
        }
        .ab-h1 {
          margin: 0 0 18px;
          font-size: clamp(30px, 4.5vw, 58px);
          font-weight: 900;
          line-height: 1.08;
          letter-spacing: -0.04em;
          color: #f4f4f4;
        }
        .ab-h2 {
          margin: 0;
          font-size: clamp(22px, 2.6vw, 34px);
          font-weight: 900;
          color: #f0f0f0;
          letter-spacing: -0.03em;
          line-height: 1.15;
          text-align: center;
        }
        .ab-sub {
          margin: 0 0 28px;
          font-size: clamp(14px, 1.1vw, 17px);
          color: rgba(255,255,255,0.58);
          line-height: 1.65;
          max-width: 560px;
        }
        .ab-section-sub {
          margin: 12px auto 0;
          font-size: clamp(13px, 1vw, 15px);
          color: rgba(255,255,255,0.40);
          line-height: 1.7;
          max-width: 520px;
        }
        .ab-eyebrow {
          margin: 0 0 16px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.44em;
          text-transform: uppercase;
          color: ${TEAL};
        }

        /* Hero */
        .ab-hero {
          position: relative;
          overflow: hidden;
          padding: clamp(48px, 7vw, 96px) clamp(20px, 5vw, 64px) clamp(48px, 6vw, 80px);
        }
        .ab-glow {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 65% 55% at 30% -5%, rgba(34,197,94,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 45% 35% at 80% 55%, rgba(224,174,45,0.06) 0%, transparent 55%);
          pointer-events: none;
        }
        .ab-hero-inner {
          position: relative;
          max-width: 720px;
        }

        /* Chips */
        .ab-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 20px;
        }
        .ab-chip {
          font-size: 10.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.44);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }

        /* Button */
        .ab-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%);
          color: #07090C;
          font-weight: 800;
          font-size: clamp(13px, 1vw, 15px);
          padding: 13px 24px;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 24px rgba(224,174,45,0.28), 0 3px 10px rgba(0,0,0,0.45);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          white-space: nowrap;
        }
        .ab-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(224,174,45,0.40), 0 3px 10px rgba(0,0,0,0.45);
        }

        /* Feature grid */
        .ab-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .ab-feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 20px 18px;
          transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .ab-feature-card:hover {
          background: rgba(255,255,255,0.055);
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.30);
        }
        .ab-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 17px;
          margin-bottom: 12px;
        }
        .ab-feature-title {
          margin: 0 0 7px;
          font-size: 15px;
          font-weight: 800;
          color: #ebebeb;
          letter-spacing: -0.01em;
        }
        .ab-feature-copy {
          margin: 0;
          font-size: 13px;
          color: rgba(255,255,255,0.46);
          line-height: 1.65;
        }

        /* Pro section */
        .ab-pro-section {
          background: ${DARK};
          overflow: hidden;
          position: relative;
        }
        .ab-pro-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 110%, rgba(224,174,45,0.08) 0%, transparent 60%);
          pointer-events: none;
        }
        .ab-pro-centered {
          max-width: 600px;
          margin: 0 auto;
        }
        .ab-pro-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(224,174,45,0.15);
          border-radius: 20px;
          padding: clamp(24px, 3.5vw, 44px);
          box-shadow: 0 0 0 1px rgba(224,174,45,0.06), 0 24px 56px rgba(0,0,0,0.40);
        }
        .ab-pro-badge {
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
          margin-bottom: 16px;
        }
        .ab-pro-feats {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-bottom: 22px;
        }
        .ab-pro-feat {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.78);
        }
        .ab-pro-cta {
          width: 100%;
          justify-content: center;
          box-sizing: border-box;
        }

        /* Trust */
        .ab-trust-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          align-items: center;
        }
        .ab-trust-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .ab-trust-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 16px 12px;
          text-align: center;
        }
        .ab-trust-n {
          margin: 0 0 5px;
          font-size: clamp(20px, 2.5vw, 28px);
          font-weight: 900;
          letter-spacing: -0.03em;
        }
        .ab-trust-label {
          margin: 0;
          font-size: 11px;
          color: rgba(255,255,255,0.38);
          line-height: 1.4;
        }

        /* Contact */
        .ab-contact-card {
          max-width: 600px;
          margin: 0 auto;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: clamp(24px, 3.5vw, 44px);
        }
        .ab-contact-link {
          font-size: 14px;
          font-weight: 700;
          color: rgba(255,255,255,0.72);
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.15s;
        }
        .ab-contact-link:hover { color: #f0f0f0; }

        /* Mobile */
        @media (max-width: 639px) {
          .ab-feature-grid { grid-template-columns: 1fr; gap: 10px; }
          .ab-feature-card { padding: 16px 14px; }
          .ab-trust-stats { grid-template-columns: 1fr; gap: 8px; }
          .ab-trust-inner .ab-h2 { text-align: center; }
        }

        /* Desktop */
        @media (min-width: 1024px) {
          .ab-feature-grid { grid-template-columns: repeat(4, 1fr); }
          .ab-trust-inner { grid-template-columns: 1fr 1fr; }
          .ab-trust-stats { grid-template-columns: 1fr; gap: 10px; }
          .ab-trust-card {
            display: flex;
            align-items: center;
            gap: 14px;
            text-align: left;
          }
          .ab-trust-n { font-size: clamp(18px, 1.8vw, 24px); margin-bottom: 0; }
        }
      `}</style>
    </div>
  );
}
