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
    <section style={{ background: "#05070A", padding: "clamp(44px, 4.5vw, 64px) clamp(20px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(34,197,94,0.65)",
            margin: "0 0 6px",
          }}>
            What you get
          </p>
          <h2 style={{
            fontSize: "clamp(1.4rem, 2.4vw, 2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 6px",
          }}>
            What the Stat Board gives you.
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.42)",
            maxWidth: 400, margin: "0 auto",
            lineHeight: 1.5,
          }}>
            Real AFL data, updated before every round.
          </p>
        </div>

        <div
          className="trust-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {FEATURES.map(({ icon, label, sub, color }) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "20px 18px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(to right, transparent, ${color}44, transparent)`,
              }} />
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${color}14`,
                border: `1px solid ${color}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color, marginBottom: 12, flexShrink: 0,
              }}>
                {icon}
              </div>
              <p style={{
                fontSize: 13.5, fontWeight: 700,
                color: "#ECECEC",
                margin: "0 0 5px",
                letterSpacing: "-0.01em",
              }}>
                {label}
              </p>
              <p style={{
                fontSize: 12.5, color: "rgba(255,255,255,0.45)",
                lineHeight: 1.55, margin: 0,
              }}>
                {sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .trust-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 500px) {
          .trust-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
