import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

const DARK = "#07090C";
const GOLD = "#E0AE2D";
const TEAL = "#22c55e";

const FEATURES = [
  {
    title: "Stat Board",
    copy: "Pick a match, set a threshold, and instantly see hit rates, projections and last-10 form for every player in the game.",
    color: TEAL,
  },
  {
    title: "Fantasy Hub",
    copy: "Top Targets, Trap Alerts, Captain Picks and live Rankings — every fantasy decision in one screen, updated before lockout.",
    color: GOLD,
  },
  {
    title: "Market Watch",
    copy: "Price-movement projections and breakout candidates. Know who to buy and who to avoid before the rest of the competition.",
    color: "#60a5fa",
  },
  {
    title: "Rankings",
    copy: "Season and rolling form rankings across every position. See who is trending up, who is fading and why.",
    color: "#f87171",
  },
];

const TRUST_ITEMS = [
  "600+ AFL players tracked weekly",
  "Updated before every round lockout",
  "Disposals, goals and more",
];

export default function Index() {
  return (
    <div style={{ background: DARK, overflowX: "hidden", minHeight: "100vh" }}>
      <Helmet>
        <title>Neeko Stats — AFL Stats App for iPhone</title>
        <meta
          name="description"
          content="Neeko Stats is the AFL stats app for fantasy footy players. Hit rates, projections, matchup trends and captain picks — before the bounce. Now on iOS."
        />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Stats — AFL Stats App for iPhone" />
        <meta
          property="og:description"
          content="AFL hit rates, projections and fantasy decisions in your pocket. Now on iOS."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px clamp(20px, 5vw, 48px) 60px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        {/* bg */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(224,174,45,0.05) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 180,
            background: "linear-gradient(to bottom, transparent, #07090C)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", maxWidth: 700 }}>
          <p
            className="n-eyebrow"
            style={{
              margin: "0 0 20px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: TEAL,
              textShadow: "0 0 20px rgba(34,197,94,0.28)",
            }}
          >
            Now on iOS
          </p>

          <h1
            className="n-h1"
            style={{
              margin: "0 0 22px",
              fontSize: "clamp(32px, 5.5vw, 68px)",
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              color: "#f4f4f4",
            }}
          >
            AFL stats{" "}
            <span
              style={{
                color: GOLD,
                textShadow: "0 0 32px rgba(224,174,45,0.30)",
              }}
            >
              before the bounce.
            </span>
          </h1>

          <p
            className="n-sub"
            style={{
              margin: "0 auto 36px",
              maxWidth: 520,
              fontSize: "clamp(14px, 1.1vw, 18px)",
              color: "rgba(255,255,255,0.70)",
              lineHeight: 1.65,
              fontWeight: 400,
            }}
          >
            Hit rates, projections, matchup trends and fantasy decisions — in your pocket, updated every week before lockout.
          </p>

          <div
            className="n-ctas"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href="https://apps.apple.com/au/app/neeko-stats/id6744005975"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: `linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%)`,
                color: "#07090C",
                fontWeight: 800,
                fontSize: "clamp(13px, 1vw, 16px)",
                padding: "14px 28px",
                borderRadius: 10,
                textDecoration: "none",
                letterSpacing: "0.01em",
                boxShadow: "0 8px 28px rgba(224,174,45,0.30), 0 4px 12px rgba(0,0,0,0.50)",
                transition: "transform 0.18s ease, box-shadow 0.18s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 14px 36px rgba(224,174,45,0.40), 0 4px 12px rgba(0,0,0,0.50)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 28px rgba(224,174,45,0.30), 0 4px 12px rgba(0,0,0,0.50)";
              }}
            >
              Download on the App Store
            </a>
          </div>

          {/* trust pills */}
          <div
            className="n-trust"
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 22,
            }}
          >
            {TRUST_ITEMS.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.52)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  padding: "3px 10px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT NEEKO DOES ───────────────────────────────────────────────────── */}
      <section
        style={{
          background: "#060809",
          padding: "clamp(40px, 5vw, 72px) clamp(20px, 5vw, 48px)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.44em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.36)",
              }}
            >
              The full toolkit
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(20px, 2.4vw, 32px)",
                fontWeight: 900,
                color: "#f0f0f0",
                letterSpacing: "-0.025em",
              }}
            >
              Everything you need before Sunday lockout.
            </h2>
          </div>

          <div
            className="n-feature-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 14,
            }}
          >
            {FEATURES.map(({ title, copy, color }) => (
              <div
                key={title}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${color}20`,
                  borderRadius: 12,
                  padding: "22px 20px",
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 24,
                    background: color,
                    borderRadius: 2,
                    marginBottom: 12,
                    opacity: 0.75,
                  }}
                />
                <p
                  style={{
                    margin: "0 0 7px",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#ebebeb",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.52)",
                    lineHeight: 1.6,
                  }}
                >
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEEKO+ SECTION ────────────────────────────────────────────────────── */}
      <section
        style={{
          background: DARK,
          backgroundImage: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(224,174,45,0.05) 0%, transparent 60%)",
          padding: "clamp(48px, 6vw, 88px) clamp(20px, 5vw, 48px)",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: `${GOLD}99`,
            }}
          >
            Neeko+
          </p>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "clamp(22px, 2.8vw, 36px)",
              fontWeight: 900,
              color: "#f0f0f0",
              letterSpacing: "-0.025em",
            }}
          >
            Unlock the full round.
          </h2>
          <p
            style={{
              margin: "0 auto 32px",
              maxWidth: 460,
              fontSize: "clamp(13px, 0.9vw, 15px)",
              color: "rgba(255,255,255,0.60)",
              lineHeight: 1.65,
            }}
          >
            Free access shows a preview. Neeko+ unlocks every match, every player and every stat lens for the whole season — or just pay per round when you need it.
          </p>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            {[
              { label: "All matches unlocked", color: TEAL },
              { label: "All stat lenses", color: TEAL },
              { label: "Round Pass available", color: GOLD },
            ].map(({ label, color }) => (
              <span
                key={label}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color,
                  background: `${color}12`,
                  border: `1px solid ${color}28`,
                  padding: "4px 12px",
                  borderRadius: 999,
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <a
            href="https://apps.apple.com/au/app/neeko-stats/id6744005975"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: `linear-gradient(150deg, ${GOLD} 0%, #c8940e 100%)`,
              color: "#07090C",
              fontWeight: 800,
              fontSize: 14,
              padding: "13px 26px",
              borderRadius: 10,
              textDecoration: "none",
              boxShadow: "0 8px 28px rgba(224,174,45,0.28)",
              transition: "transform 0.18s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            Get Neeko+ on iOS
          </a>
        </div>
      </section>

      {/* ── FOOTER CTA ────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: "#04060A",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "48px clamp(20px, 5vw, 48px)",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 16,
                fontWeight: 800,
                color: "#f0f0f0",
              }}
            >
              Neeko Stats
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "rgba(255,255,255,0.38)",
              }}
            >
              AFL stats for fantasy players — on iOS.
            </p>
          </div>

          <nav
            style={{
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Privacy Policy", to: "/privacy-policy" },
              { label: "Terms", to: "/terms-conditions" },
              { label: "Refund Policy", to: "/refund-policy" },
              { label: "Contact", to: "/contact" },
              { label: "About", to: "/about" },
            ].map(({ label, to }) => (
              <Link
                key={to}
                to={to}
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.40)",
                  textDecoration: "none",
                  transition: "color 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.40)"; }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <p
          style={{
            maxWidth: 900,
            margin: "28px auto 0",
            fontSize: 11,
            color: "rgba(255,255,255,0.20)",
            textAlign: "center",
          }}
        >
          &copy; {new Date().getFullYear()} Neeko Stats. All rights reserved.
        </p>
      </section>

      <style>{`
        @keyframes nFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .n-eyebrow { opacity: 0; animation: nFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s forwards; }
        .n-h1      { opacity: 0; animation: nFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.18s forwards; }
        .n-sub     { opacity: 0; animation: nFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.30s forwards; }
        .n-ctas    { opacity: 0; animation: nFadeUp 0.50s cubic-bezier(0.22,1,0.36,1) 0.42s forwards; }
        .n-trust   { opacity: 0; animation: nFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.52s forwards; }
        @media (max-width: 640px) {
          .n-feature-grid { grid-template-columns: 1fr !important; }
          .n-ctas { flex-direction: column; align-items: center; }
          .n-ctas a { width: 100%; max-width: 320px; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
