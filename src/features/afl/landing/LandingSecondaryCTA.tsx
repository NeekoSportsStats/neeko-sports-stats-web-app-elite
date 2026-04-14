import { useState } from "react";
import { Clock, Target, Layers } from "lucide-react";

const POINTS = [
  {
    icon: <Clock size={20} />,
    title: "Decide in seconds, not hours",
    desc: "Rankings, market signals, and captain picks load instantly — your whole week sorted before kickoff.",
    color: "#E0AE2D",
  },
  {
    icon: <Target size={20} />,
    title: "Win more trades than you lose",
    desc: "Value gaps and breakeven data tell you exactly who to target and who to avoid every single round.",
    color: "#22c55e",
  },
  {
    icon: <Layers size={20} />,
    title: "Stop second-guessing your captain",
    desc: "Confidence-scored picks with matchup context — lock in your captain before your competition does.",
    color: "#60a5fa",
  },
];

function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode; title: string; desc: string; color: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 16,
        background: hovered ? "rgba(255,255,255,0.038)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovered ? color + "30" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 14,
        padding: "24px 22px",
        position: "relative",
        overflow: "hidden",
        transform: hovered ? "translateY(-4px) scale(1.01)" : "translateY(0) scale(1)",
        boxShadow: hovered ? `0 16px 40px rgba(0,0,0,0.50), 0 0 0 1px ${color}10 inset` : "none",
        transition: "all 0.22s cubic-bezier(0.22,1,0.36,1)",
        cursor: "default",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(to right, transparent, ${hovered ? color + "55" : color + "40"}, transparent)`,
        transition: "all 0.22s ease",
      }} />
      <div style={{
        width: 42, height: 42, borderRadius: 11,
        background: hovered ? `${color}20` : `${color}14`,
        border: `1.5px solid ${hovered ? color + "45" : color + "28"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color, flexShrink: 0,
        transform: hovered ? "scale(1.06)" : "scale(1)",
        transition: "transform 0.18s ease, background 0.18s ease, border-color 0.18s ease",
      }}>
        {icon}
      </div>
      <div>
        <h3 style={{
          fontSize: 16, fontWeight: 800,
          color: hovered ? "#FFFFFF" : "#F0F0F0",
          margin: "0 0 6px",
          letterSpacing: "-0.02em",
          transition: "color 0.18s ease",
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 13, color: hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.45)",
          fontWeight: 500, margin: 0,
          lineHeight: 1.55,
          transition: "color 0.18s ease",
        }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

export default function LandingSecondaryCTA() {
  return (
    <section style={{
      background: "#06080C",
      padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 12px",
          }}>
            Why People Stay
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.1,
            margin: 0,
          }}>
            Why Serious Coaches Keep Coming Back
          </h2>
        </div>

        {/* Three horizontal points */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}>
          {POINTS.map((p) => (
            <FeatureCard key={p.title} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
