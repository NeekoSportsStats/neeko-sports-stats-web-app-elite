import { Clock, Target, Layers } from "lucide-react";

const POINTS = [
  {
    icon: <Clock size={20} />,
    title: "Faster Decisions",
    desc: "Know what to do before lockout.",
    color: "#E0AE2D",
  },
  {
    icon: <Target size={20} />,
    title: "Clearer Strategy",
    desc: "Remove guesswork from trades and captain picks.",
    color: "#34d170",
  },
  {
    icon: <Layers size={20} />,
    title: "All-In-One Tool",
    desc: "Rankings, value, and insights in one place.",
    color: "#60a5fa",
  },
];

export default function LandingSecondaryCTA() {
  return (
    <section style={{
      background: "linear-gradient(180deg, #0d0c0a 0%, #0a0909 100%)",
      padding: "80px clamp(16px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
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
            Why Coaches Come Back Every Week
          </h2>
        </div>

        {/* Three horizontal points */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}>
          {POINTS.map(({ icon, title, desc, color }) => (
            <div
              key={title}
              style={{
                display: "flex", alignItems: "flex-start", gap: 16,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "24px 22px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(to right, transparent, ${color}40, transparent)`,
              }} />
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                background: `${color}14`,
                border: `1.5px solid ${color}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color, flexShrink: 0,
              }}>
                {icon}
              </div>
              <div>
                <h3 style={{
                  fontSize: 16, fontWeight: 800,
                  color: "#F0F0F0",
                  margin: "0 0 6px",
                  letterSpacing: "-0.02em",
                }}>
                  {title}
                </h3>
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.45)",
                  fontWeight: 500, margin: 0,
                  lineHeight: 1.55,
                }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
