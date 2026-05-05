import { ChartBar as BarChart2, Target, List, TrendingUp, CircleCheck as CheckCircle, Star } from "lucide-react";

const FEATURES = [
  {
    icon: <List size={20} />,
    label: "Last 10 game trends",
    sub: "See every player's recent stat history in the current lens — disposals or goals.",
    color: "#22c55e",
  },
  {
    icon: <Target size={20} />,
    label: "Hit-rate thresholds",
    sub: "Know how often a player has cleared 15+, 20+, 25+ or 30+ disposals in their last 10 games.",
    color: "#f59e0b",
  },
  {
    icon: <BarChart2 size={20} />,
    label: "Match-based views",
    sub: "Filter by fixture. See all players in a single match side by side.",
    color: "#38bdf8",
  },
  {
    icon: <TrendingUp size={20} />,
    label: "Simple projections",
    sub: "Each player gets a projection for the current round based on recent form and matchup context.",
    color: "#E0AE2D",
  },
  {
    icon: <CheckCircle size={20} />,
    label: "Consistency labels",
    sub: "HIGH, MEDIUM, or LOW confidence — based on how reliably a player hits their projection range.",
    color: "#a78bfa",
  },
  {
    icon: <Star size={20} />,
    label: "Fantasy Hub included",
    sub: "Must Buys, Trap Alerts, Captain Picks and Rankings — all accessible from one subscription.",
    color: "#E8855A",
  },
];

export default function LandingTrust() {
  return (
    <section style={{ background: "#05070A", padding: "clamp(64px, 6vw, 96px) clamp(20px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(34,197,94,0.65)",
            margin: "0 0 6px",
          }}>
            What you get
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 8px",
          }}>
            Everything in one place.
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 420, margin: "0 auto",
            lineHeight: 1.5,
          }}>
            Real AFL data, updated before every round.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
        }}>
          {FEATURES.map(({ icon, label, sub, color }) => (
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
