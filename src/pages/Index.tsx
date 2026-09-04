import { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { IOS_URL, ANDROID_URL } from "@/config/stores";

const DARK  = "#07090C";
const GOLD  = "#E0AE2D";
const TEAL  = "#22c55e";

function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={className} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <a href={IOS_URL} target="_blank" rel="noopener noreferrer">
        <img
          src="/images/app-store-badge.svg"
          alt="Download on the App Store"
          height="48"
          style={{ height: 48, width: "auto", display: "block" }}
        />
      </a>
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer">
        <img
          src="/images/GetItOnGooglePlay_Badge_Web_color_English.png"
          alt="Get it on Google Play"
          height="48"
          style={{ height: 48, width: "auto", display: "block" }}
        />
      </a>
    </div>
  );
}

const FEATURES = [
  {
    label: "Three sports, one app",
    copy:  "Follow the AFL season and finals, the NBA regular season, and every Premier League matchweek. Switch sports in a tap.",
    stat:  "AFL · NBA · EPL",
    color: TEAL,
    icon:  "▦",
  },
  {
    label: "Match boards",
    copy:  "Every fixture in the round with the players involved and their recent output.",
    stat:  "Round-by-round",
    color: GOLD,
    icon:  "◆",
  },
  {
    label: "Player form and hit rates",
    copy:  "See how often a player has reached a statistical mark across recent games. Disposals, goals, points, rebounds, assists, shots, tackles — laid out clearly.",
    stat:  "Every player",
    color: TEAL,
    icon:  "◎",
  },
  {
    label: "Hit Rate Builder",
    copy:  "Pick a player, a stat and a threshold. See the history behind it, game by game, including against the same opponent.",
    stat:  "Any player, any mark",
    color: "#60a5fa",
    icon:  "◉",
  },
  {
    label: "Trend Stacks",
    copy:  "Combine players and stats into a single view to compare form side by side.",
    stat:  "Up to six players",
    color: GOLD,
    icon:  "◎",
  },
  {
    label: "Fantasy HQ (AFL)",
    copy:  "Breakevens, price changes and projections for AFL Fantasy coaches, through the season.",
    stat:  "AFL Fantasy",
    color: "#60a5fa",
    icon:  "▦",
  },
];

const SCREENSHOTS = [
  { src: "/images/app-screenshots/01-afl-home.png", caption: "AFL Home", sub: "Fixtures, watchlist and form",
    alt: "Neeko Stats AFL home screen" },
  { src: "/images/app-screenshots/02-afl-board.png", caption: "AFL Match Board", sub: "Player hit rates by fixture",
    alt: "AFL match board with player hit rates" },
  { src: "/images/app-screenshots/03-builder-afl.png", caption: "Hit Rate Builder", sub: "Any player, any mark",
    alt: "Hit Rate Builder for an AFL player" },
  { src: "/images/app-screenshots/04-epl-board.png", caption: "Premier League Board", sub: "Matchweek stats",
    alt: "Premier League match board" },
  { src: "/images/app-screenshots/05-builder.png", caption: "Hit Rate Builder", sub: "NBA player thresholds",
    alt: "Hit Rate Builder for an NBA player" },
  { src: "/images/app-screenshots/06-player-profile.png", caption: "Player Profile", sub: "Career and form",
    alt: "AFL player profile" },
];

const PRO_FEATURES = [
  "Every match board, every round",
  "Every stat lens across all three sports",
  "Fantasy HQ — breakevens, price changes and projections",
  "Hit Rate Builder and Trend Stacks for every player",
  "Trend Stacks up to six legs",
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
        <title>Neeko Stats — AFL, NBA & EPL player stats app</title>
        <meta name="description" content="Player stats, hit rates, match boards, Builder and Trend Stacks for AFL, NBA and the English Premier League. Independent, no ads." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Stats — AFL, NBA & EPL player stats app" />
        <meta property="og:description" content="Player stats, hit rates, match boards, Builder and Trend Stacks for AFL, NBA and the English Premier League. Independent, no ads." />
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
            <p className="ix-eyebrow">NOW ON iOS AND ANDROID</p>
            <h1 className="ix-h1">
              AFL, NBA and Premier League{" "}
              <span style={{ color: GOLD, textShadow: "0 0 36px rgba(224,174,45,0.32)" }}>
                player stats in one app.
              </span>
            </h1>
            <p className="ix-sub">
              Hit rates, form and trends for every player — built for people who want to understand form, not just read a scoreboard. Independent. No ads.
            </p>

            <div className="ix-ctas">
              <StoreBadges />
            </div>

            <div className="ix-chips">
              <span className="ix-chip">Three sports</span>
              <span className="ix-chip">Refreshed daily in season</span>
              <span className="ix-chip">Stats research only</span>
            </div>
          </div>

          {/* 3-phone layered composition */}
          <div className="ix-hero-visual" aria-hidden="true">
            <div className="ix-phone-stack">
              {/* Left rear — Home screen */}
              <div className="ix-phone ix-phone-left">
                <img
                  src="/images/app-screenshots/01-afl-home.png"
                  alt="Neeko Stats AFL home screen"
                  className="ix-phone-img"
                  loading="lazy"
                  width="725"
                  height="1568"
                />
              </div>
              {/* Centre front — Round board */}
              <div className="ix-phone ix-phone-center">
                <img
                  src="/images/app-screenshots/02-afl-board.png"
                  alt="AFL match board with player hit rates"
                  className="ix-phone-img"
                  loading="eager"
                  width="725"
                  height="1568"
                />
              </div>
              {/* Right rear — Player profile */}
              <div className="ix-phone ix-phone-right">
                <img
                  src="/images/app-screenshots/06-player-profile.png"
                  alt="AFL player profile"
                  className="ix-phone-img"
                  loading="lazy"
                  width="725"
                  height="1568"
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
          {[...SCREENSHOTS, ...SCREENSHOTS].map(({ src, caption, sub, alt }, i) => (
            <div key={i} className="ix-marquee-item">
              <div className="ix-shot-frame">
                <img src={src} alt={alt} className="ix-shot-img" loading="lazy" width="725" height="1568" />
              </div>
              <p className="ix-shot-caption">{caption}</p>
              <p className="ix-shot-sub">{sub}</p>
            </div>
          ))}
        </div>

        {/* Desktop: static premium gallery (4 screenshots, centred) */}
        <div className="ix-screenshot-grid ix-container">
          {SCREENSHOTS.map(({ src, caption, sub, alt }) => (
            <div key={caption} className="ix-shot-grid-item">
              <div className="ix-shot-frame">
                <img src={src} alt={alt} className="ix-shot-img" loading="lazy" width="725" height="1568" />
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
                Core stats, profiles and Fantasy HQ are free, with a set number of free matches each round and Trend Stacks up to three legs. Neeko Pro unlocks every match and Trend Stacks up to six legs — weekly or monthly, with a free trial on the weekly plan.
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

              <StoreBadges className="ix-pro-cta" />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ────────────────────────────────────────────────────────────── */}
      <section className="ix-section" style={{ background: "#060809" }} ref={trustRef as React.RefObject<HTMLElement>}>
        <div className="ix-container">
          <div className="ix-trust-inner">
            <div className="ix-trust-text reveal" style={{ "--delay": "0s" } as React.CSSProperties}>
              <p className="ix-label">For stats research</p>
              <h2 className="ix-h2" style={{ textAlign: "left", marginBottom: 16 }}>
                Stats and research.<br />Nothing else.
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: 0 }}>
                Neeko Stats is made in Melbourne by one person. It is not affiliated with the AFL, the NBA, the Premier League, or any bookmaker. No ads. No betting content. Research and entertainment only.
              </p>
            </div>
            <div className="ix-trust-stats reveal" style={{ "--delay": "0.12s" } as React.CSSProperties}>
              {[
                { n: "3",     label: "sports in one app",        color: TEAL    },
                { n: "2",     label: "platforms: iOS and Android", color: GOLD    },
                { n: "0",     label: "ads, no bookmakers",        color: "#60a5fa" },
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
            Ready before first bounce.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.48)", marginBottom: 32, lineHeight: 1.6 }}>
            Download Neeko Stats free on iOS or Android. Follow your players, read the free boards, and upgrade to Pro when you're ready.
          </p>
          <StoreBadges className="ix-btn-lg" />
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="ix-footer">
        <div className="ix-container">
          <div className="ix-footer-row">
            <div className="ix-footer-brand">
              <img src="/logo.png" alt="Neeko Stats" style={{ height: 20, width: "auto", opacity: 0.75 }} />
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
                AFL, NBA and Premier League stats. Made in Melbourne by Matthew Nixon.
              </p>
            </div>
            <nav className="ix-footer-nav" aria-label="Footer navigation">
              {[
                { label: "Policies", to: "/policies"      },
                { label: "Privacy",  to: "/privacy-policy" },
                { label: "Contact",  to: "/contact"        },
                { label: "About",    to: "/about"          },
                { label: "Delete my data", to: "/delete-data" },
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
        .ix-btn-lg {
          justify-content: center;
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
          overflow: hidden;
          opacity: 0;
          animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.60s forwards;
        }
        .ix-phone {
          position: absolute;
          bottom: 0;
          overflow: hidden;
          border-radius: 36px 36px 0 0;
          border: 1px solid rgba(255,255,255,0.07);
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
          filter: brightness(0.85) drop-shadow(0 16px 32px rgba(0,0,0,0.55));
        }
        .ix-phone-right {
          width: clamp(88px, 26vw, 130px);
          z-index: 2;
          right: 0;
          transform: translateX(4%) rotate(6deg);
          transform-origin: bottom center;
          filter: brightness(0.85) drop-shadow(0 16px 32px rgba(0,0,0,0.55));
        }
        .ix-phone-img {
          width: 100%;
          max-width: 100%;
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
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.07);
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
        .ix-pro-cta {
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
          .ix-hero { padding-top: 24px; padding-left: 16px; padding-right: 16px; overflow-x: clip; }
          .ix-hero-inner { gap: 16px; }
          .ix-hero-text { padding-bottom: 0; }
          .ix-hero-visual { margin-top: 8px; overflow: hidden; }
          .ix-phone-stack {
            width: clamp(240px, 88vw, 320px);
            height: clamp(200px, 58vw, 340px);
          }
          .ix-phone-center { width: clamp(100px, 32vw, 148px); }
          .ix-phone-left {
            width: clamp(72px, 22vw, 108px);
            transform: translateX(0%) rotate(-5deg);
          }
          .ix-phone-right {
            width: clamp(72px, 22vw, 108px);
            transform: translateX(0%) rotate(5deg);
          }
          .ix-ctas { flex-direction: column; align-items: stretch; }
          .ix-ctas > div { justify-content: center; }
          .ix-chips { flex-wrap: wrap; overflow: visible; }
          .ix-feature-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .ix-feature-card { padding: 12px; }
          .ix-feature-icon { width: 30px; height: 30px; font-size: 13px; margin-bottom: 8px; }
          .ix-trust-stats { grid-template-columns: 1fr; gap: 8px; }
          .ix-trust-inner .ix-h2 { text-align: center; }
          .ix-footer-row { flex-direction: column; align-items: center; gap: 12px; }
          .ix-footer-nav { grid-template-columns: repeat(2, auto); gap: 8px 28px; justify-items: center; }
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
          .ix-footer-nav { grid-template-columns: repeat(5, auto); gap: 0 18px; }
          .ix-hero-inner {
            grid-template-columns: 1fr auto;
            gap: 80px;
            align-items: end;
          }
          .ix-hero-text   { order: -1; padding-bottom: clamp(40px, 5vw, 72px); }
          .ix-hero-visual { order: 1; }
          .ix-phone-stack {
            width: clamp(456px, 34vw, 556px);
            height: clamp(380px, 36vw, 520px);
            animation: ixFadeUp 0.70s cubic-bezier(0.22,1,0.36,1) 0.55s forwards, ixFloat 5s ease-in-out 1.4s infinite;
          }
          .ix-phone-center { width: clamp(160px, 14vw, 210px); }
          .ix-phone-left  { width: clamp(110px, 10vw, 148px); left: 48px; }
          .ix-phone-right { width: clamp(110px, 10vw, 148px); right: 48px; }
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
