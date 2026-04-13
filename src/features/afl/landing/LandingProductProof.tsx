import { Database, RefreshCw, TrendingUp, Target, Zap } from "lucide-react";

const STATS = [
  {
    icon: <Database size={20} />,
    num: "600+",
    label: "Players tracked",
    sub: "Every AFL fantasy player, every position",
    color: "#E0AE2D",
  },
  {
    icon: <RefreshCw size={20} />,
    num: "Weekly",
    label: "Projections updated",
    sub: "Refreshed before each round's lockout",
    color: "#34d170",
  },
  {
    icon: <TrendingUp size={20} />,
    num: "Live",
    label: "Value signals",
    sub: "Price-vs-projection gap recalculated each round",
    color: "#60A5FA",
  },
  {
    icon: <Target size={20} />,
    num: "Built in",
    label: "Matchup difficulty",
    sub: "Opponent concession rates factored into projections",
    color: "#f87171",
  },
  {
    icon: <Zap size={20} />,
    num: "Real",
    label: "AFL data only",
    sub: "No estimates — verified match and fantasy stats",
    color: "#a78bfa",
  },
];

export default function LandingProductProof() {
  return (
    <section style={{ background: "#0a0909", padding: "72px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", margin: "0 0 12px" }}>
            Under The Hood
          </p>
          <h2 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2.1rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: 0 }}>
            Built From Real AFL Data — Updated Every Round
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
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
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}40, transparent)` }} />
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, marginBottom: 14 }}>
                {icon}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.03em", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{num}</div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "#EAEAEA", marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", lineHeight: 1.55, margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
