import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Users, ChartBar as BarChart2, Swords, ArrowRight, Lock } from "lucide-react";

interface ModeCard {
  icon: React.ReactNode;
  title: string;
  status: "available" | "coming-soon";
  copy: string;
  href?: string;
}

const MODES: ModeCard[] = [
  {
    icon: <Users size={18} />,
    title: "Player Stats",
    status: "available",
    copy: "Filter by match, stat and threshold. View last 10 trends, hit rates, projections and consistency.",
    href: "/stat-board/players",
  },
  {
    icon: <BarChart2 size={18} />,
    title: "Team Stats",
    status: "coming-soon",
    copy: "Team totals, scoring trends and projected match output.",
  },
  {
    icon: <Swords size={18} />,
    title: "Match Centre",
    status: "coming-soon",
    copy: "Game-by-game summaries, team comparisons and top player stat trends.",
  },
];

export default function StatBoardHubPage() {
  const [heroHovered, setHeroHovered] = useState(false);

  return (
    <>
      <Helmet>
        <title>AFL Stat Board | Neeko Sports Stats</title>
        <meta name="description" content="Explore AFL player stat trends, hit rates and projections by upcoming match." />
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
              Stat Board
            </p>
            <h1 style={{
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              fontWeight: 900, letterSpacing: "-0.03em",
              color: "#F5F5F5", lineHeight: 1.2,
              margin: "0 0 10px",
            }}>
              AFL Stat Board
            </h1>
            <p style={{
              fontSize: "clamp(13px, 1vw, 14.5px)",
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
              Start with Player Stats to view disposals, goals, hit rates and projections by match.
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <Link
                to="/stat-board/players"
                onMouseEnter={() => setHeroHovered(true)}
                onMouseLeave={() => setHeroHovered(false)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 20px",
                  borderRadius: 10,
                  background: heroHovered
                    ? "rgba(34,197,94,0.18)"
                    : "rgba(34,197,94,0.12)",
                  border: `1px solid ${heroHovered ? "rgba(34,197,94,0.45)" : "rgba(34,197,94,0.28)"}`,
                  color: heroHovered ? "#4ade80" : "rgba(74,222,128,0.88)",
                  fontSize: 13, fontWeight: 800,
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  transition: "all 0.15s ease",
                }}
              >
                Open Player Stats <ArrowRight size={13} />
              </Link>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: 0 }}>
                Disposals and goals available now.
              </p>
            </div>
          </div>

          {/* ── Mode cards ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(22px,3vw,32px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MODES.map((mode) => <ModeTile key={mode.title} mode={mode} />)}
            </div>
          </div>

          {/* ── How it works — compact strip ──────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
            padding: "12px 16px",
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            fontSize: 12, color: "rgba(255,255,255,0.42)",
            lineHeight: 1.4,
          }}>
            <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.60)" }}>How it works:</span>
            {["Pick a match", "Choose disposals or goals", "View hit rates and projections"].map((step, i, arr) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{step}</span>
                {i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.22)" }}>→</span>}
              </span>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Mode tile ────────────────────────────────────────────────────────────────

function ModeTile({ mode }: { mode: ModeCard }) {
  const [hovered, setHovered] = useState(false);
  const isAvailable = mode.status === "available";

  const inner = (
    <div
      onMouseEnter={() => isAvailable && setHovered(true)}
      onMouseLeave={() => isAvailable && setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "16px 18px",
        borderRadius: 14,
        border: isAvailable
          ? `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`
          : "1px solid rgba(255,255,255,0.06)",
        background: isAvailable
          ? (hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)")
          : "rgba(255,255,255,0.015)",
        opacity: isAvailable ? 1 : 0.78,
        transition: "all 0.15s ease",
        cursor: isAvailable ? "pointer" : "default",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: isAvailable ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.05)",
        border: isAvailable ? "1px solid rgba(34,197,94,0.20)" : "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isAvailable ? "#4ade80" : "rgba(255,255,255,0.35)",
      }}>
        {mode.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 700,
            color: isAvailable ? "#ECECEC" : "rgba(255,255,255,0.62)",
            letterSpacing: "-0.01em",
          }}>
            {mode.title}
          </span>
          {isAvailable ? (
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
          ) : (
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.04em",
              color: "rgba(255,255,255,0.45)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 5, padding: "2px 7px",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <Lock size={8} /> Coming soon
            </span>
          )}
        </div>
        <p style={{
          margin: 0, fontSize: 12.5,
          color: isAvailable ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.42)",
          lineHeight: 1.5,
        }}>
          {mode.copy}
        </p>
      </div>

      {/* Arrow */}
      <div style={{ flexShrink: 0, alignSelf: "center" }}>
        <ArrowRight size={15} style={{
          color: isAvailable
            ? (hovered ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)")
            : "rgba(255,255,255,0.10)",
          transition: "color 0.15s",
        }} />
      </div>
    </div>
  );

  if (isAvailable && mode.href) {
    return (
      <Link to={mode.href} style={{ textDecoration: "none" }} aria-label={`Open ${mode.title}`}>
        {inner}
      </Link>
    );
  }

  return <div aria-label={`${mode.title} — coming soon`}>{inner}</div>;
}
