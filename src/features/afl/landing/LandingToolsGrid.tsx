import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Zap, GitCompare, Star, Users, ChevronRight } from "lucide-react";

const TOOLS = [
  {
    icon: <BarChart3 size={20} />,
    title: "Rankings",
    desc: "630+ players ranked by projection, value, and form. Every position, every round.",
    to: "/fantasy/rankings",
    color: "#E0AE2D",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Market Watch",
    desc: "Trade signals, price gaps, and breakeven data in one view. Spot value and risk at a glance.",
    to: "/fantasy/market-watch",
    color: "#22C55E",
  },
  {
    icon: <Zap size={20} />,
    title: "Current Week",
    desc: "Captain picks, trap alerts and value calls — all in one weekly view.",
    to: "/fantasy/current-week",
    color: "#E8855A",
  },
  {
    icon: <GitCompare size={20} />,
    title: "Weekly Picks",
    desc: "Captain picks, trap alerts and value calls — all in one weekly view.",
    to: "/fantasy/current-week",
    color: "#F87171",
  },
  {
    icon: <Star size={20} />,
    title: "Fantasy Hub",
    desc: "Weekly fantasy decisions — captains, traps, value targets and picks in one place.",
    to: "/fantasy",
    color: "#E0AE2D",
  },
  {
    icon: <Users size={20} />,
    title: "Stat Board",
    desc: "Player hit rates and team scoring trends — disposals, goals, score, projections by round.",
    to: "/stat-board",
    color: "#22C55E",
  },
] as const;

export default function LandingToolsGrid() {
  return (
    <section style={{ background: "#06080C", padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Neeko+</p>
          <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 14 }}>
            Every Tool. One Place.
          </h2>
          <p style={{ fontSize: 14, color: "#606060", maxWidth: 440, margin: "0 auto" }}>
            Built for one goal — giving you an edge before lockout.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {TOOLS.map(({ icon, title, desc, to, color }) => (
            <Link key={title} to={to} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "22px 20px", display: "flex", gap: 16, alignItems: "flex-start", transition: "all 0.18s ease", cursor: "pointer" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.055)";
                  el.style.borderColor = `${color}30`;
                  el.style.boxShadow = `0 4px 24px rgba(0,0,0,0.30)`;
                  el.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.03)";
                  el.style.borderColor = "rgba(255,255,255,0.06)";
                  el.style.boxShadow = "none";
                  el.style.transform = "none";
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <h3 style={{ fontSize: 14.5, fontWeight: 800, color: "#EAEAEA", letterSpacing: "-0.01em" }}>{title}</h3>
                    <ChevronRight size={14} style={{ color: "#333", flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.6 }}>{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
