import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CircleCheck as CheckCircle2, Circle as XCircle, Crown } from "lucide-react";

const FEATURES = [
  "Player hit rates by stat line",
  "Match boards by game",
  "Player profiles and recent form",
  "Team trends and ladder context",
  "Neeko Pro premium access",
];

const IS_NOT_LIST = [
  "A betting tips service",
  "A source of gambling or bookmaker advice",
  "A guarantee of player performance",
  "A replacement for user judgement",
];

export default function About() {
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>About Neeko Stats | AFL Stats &amp; Hit Rates for iPhone</title>
        <meta name="description" content="Neeko Stats is an iPhone app for AFL stats, player hit rates, match boards, team form and matchup context. Built for AFL fans who want fast statistical research." />
        <link rel="canonical" href="https://neekostats.com.au/about" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/about" />
        <meta property="og:title" content="About Neeko Stats | AFL Stats &amp; Hit Rates for iPhone" />
        <meta property="og:description" content="Neeko Stats is an iPhone app for AFL stats, player hit rates, match boards, team form and matchup context. Built for AFL fans who want fast statistical research." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Neeko Stats | AFL Stats &amp; Hit Rates for iPhone" />
        <meta name="twitter:description" content="Neeko Stats is an iPhone app for AFL stats, player hit rates, match boards, team form and matchup context. Built for AFL fans who want fast statistical research." />
      </Helmet>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(48px, 8vw, 80px) clamp(16px, 5vw, 32px) 100px" }}>

        {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(245,200,76,0.60)",
            marginBottom: 18,
          }}>
            About
          </p>

          <h1 style={{
            fontSize: "clamp(1.9rem, 4.5vw, 3rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1.12,
            color: "#F5F5F5",
            margin: "0 0 20px",
            maxWidth: 680,
          }}>
            About Neeko Stats
          </h1>

          <p style={{
            fontSize: "clamp(14px, 1.2vw, 16.5px)",
            color: "rgba(255,255,255,0.50)",
            lineHeight: 1.7,
            maxWidth: 600,
            margin: 0,
          }}>
            AFL stats, hit rates and match context — built for iPhone.
          </p>
        </section>

        <div style={{ width: 40, height: 2, background: "rgba(245,200,76,0.25)", borderRadius: 99, marginBottom: 64 }} />

        {/* ── 2. What Neeko Stats Does ─────────────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            The app
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 16px",
          }}>
            What Neeko Stats does
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", lineHeight: 1.75, maxWidth: 660, margin: 0 }}>
            Neeko Stats helps AFL fans review player trends, hit rates, match boards, team form and matchup context before each round. It is built for AFL fans who want fast statistical research without having to jump between multiple sources.
          </p>
        </section>

        {/* ── 3. Built for Fast Research ───────────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            Features
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 20px",
          }}>
            Built for fast research
          </h2>

          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "22px 24px",
          }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 13 }}>
              {FEATURES.map(item => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <CheckCircle2 size={15} style={{ color: "rgba(245,200,76,0.65)", marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.60)", lineHeight: 1.55 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 4. Neeko Pro ─────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            Subscription
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 16px",
          }}>
            Neeko Pro
          </h2>

          <div style={{
            background: "rgba(245,200,76,0.04)",
            border: "1px solid rgba(245,200,76,0.14)",
            borderRadius: 16, padding: "24px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(245,200,76,0.09)",
                border: "1px solid rgba(245,200,76,0.20)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Crown size={15} style={{ color: "#F5C84C" }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#F5F5F5", margin: 0 }}>
                $9.99 AUD / month
              </p>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 1.72, margin: 0 }}>
              Neeko Pro unlocks full-round match boards, every stat lens, fine-line thresholds, matchup compare and team context. Subscription is billed monthly via Apple App Store in-app purchase. Manage or cancel any time through your iPhone Settings.
            </p>
          </div>
        </section>

        {/* ── 5. Stats and Research Only ───────────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            Transparency
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 16px",
          }}>
            Stats and research only
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", lineHeight: 1.75, maxWidth: 660, margin: "0 0 20px" }}>
            Neeko Stats is for research, information and entertainment purposes only. It does not provide:
          </p>

          <div style={{
            background: "rgba(239,68,68,0.04)",
            border: "1px solid rgba(239,68,68,0.12)",
            borderRadius: 16, padding: "22px 24px",
          }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {IS_NOT_LIST.map(item => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <XCircle size={15} style={{ color: "rgba(239,68,68,0.60)", marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", lineHeight: 1.55 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 6. Contact ───────────────────────────────────────────────────── */}
        <section>
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20, padding: "32px 28px",
          }}>
            <p style={{
              fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
              marginBottom: 10, margin: "0 0 10px",
            }}>
              Contact
            </p>
            <h2 style={{
              fontSize: "clamp(1.1rem, 2.2vw, 1.35rem)",
              fontWeight: 800, color: "#F5F5F5",
              letterSpacing: "-0.025em", margin: "0 0 10px",
            }}>
              Get in touch
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.42)", margin: "0 0 20px", lineHeight: 1.65 }}>
              Based in Melbourne, Victoria, Australia.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <a
                href="mailto:admin@neekostats.com.au"
                style={{
                  display: "inline-flex", alignItems: "center",
                  fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)",
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                admin@neekostats.com.au
              </a>
              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 13 }}>·</span>
              <Link
                to="/contact"
                style={{
                  display: "inline-flex", alignItems: "center",
                  fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)",
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                Contact page
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
