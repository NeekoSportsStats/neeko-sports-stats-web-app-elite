import { Link } from "react-router-dom";
import { ChartBar as BarChart2, TrendingUp, CircleCheck as CheckCircle, ChevronRight } from "lucide-react";
import { useState } from "react";

const GOLD = "#E0AE2D";

const STEPS = [
  {
    num: "01",
    icon: <BarChart2 size={22} />,
    title: "Find the Best Picks Fast",
    sub: "See who's actually scoring this week.",
    color: GOLD,
    to: "/sports/afl/rankings",
    cta: "View Rankings",
  },
  {
    num: "02",
    icon: <TrendingUp size={22} />,
    title: "See Who's Underpriced or Overpriced",
    sub: "Find the players to target — and the ones to avoid.",
    color: "#34d170",
    to: "/sports/afl/market-watch",
    cta: "Open Market Watch",
  },
  {
    num: "03",
    icon: <CheckCircle size={22} />,
    title: "Make Confident Trades & Captain Calls",
    sub: "Lock in your team with certainty before lockout.",
    color: "#60A5FA",
    to: "/sports/afl/current-round",
    cta: "View This Round",
  },
] as const;

type Step = typeof STEPS[number];

function StepCard(step: Step) {
  const [hovered, setHovered] = useState(false);
  const { num, icon, title, sub, color, to, cta } = step;
  return (
    <Link to={to} style={{ textDecoration: "none", display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1,
          background: hovered ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: `1px solid ${hovered ? color + "50" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14,
          padding: "20px 22px 18px",
          position: "relative",
          overflow: "hidden",
          boxShadow: hovered
            ? `0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px ${color}18 inset`
            : "none",
          transform: hovered ? "translateY(-4px)" : "translateY(0)",
          transition: "all 0.20s cubic-bezier(0.22,1,0.36,1)",
          display: "flex",
          flexDirection: "column",
          willChange: "transform",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(to right, transparent, ${color}55, transparent)`,
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: hovered ? `${color}22` : `${color}14`,
            border: `1.5px solid ${hovered ? color + "50" : color + "28"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color, flexShrink: 0,
            transition: "background 0.18s ease, border-color 0.18s ease",
          }}>
            {icon}
          </div>
          <span style={{
            fontSize: 30, fontWeight: 900,
            color: "rgba(255,255,255,0.04)",
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {num}
          </span>
        </div>

        <h3 style={{
          fontSize: 20, fontWeight: 700,
          color: "#F5F5F5", lineHeight: 1.2,
          margin: "0 0 8px", letterSpacing: "-0.02em",
        }}>
          {title}
        </h3>

        <p style={{
          fontSize: 13, color: "rgba(255,255,255,0.48)",
          fontWeight: 500, margin: "0 0 16px",
          lineHeight: 1.55, flex: 1,
        }}>
          {sub}
        </p>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, fontWeight: 700,
          color: hovered ? color : `${color}99`,
          letterSpacing: "0.02em",
          transition: "color 0.18s",
        }}>
          {cta} <ChevronRight size={12} strokeWidth={2.5} />
        </div>
      </div>
    </Link>
  );
}

export default function LandingWorkflowSection() {
  return (
    <section style={{
      background: "#06080C",
      padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 6px",
          }}>
            Your Weekly Workflow
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 8px",
          }}>
            How You Win Your Week in 30 Seconds
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 360, margin: "0 auto",
            lineHeight: 1.5,
          }}>
            Your weekly decisions — simplified.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          alignItems: "stretch",
        }}>
          {STEPS.map(step => <StepCard key={step.num} {...step} />)}
        </div>
      </div>
    </section>
  );
}
