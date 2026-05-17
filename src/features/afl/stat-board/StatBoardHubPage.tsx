import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Users, ChartBar as BarChart2, Swords, ArrowRight } from "lucide-react";

// ── Shared layout tokens (mirrored in FantasyHubPage) ─────────────────────────
// maxWidth: 680 | padding: clamp(36px,4.5vw,60px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)
// card: borderRadius 14, padding 16px 18px, gap 14, icon 38×38 borderRadius 10
// badge: fontSize 9.5, borderRadius 5, padding 2px 7px
// CTA primary: padding 11px 20px, borderRadius 10, fontSize 13 fontWeight 800
// CTA secondary: same padding, same borderRadius, fontSize 13 fontWeight 700

interface HubCard {
  icon: React.ReactNode;
  title: string;
  copy: string;
  href: string;
}

const CARDS: HubCard[] = [
  {
    icon: <Users size={18} />,
    title: "Player Stats",
    copy: "Filter by match, stat and threshold. View recent form, hit rates, projections and player trends.",
    href: "/stat-board/players",
  },
  {
    icon: <BarChart2 size={18} />,
    title: "Team Stats",
    copy: "Compare team scoring trends, hit rates, projections and matchup context.",
    href: "/stat-board/teams",
  },
  {
    icon: <Swords size={18} />,
    title: "Match Centre",
    copy: "Scan every fixture by projected total, margin, scoring environment and trend confidence.",
    href: "/stat-board/match-centre",
  },
];

export default function StatBoardHubPage() {
  const [primaryHovered, setPrimaryHovered] = useState(false);

  return (
    <>
      <Helmet>
        <title>AFL Stat Board | Neeko Sports Stats</title>
        <meta name="description" content="Explore AFL player stats, team trends and match centre data. Filter by match, stat and threshold." />
        <link rel="canonical" href="https://neekostats.com.au/stat-board" />
        <meta property="og:url" content="https://neekostats.com.au/stat-board" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="AFL Stat Board | Neeko Sports Stats" />
        <meta property="og:description" content="Explore AFL player stats, team trends and match centre data. Filter by match, stat and threshold." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Stat Board | Neeko Sports Stats" />
        <meta name="twitter:description" content="Explore AFL player stats, team trends and match centre data. Filter by match, stat and threshold." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": "https://neekostats.com.au/stat-board",
              "url": "https://neekostats.com.au/stat-board",
              "name": "AFL Stat Board | Neeko Sports Stats",
              "description": "Explore AFL player stats, team trends and match centre data. Filter by match, stat and threshold.",
              "inLanguage": "en-AU",
              "isPartOf": { "@id": "https://neekostats.com.au/" },
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au/" },
                { "@type": "ListItem", "position": 2, "name": "Stat Board", "item": "https://neekostats.com.au/stat-board" },
              ],
            },
          ],
        })}</script>
      </Helmet>

      <div style={{ minHeight: "100dvh", background: "#05070A", color: "#fff" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(36px,4.5vw,60px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)" }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,40px)" }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.65)",
              margin: "0 0 10px",
            }}>
              Stat Board
            </p>
            <h1 style={{
              fontSize: "clamp(1.6rem,3vw,2.2rem)",
              fontWeight: 900, letterSpacing: "-0.03em",
              color: "#F5F5F5", lineHeight: 1.2,
              margin: "0 0 10px",
            }}>
              AFL Stat Board
            </h1>
            <p style={{
              fontSize: "clamp(13px,1vw,14.5px)",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.6,
              margin: "0 0 6px",
              maxWidth: 440,
            }}>
              Choose how you want to read the round.
            </p>
            <p style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.40)",
              lineHeight: 1.55,
              margin: "0 0 20px",
              maxWidth: 440,
            }}>
              Use Player Stats for individual hit rates, Team Stats for team scoring trends, or Match Centre for a full-round game scanner.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Link
                to="/stat-board/players"
                onMouseEnter={() => setPrimaryHovered(true)}
                onMouseLeave={() => setPrimaryHovered(false)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 20px", borderRadius: 10,
                  background: primaryHovered ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
                  border: `1px solid ${primaryHovered ? "rgba(34,197,94,0.45)" : "rgba(34,197,94,0.28)"}`,
                  color: primaryHovered ? "#4ade80" : "rgba(74,222,128,0.88)",
                  fontSize: 13, fontWeight: 800,
                  textDecoration: "none", letterSpacing: "0.01em",
                  transition: "all 0.15s ease",
                }}
              >
                Open Player Stats <ArrowRight size={13} />
              </Link>
              <Link
                to="/stat-board/match-centre"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 20px", borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 700,
                  textDecoration: "none", letterSpacing: "0.01em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.80)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
                }}
              >
                Open Match Centre <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* ── Cards ─────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "clamp(22px,3vw,32px)" }}>
            {CARDS.map((card) => <HubTile key={card.title} card={card} />)}
          </div>

          {/* ── Footer strip ──────────────────────────────────────────────── */}
          <FooterStrip steps={["Pick a match", "Choose a stat lens", "Open the page you want to analyse"]} />

        </div>
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function HubTile({ card }: { card: HubCard }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link to={card.href} style={{ textDecoration: "none" }} aria-label={`Open ${card.title}`}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          padding: "16px 18px", borderRadius: 14,
          border: `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`,
          background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
          transition: "all 0.15s ease", cursor: "pointer",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: "rgba(34,197,94,0.10)",
          border: "1px solid rgba(34,197,94,0.20)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#4ade80",
        }}>
          {card.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#ECECEC", letterSpacing: "-0.01em" }}>
              {card.title}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.80)",
              background: "rgba(34,197,94,0.10)",
              border: "1px solid rgba(34,197,94,0.20)",
              borderRadius: 5, padding: "2px 7px",
            }}>
              Available
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.48)", lineHeight: 1.5 }}>
            {card.copy}
          </p>
        </div>
        <div style={{ flexShrink: 0, alignSelf: "center" }}>
          <ArrowRight size={15} style={{
            color: hovered ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
            transition: "color 0.15s",
          }} />
        </div>
      </div>
    </Link>
  );
}

export function FooterStrip({ steps }: { steps: string[] }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
      padding: "12px 16px",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.4,
    }}>
      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.60)" }}>How it works:</span>
      {steps.map((step, i) => (
        <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{step}</span>
          {i < steps.length - 1 && <span style={{ color: "rgba(255,255,255,0.22)" }}>→</span>}
        </span>
      ))}
    </div>
  );
}
