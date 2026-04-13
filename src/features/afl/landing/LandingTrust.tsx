import { Database, RefreshCw, TrendingUp, Target, Zap } from "lucide-react";

const STATS = [
  {
    icon: <Database size={20} />,
    num: "600+",
    label: "Players Ranked",
    sub: "Every relevant AFL Fantasy player covered, every round.",
    color: "#E0AE2D",
  },
  {
    icon: <RefreshCw size={20} />,
    num: "Weekly",
    label: "Data Updates",
    sub: "Fresh projections and pricing before every lockout.",
    color: "#34d170",
  },
  {
    icon: <TrendingUp size={20} />,
    num: "Live",
    label: "Value Gaps",
    sub: "See who's underpriced and who's a trap — right now.",
    color: "#60a5fa",
  },
  {
    icon: <Target size={20} />,
    num: "Built In",
    label: "Matchup Context",
    sub: "Opponent concession and venue data in every projection.",
    color: "#f87171",
  },
  {
    icon: <Zap size={20} />,
    num: "30 sec",
    label: "Decision Time",
    sub: "Know what to do before your mates even open the app.",
    color: "#a78bfa",
  },
];

export default function LandingTrust() {
  return (
    <section style={{ background: "#0a0909", padding: "80px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 12px",
          }}>
            Under The Hood
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.1,
            margin: "0 0 12px",
          }}>
            Built for Weekly AFL Fantasy Decisions
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 400, margin: "0 auto",
            lineHeight: 1.55,
          }}>
            Updated before every lockout using real player data and pricing.
          </p>
        </div>

        {/* Stat blocks */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
        }}>
          {STATS.map(({ icon, num, label, sub, color }) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "22px 20px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(to right, transparent, ${color}40, transparent)`,
              }} />
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `${color}14`,
                border: `1px solid ${color}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color, marginBottom: 14, flexShrink: 0,
              }}>
                {icon}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 900,
                color: "#E0AE2D",
                letterSpacing: "-0.03em",
                marginBottom: 5,
                fontVariantNumeric: "tabular-nums",
              }}>
                {num}
              </div>
              <p style={{
                fontSize: 13.5, fontWeight: 700,
                color: "#EAEAEA",
                margin: "0 0 6px",
                letterSpacing: "-0.01em",
              }}>
                {label}
              </p>
              <p style={{
                fontSize: 12, color: "rgba(255,255,255,0.32)",
                lineHeight: 1.55, margin: 0,
              }}>
                {sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
