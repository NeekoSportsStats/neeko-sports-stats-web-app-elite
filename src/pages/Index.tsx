import { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { APP_STORE_URL } from "@/constants/appStore";

const DARK  = "#07090C";
const GOLD  = "#E0AE2D";
const TEAL  = "#22c55e";
const APP_STORE = APP_STORE_URL;

const APPLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const FEATURES = [
  {
    label: "Match Boards",
    copy:  "Player lines, hit rates and recent form across every stat in one view.",
    stat:  "Round-by-round",
    color: TEAL,
    icon:  "▦",
  },
  {
    label: "Player Profiles",
    copy:  "Season averages, recent results, trend charts and hit-rate lines by stat.",
    stat:  "600+ players",
    color: GOLD,
    icon:  "◎",
  },
  {
    label: "Team Trends",
    copy:  "Compare scoring, defence and last-5 form across every AFL team.",
    stat:  "All 18 teams",
    color: "#60a5fa",
    icon:  "◉",
  },
  {
    label: "Neeko Pro",
    copy:  "Full-round boards, all stat lenses, matchup compare and fine thresholds.",
    stat:  "$9.99/month",
    color: GOLD,
    icon:  "◆",
  },
];

const SCREENSHOTS = [
  { src: "/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_14_PM_(2).png", caption: "AFL Stat Board",    sub: "Hit rates & form by match" },
  { src: "/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_15_PM_(5).png", caption: "Player Profile",   sub: "Trends, averages & history" },
  { src: "/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_14_PM_(3).png", caption: "Hit Rate Builder", sub: "Deep stat lens & thresholds" },
  { src: "/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_15_PM_(4).png", caption: "Team Trends",      sub: "Ladder, scoring & form" },
];

const PRO_FEATURES = [
  "Every match board this round",
  "All six stat lenses: disposals, goals, marks, tackles, kicks and fantasy",
  "Full hit-rate lines and fine thresholds",
  "Matchup Compare access",
  "Team and match context",
];

function useReveal() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      el.querySelectorAll<HTMLElement>(".reveal").forEach(n => {
        n.style.opacity = "1";
        n.style.transform = "none";
      });
      return;
    }

    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("revealed");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    el.querySelectorAll<HTMLElement>(".reveal").forEach(n => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  return ref;
}

export default function Index() {
  const featRef  = useReveal() as React.RefObject<HTMLElement>;
  const proRef   = useReveal() as React.RefObject<HTMLElement>;
  const trustRef = useReveal() as React.RefObject<HTMLElement>;

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

            <div className="ix-chips">
              <span className="ix-chip">600+ players</span>
              <span className="ix-chip">Refreshed every morning during the season</span>
              <span className="ix-chip">Stats research only</span>
            </div>
          </div>

          {/* 3-phone layered composition */}
          <div className="ix-hero-visual" aria-hidden="true">
            <div className="ix-phone-stack">
              {/* Left rear — Combo Tracker */}
              <div className="ix-phone ix-phone-left">
                <img
                  src="/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_17_PM_(6).png"
                  alt="Neeko Stats Combo Tracker showing multi-leg hit rates"
                  className="ix-phone-img"
                  loading="lazy"
                  width="928"
                  height="1160"
                />
              </div>
              {/* Centre front — Home screen */}
              <div className="ix-phone ix-phone-center">
                <img
                  src="/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_13_PM_(1).png"
                  alt="Neeko Stats home screen showing round stat lines and match boards"
                  className="ix-phone-img"
                  loading="eager"
                  width="928"
                  height="1160"
                />
              </div>
              {/* Right rear — More / Pro overview */}
              <div className="ix-phone ix-phone-right">
                <img
                  src="/images/app-screenshots/ChatGPT_Image_Jul_7,_2026,_02_40_18_PM_(7).png"
                  alt="Neeko Stats Pro overview screen"
                  className="ix-phone-img"
                  loading="lazy"
                  width="928"
                  height="1160"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT'S INSIDE ────────────────────────────────────────────────────── */}
      <section id="features" className="ix-section" style={{ background: "#060809", scrollMarginTop: 74 }} ref={featRef as React.RefObject<HTMLElement>}>
        <div className="ix-container">
          <div className="ix-section-head reveal" style={{ "--delay": "0s" } as React.CSSProperties}>
            <p className="ix-label">What's Inside</p>
            <h2 className="ix-h2">Everything before lockout.</h2>
          </div>

          <div className="ix-feature-grid">
            {FEATURES.map(({ label, copy, stat, color, icon }, i) => (
              <div
                key={label}
                className="ix-feature-card reveal"
                style={{ borderColor: `${color}1e`, "--delay": `${0.08 + i * 0.08}s` } as React.CSSProperties}
              >
                <div className="ix-feature-icon" style={{ color, background: `${color}12` }}>{icon}</div>
                <div className="ix-feature-header">
                  <p className="ix-feature-title">{label}</p>
                  <span className="ix-feature-stat" style={{ color }}>{stat}</span>
                </div>
                <p className="ix-feature-copy">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCREENSHOTS ─────────────────────────────────────────────────────── */}
      <section className="ix-marquee-section" aria-label="App screenshots">
        {/* Mobile / tablet: auto-scroll marquee */}
        <div className="ix-marquee-track" aria-hidden="true">
          {[...SCREENSHOTS, ...SCREENSHOTS].map(({ src, caption, sub }, i) => (
            <div key={i} className="ix-marquee-item">
              <div className="ix-shot-frame">
                <img src={src} alt={caption} className="ix-shot-img" loading="lazy" width="928" height="1160" />
              </div>
              <p className="ix-shot-caption">{caption}</p>
              <p className="ix-shot-sub">{sub}</p>
            </div>
          ))}
        </div>

        {/* Desktop: static premium gallery (4 screenshots, centred) */}
        <div className="ix-screenshot-grid ix-container">
          {SCREENSHOTS.slice(0, 4).map(({ src, caption, sub }) => (
            <div key={caption} className="ix-shot-grid-item">
              <div className="ix-shot-frame">
                <img src={src} alt={caption} className="ix-shot-img" loading="lazy" width="928" height="1160" />
              </div>
              <p className="ix-shot-caption">{caption}</p>
              <p className="ix-shot-sub">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── NEEKO PRO ────────────────────────────────────────────────────────── */}
      <section id="neeko-pro" className="ix-section ix-pro-section" style={{ scrollMarginTop: 74 }} ref={proRef as React.RefObject<HTMLElement>}>
        <div className="ix-pro-glow" aria-hidden="true" />
        <div className="ix-container" style={{ position: "relative" }}>
          <div className="ix-pro-centered reveal" style={{ "--delay": "0.10s" } as React.CSSProperties}>
            <div className="ix-pro-card-inner">
              <div className="ix-pro-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill={GOLD} aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Neeko Pro
              </div>
              <h2 className="ix-h2 ix-pro-heading">
                Unlock every{" "}
                <span style={{ color: GOLD }}>match board.</span>
              </h2>
              <p className="ix-pro-desc">
                Full-round access — every stat lens, fine-line thresholds, matchup compare and team context. Everything you need before lockout.
              </p>

              <div className="ix-pro-feats">
                {PRO_FEATURES.map((f, i) => (
                  <div key={f} className="ix-pro-feat" style={{ transitionDelay: `${0.25 + i * 0.05}s` }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <polyline points="2,8 6,12 14,4" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>

              <div className="ix-pro-price-row">
                <p className="ix-pro-price">$9.99</p>
                <span className="ix-pro-period">/ month</span>
              </div>

              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="ix-btn-primary ix-pro-cta">
                {APPLE_ICON}
                Download on the App Store
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ────────────────────────────────────────────────────────────── */}
      <section className="ix-section" style={{ background: "#060809" }} ref={trustRef as React.RefObject<HTMLElement>}>
        <div className="ix-container">
          <div className="ix-trust-inner">
            <div className="ix-trust-text reveal" style={{ "--delay": "0s" } as React.CSSProperties}>
              <p className="ix-label">For AFL stats research</p>
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
            <div className="ix-trust-stats reveal" style={{ "--delay": "0.12s" } as React.CSSProperties}>
              {[
                { n: "600+",   label: "AFL players tracked",  color: TEAL    },
                { n: "18",     label: "teams, all positions", color: GOLD    },
                { n: "iOS",    label: "native iPhone app",    color: "#60a5fa" },
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
      <section className="ix-section ix-cta-section" style={{ paddingBottom: "max(48px, env(safe-area-inset-bottom, 48px))" }}>
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
              <img src="/logo.png" alt="Neeko Stats" style={{ height: 20, width: "auto", opacity: 0.75 }} />
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
                AFL stats for iPhone.
              </p>
            </div>
            <nav className="ix-footer-nav" aria-label="Footer navigation">
              {[
                { label: "Policies", to: "/policies"      },
                { label: "Privacy",  to: "/privacy-policy" },
                { label: "Contact",  to: "/contact"        },
                { label: "About",    to: "/about"          },
              ].map(({ label, to }) => (
                <Link key={to} to={to} className="ix-footer-link">{label}</Link>
              ))}
            </nav>
          </div>
          <p className="ix-copyright">&copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.</p>
        </div>
      </footer>

      <style>{`
        /* ── Scroll reveal ──────────────────────────────────────────────────── */
        .reveal {
          opacity: 0;
          transform: translateY(22px);
          transition:
            opacity 0.55s cubic-bezier(0.22,1,0.36,1) var(--delay, 0s),
            transform 0.55s cubic-bezier(0.22,1,0.36,1) var(--delay, 0s);
        }
        .reveal.revealed {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        }

        /* ── Hero entry animations ──────────────────────────────────────────── */
        @keyframes ixFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ixFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes ixMarquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        .ix-eyebrow {
          margin: 0 0 16px;
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
          margin: 0 0 16px;
          font-size: clamp(34px, 5.5vw, 68px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.04em;
          color: #f4f4f4;
          opacity: 0;
          animation: ixFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.15s forwards;
        }
        .ix-sub {
          margin: 0 0 24px;
          font-size: clamp(15px, 1.2vw, 17px);
          color: rgba(255,255,255,0.60);
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

        /* ── Trust chips ────────────────────────────────────────────────────── */
        .ix-chips {
          display: flex;
          flex-wrap: nowrap;
          gap: 6px;
          margin-top: 18px;
          opacity: 0;
          animation: ixFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.52s forwards;
          overflow: hidden;
        }
        .ix-chip {
          font-size: 10.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.44);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── Button ─────────────────────────────────────────────────────────── */
        .ix-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%);
          color: #07090C;
          font-weight: 800;
          font-size: clamp(13px, 1vw, 15px);
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
          padding: clamp(36px, 6vw, 72px) clamp(20px, 5vw, 64px) 0;
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
          gap: 0;
          align-items: end;
        }
        .ix-hero-text   { padding-bottom: clamp(24px, 4vw, 40px); }
        .ix-hero-visual { display: flex; justify-content: center; }

        /* ── 3-phone stack ──────────────────────────────────────────────────── */
        .ix-phone-stack {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: flex-end;
          width: clamp(260px, 80vw, 420px);
          height: clamp(260px, 68vw, 480px);
          opacity: 0;
          animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.60s forwards;
        }
        .ix-phone {
          position: absolute;
          bottom: 0;
        }
        .ix-phone-center {
          width: clamp(120px, 36vw, 180px);
          z-index: 3;
          left: 50%;
          transform: translateX(-50%);
          filter: drop-shadow(0 -6px 32px rgba(34,197,94,0.15)) drop-shadow(0 20px 48px rgba(0,0,0,0.65));
        }
        .ix-phone-left {
          width: clamp(88px, 26vw, 130px);
          z-index: 2;
          left: 0;
          transform: translateX(-4%) rotate(-6deg);
          transform-origin: bottom center;
          filter: brightness(0.62) drop-shadow(0 16px 32px rgba(0,0,0,0.55));
        }
        .ix-phone-right {
          width: clamp(88px, 26vw, 130px);
          z-index: 2;
          right: 0;
          transform: translateX(4%) rotate(6deg);
          transform-origin: bottom center;
          filter: brightness(0.62) drop-shadow(0 16px 32px rgba(0,0,0,0.55));
        }
        .ix-phone-img {
          width: 100%;
          height: auto;
          display: block;
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
          margin-bottom: clamp(28px, 4vw, 48px);
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
          margin: 12px auto 0;
          font-size: clamp(13px, 1vw, 15px);
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
          text-align: center;
        }

        /* ── Feature grid ───────────────────────────────────────────────────── */
        .ix-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .ix-feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 16px 14px;
          transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .ix-feature-card:hover {
          background: rgba(255,255,255,0.055);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.30);
        }
        .ix-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          font-size: 15px;
          margin-bottom: 10px;
        }
        .ix-feature-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .ix-feature-title {
          margin: 0;
          font-size: 13.5px;
          font-weight: 800;
          color: #ebebeb;
          letter-spacing: -0.01em;
        }
        .ix-feature-stat {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.01em;
          white-space: nowrap;
          opacity: 0.80;
        }
        .ix-feature-copy {
          margin: 0;
          font-size: 12px;
          color: rgba(255,255,255,0.44);
          line-height: 1.6;
        }

        /* ── Screenshots ────────────────────────────────────────────────────── */
        .ix-marquee-section {
          background: #060809;
          padding: clamp(28px, 3.5vw, 56px) 0;
          overflow: hidden;
        }
        /* Marquee: visible only on mobile/tablet (<1024px) */
        .ix-marquee-track {
          display: flex;
          gap: 16px;
          width: max-content;
          animation: ixMarquee 42s linear infinite;
        }
        .ix-marquee-section:hover .ix-marquee-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ix-marquee-track {
            animation: none !important;
          }
          .ix-marquee-section {
            overflow-x: auto;
            scrollbar-width: none;
          }
          .ix-marquee-section::-webkit-scrollbar { display: none; }
        }
        .ix-marquee-item {
          flex: 0 0 auto;
          width: clamp(130px, 22vw, 190px);
          text-align: center;
        }
        /* Static desktop grid: hidden by default, shown on desktop */
        .ix-screenshot-grid {
          display: none;
        }
        .ix-shot-grid-item {
          text-align: center;
        }
        .ix-shot-frame {
          box-shadow: 0 18px 44px rgba(0,0,0,0.55), 0 3px 12px rgba(0,0,0,0.35);
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .ix-marquee-section:hover .ix-shot-frame:hover {
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

        /* ── Neeko Pro ──────────────────────────────────────────────────────── */
        .ix-pro-section {
          background: ${DARK};
          overflow: hidden;
          position: relative;
        }
        .ix-pro-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 110%, rgba(224,174,45,0.08) 0%, transparent 60%);
          pointer-events: none;
        }
        .ix-pro-centered {
          max-width: 600px;
          margin: 0 auto;
        }
        .ix-pro-card-inner {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(224,174,45,0.15);
          border-radius: 20px;
          padding: clamp(24px, 3.5vw, 44px);
          box-shadow: 0 0 0 1px rgba(224,174,45,0.06), 0 24px 56px rgba(0,0,0,0.40);
        }
        .ix-pro-heading {
          text-align: left;
          margin-bottom: 12px;
          font-size: clamp(22px, 2.4vw, 32px);
        }
        .ix-pro-desc {
          font-size: 15px;
          color: rgba(255,255,255,0.55);
          line-height: 1.65;
          margin: 0 0 22px;
        }
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
          margin-bottom: 16px;
        }
        .ix-pro-feats {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-bottom: 22px;
        }
        .ix-pro-feat {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.78);
        }
        .ix-pro-price-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 20px;
        }
        .ix-pro-price {
          margin: 0;
          font-size: 32px;
          font-weight: 900;
          color: ${GOLD};
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .ix-pro-period {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.40);
        }
        .ix-pro-cta {
          width: 100%;
          justify-content: center;
          box-sizing: border-box;
        }

        /* ── Trust ──────────────────────────────────────────────────────────── */
        .ix-trust-inner {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          align-items: center;
        }
        .ix-trust-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
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
          border-top: 1px solid rgba(255,255,255,0.07);
          padding: clamp(20px, 2.5vw, 36px) clamp(20px, 5vw, 64px);
          padding-bottom: calc(clamp(20px, 2.5vw, 36px) + env(safe-area-inset-bottom, 0px));
        }
        .ix-footer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          margin-bottom: 14px;
        }
        .ix-footer-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ix-footer-nav {
          display: grid;
          grid-template-columns: repeat(2, auto);
          gap: 8px 24px;
          align-items: center;
        }
        .ix-footer-link {
          font-size: 12px;
          color: rgba(255,255,255,0.48);
          text-decoration: none;
          transition: color 0.15s ease;
          white-space: nowrap;
          padding: 4px 0;
        }
        .ix-footer-link:hover { color: rgba(255,255,255,0.75); }
        .ix-copyright {
          margin: 0;
          font-size: 10.5px;
          color: rgba(255,255,255,0.14);
          text-align: center;
        }

        /* ── Mobile ─────────────────────────────────────────────────────────── */
        @media (max-width: 639px) {
          .ix-hero { padding-top: 24px; }
          .ix-phone-stack {
            width: clamp(240px, 88vw, 340px);
            height: clamp(220px, 62vw, 380px);
          }
          .ix-phone-center { width: clamp(108px, 34vw, 156px); }
          .ix-phone-left,
          .ix-phone-right  { width: clamp(78px, 24vw, 112px); }
          .ix-ctas { flex-direction: column; align-items: stretch; }
          .ix-ctas .ix-btn-primary { justify-content: center; }
          .ix-feature-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .ix-feature-card { padding: 12px; }
          .ix-feature-icon { width: 30px; height: 30px; font-size: 13px; margin-bottom: 8px; }
          .ix-trust-stats { grid-template-columns: 1fr; gap: 8px; }
          .ix-trust-inner .ix-h2 { text-align: center; }
          .ix-footer-row { flex-direction: column; align-items: center; gap: 12px; }
          .ix-footer-nav { grid-template-columns: repeat(2, auto); gap: 8px 28px; justify-items: center; }
          .ix-pro-price { font-size: 26px; }
          .ix-marquee-item { width: clamp(120px, 36vw, 170px); }
        }

        /* ── Tablet ─────────────────────────────────────────────────────────── */
        @media (min-width: 640px) and (max-width: 1023px) {
          .ix-trust-stats { grid-template-columns: repeat(3, 1fr); }
          .ix-feature-grid { grid-template-columns: repeat(2, 1fr); }
          .ix-marquee-item { width: clamp(150px, 24vw, 200px); }
        }

        /* ── Desktop ────────────────────────────────────────────────────────── */
        @media (min-width: 1024px) {
          .ix-hero { padding-bottom: 0; }
          .ix-footer-nav { grid-template-columns: repeat(4, auto); gap: 0 18px; }
          .ix-hero-inner {
            grid-template-columns: 1fr auto;
            gap: 80px;
            align-items: end;
          }
          .ix-hero-text   { order: -1; padding-bottom: clamp(40px, 5vw, 72px); }
          .ix-hero-visual { order: 1; }
          .ix-phone-stack {
            width: clamp(360px, 28vw, 460px);
            height: clamp(380px, 36vw, 520px);
            animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.55s forwards, ixFloat 5s ease-in-out 1.4s infinite;
          }
          .ix-phone-center { width: clamp(160px, 14vw, 210px); }
          .ix-phone-left,
          .ix-phone-right  { width: clamp(110px, 10vw, 148px); }
          .ix-trust-inner { grid-template-columns: 1fr 1fr; }
          .ix-trust-stats { grid-template-columns: 1fr; gap: 10px; }
          .ix-trust-card {
            display: flex;
            align-items: center;
            gap: 14px;
            text-align: left;
          }
          .ix-trust-n { font-size: clamp(18px, 1.8vw, 24px); margin-bottom: 0; }
          /* Desktop screenshots: hide carousel, show static grid */
          .ix-marquee-section { padding: clamp(28px, 3.5vw, 56px) clamp(20px, 5vw, 64px); overflow: visible; }
          .ix-marquee-track { display: none !important; }
          .ix-screenshot-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 18px;
            margin: 0 auto;
          }
          .ix-shot-grid-item .ix-shot-frame {
            transition: transform 0.25s ease, box-shadow 0.25s ease;
          }
          .ix-shot-grid-item:hover .ix-shot-frame {
            transform: translateY(-6px);
            box-shadow: 0 28px 60px rgba(0,0,0,0.68), 0 6px 20px rgba(34,197,94,0.10);
          }
        }
      `}</style>
    </div>
  );
}
