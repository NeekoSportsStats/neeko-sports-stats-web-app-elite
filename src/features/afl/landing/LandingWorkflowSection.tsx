import { Link } from "react-router-dom";
import { ChartBar as BarChart2, TrendingUp, CircleCheck as CheckCircle, ChevronRight } from "lucide-react";
import { useState } from "react";

const GOLD = "#E0AE2D";

const STEPS = [
  {
    num: "01",
    icon: <BarChart2 size={24} />,
    title: "Scan Rankings",
    sub: "See the top projected players instantly.",
    color: GOLD,
    to: "/sports/afl/rankings",
    cta: "View Rankings",
  },
  {
    num: "02",
    icon: <TrendingUp size={24} />,
    title: "Spot Value & Traps",
    sub: "Identify underpriced targets and avoid score traps.",
    color: "#34d170",
    to: "/sports/afl/market-watch",
    cta: "Open Market Watch",
  },
  {
    num: "03",
    icon: <CheckCircle size={24} />,
    title: "Lock In Your Team",
    sub: "Make confident trades, captain picks, and start/sit decisions.",
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
          background: hovered ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.03)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: `1px solid ${hovered ? color + "45" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 16,
          padding: "28px 26px 24px",
          position: "relative",
          overflow: "hidden",
          boxShadow: hovered
            ? `0 20px 48px rgba(0,0,0,0.60), 0 0 0 1px ${color}18 inset, 0 0 28px ${color}0f`
            : "none",
          transform: hovered ? "translateY(-6px) scale(1.012)" : "translateY(0) scale(1)",
          transition: "all 0.22s cubic-bezier(0.22,1,0.36,1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(to right, transparent, ${color}55, transparent)`,
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13,
            background: hovered ? `${color}20` : `${color}14`,
            border: `1.5px solid ${hovered ? color + "45" : color + "28"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color, flexShrink: 0,
            transform: hovered ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.18s ease, background 0.18s ease, border-color 0.18s ease",
          }}>
            {icon}
          </div>
          <span style={{
            fontSize: 34, fontWeight: 900,
            color: "rgba(255,255,255,0.045)",
            letterSpacing: "-0.04em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {num}
          </span>
        </div>

        <h3 style={{
          fontSize: 18, fontWeight: 800,
          color: "#F5F5F5", lineHeight: 1.2,
          margin: "0 0 9px", letterSpacing: "-0.02em",
        }}>
          {title}
        </h3>

        <p style={{
          fontSize: 13, color: "rgba(255,255,255,0.50)",
          fontWeight: 500, margin: "0 0 20px",
          lineHeight: 1.6, flex: 1,
        }}>
          {sub}
        </p>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, fontWeight: 700,
          color: hovered ? color : `${color}aa`,
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
      background: "linear-gradient(180deg, #0B0F14 0%, #0d0c0a 100%)",
      padding: "80px clamp(16px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 12px",
          }}>
            Your Weekly Workflow
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.1,
            margin: "0 0 12px",
          }}>
            How You Win Your Week in 30 Seconds
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 360, margin: "0 auto",
            lineHeight: 1.55,
          }}>
            Three steps. Real data. No guesswork.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}>
          {STEPS.map(step => <StepCard key={step.num} {...step} />)}
        </div>
      </div>
    </section>
  );
}
