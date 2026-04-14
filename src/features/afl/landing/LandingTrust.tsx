import { Database, RefreshCw, TrendingUp, Target, Zap } from "lucide-react";

const STATS = [
  {
    icon: <Database size={20} />,
    num: "600+",
    label: "Players Ranked",
    sub: "Every relevant AFL Fantasy player — not just the top tier.",
    color: "#E0AE2D",
  },
  {
    icon: <TrendingUp size={20} />,
    num: "Live",
    label: "Value Gaps",
    sub: "Underpriced players and trap alerts generated from real pricing data.",
    color: "#22c55e",
  },
  {
    icon: <Target size={20} />,
    num: "Built In",
    label: "Matchup Context",
    sub: "Opponent concession rates and venue splits baked into every projection.",
    color: "#E8855A",
  },
  {
    icon: <RefreshCw size={20} />,
    num: "±3 pts",
    label: "Projection Accuracy",
    sub: "Projections calibrated against real scores each round — not guesswork.",
    color: "#f87171",
  },
  {
    icon: <Zap size={20} />,
    num: "6 Tools",
    label: "One Subscription",
    sub: "Rankings, Market Watch, Captains, Edge Board, Start/Sit, Player Pages.",
    color: "#E0AE2D",
  },
];

export default function LandingTrust() {
  return (
    <section style={{ background: "#05070A", padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 6px",
          }}>
            Under The Hood
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 8px",
          }}>
            What's Actually Under the Hood
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 420, margin: "0 auto",
            lineHeight: 1.5,
          }}>
            Real data, real projections, real pricing — not recycled stats from a spreadsheet.
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
