import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Zap, TrendingUp, DollarSign, ArrowRight } from "lucide-react";
import { HubTile, FooterStrip } from "@/features/afl/stat-board/StatBoardHubPage";

// ── Nav cards ─────────────────────────────────────────────────────────────────

const CARDS = [
  {
    icon: <Zap size={18} />,
    title: "Current Week",
    copy: "Captain picks, trap alerts, value targets and weekly fantasy calls.",
    href: "/fantasy/current-week",
  },
  {
    icon: <TrendingUp size={18} />,
    title: "Rankings",
    copy: "Full player rankings by projection, form, confidence and value.",
    href: "/fantasy/rankings",
  },
  {
    icon: <DollarSign size={18} />,
    title: "Market Watch",
    copy: "Find underpriced targets, overpriced risks and trade value.",
    href: "/fantasy/market-watch",
  },
];

export default function FantasyHubPage() {
  const [primaryHovered, setPrimaryHovered] = useState(false);

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Hub | Neeko Sports Stats</title>
        <meta name="description" content="AFL Fantasy Hub — captain picks, trap alerts, value targets and rankings in one decision-focused place." />
        <link rel="canonical" href="https://neekostats.com.au/fantasy" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
        <meta property="og:description" content="AFL Fantasy Hub — captain picks, trap alerts, value targets and rankings in one decision-focused place." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
        <meta name="twitter:description" content="AFL Fantasy Hub — captain picks, trap alerts, value targets and rankings in one decision-focused place." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": "https://neekostats.com.au/fantasy",
              "url": "https://neekostats.com.au/fantasy",
              "name": "AFL Fantasy Hub | Neeko Sports Stats",
              "description": "AFL Fantasy Hub — captain picks, trap alerts, value targets and rankings in one decision-focused place.",
              "inLanguage": "en-AU",
              "isPartOf": { "@id": "https://neekostats.com.au/" },
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au/" },
                { "@type": "ListItem", "position": 2, "name": "Fantasy Hub", "item": "https://neekostats.com.au/fantasy" },
              ],
            },
          ],
        })}</script>
      </Helmet>

      <div style={{ minHeight: "100vh", background: "#05070A", color: "#fff" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(36px,4.5vw,60px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)" }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,40px)" }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.65)",
              margin: "0 0 10px",
            }}>
              Fantasy Hub
            </p>
            <h1 style={{
              fontSize: "clamp(1.6rem,3vw,2.2rem)",
              fontWeight: 900, letterSpacing: "-0.03em",
              color: "#F5F5F5", lineHeight: 1.2,
              margin: "0 0 10px",
            }}>
              AFL Fantasy Hub
            </h1>
            <p style={{
              fontSize: "clamp(13px,1vw,14.5px)",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.6,
              margin: "0 0 6px",
              maxWidth: 440,
            }}>
              Make faster fantasy decisions each round.
            </p>
            <p style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.40)",
              lineHeight: 1.55,
              margin: "0 0 20px",
              maxWidth: 440,
            }}>
              Use Current Week for weekly calls, Rankings for the full player list, or Market Watch to find the best trade targets.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Link
                to="/fantasy/current-week"
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
                Open Current Week <ArrowRight size={13} />
              </Link>
              <Link
                to="/fantasy/rankings"
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
                View Rankings <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* ── Cards ─────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "clamp(22px,3vw,32px)" }}>
            {CARDS.map((card) => <HubTile key={card.title} card={card} />)}
          </div>

          {/* ── Footer strip ──────────────────────────────────────────────── */}
          <FooterStrip steps={["Pick a tool", "Get the data you need", "Make better trades this round"]} />

        </div>
      </div>
    </>
  );
}
