import { Link } from "react-router-dom";
import { ChartBar as BarChart2, TrendingUp, CircleCheck as CheckCircle, ChevronRight } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: <BarChart2 size={22} />,
    title: "Scan Rankings",
    sub: "600+ players ranked by projection, value, and signal.",
    color: "#E0AE2D",
    to: "/sports/afl/rankings",
    cta: "View Rankings",
  },
  {
    num: "02",
    icon: <TrendingUp size={22} />,
    title: "Spot Value & Traps",
    sub: "Price-vs-projection gaps surface real buys. Trap alerts stop costly mistakes.",
    color: "#34d170",
    to: "/sports/afl/market-watch",
    cta: "Open Market Watch",
  },
  {
    num: "03",
    icon: <CheckCircle size={22} />,
    title: "Lock In Your Team",
    sub: "Edge board, captain picks, and start/sit — one clear workflow before lockout.",
    color: "#60A5FA",
    to: "/sports/afl/current-round",
    cta: "View This Round",
  },
] as const;

export default function LandingWorkflowSection() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0d0c0a 0%, #111009 100%)", padding: "60px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", margin: "0 0 10px" }}>
            Your Weekly Workflow
          </p>
          <h2 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2.1rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: "0 0 10px" }}>
            How You Win Your Week in 30 Seconds
          </h2>
          <p style={{ fontSize: "clamp(12px, 0.85vw, 14px)", color: "rgba(255,255,255,0.40)", maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
            Three steps. Real data. No guesswork.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {STEPS.map(({ num, icon, title, sub, color, to, cta }) => (
            <Link key={num} to={to} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "22px 22px 20px", position: "relative", overflow: "hidden", transition: "all 0.18s ease", height: "100%", boxSizing: "border-box", cursor: "pointer" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.05)";
                  el.style.borderColor = `${color}28`;
                  el.style.boxShadow = `0 12px 36px rgba(0,0,0,0.50), 0 0 0 1px ${color}12 inset`;
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.03)";
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.boxShadow = "none";
                  el.style.transform = "none";
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}45, transparent)` }} />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: `${color}15`, border: `1.5px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <span style={{ fontSize: 26, fontWeight: 900, color: "rgba(255,255,255,0.055)", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{num}</span>
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#F5F5F5", lineHeight: 1.2, margin: "0 0 7px", letterSpacing: "-0.02em" }}>{title}</h3>
                <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.52)", fontWeight: 500, margin: "0 0 18px", lineHeight: 1.55 }}>{sub}</p>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color, letterSpacing: "0.02em" }}>
                  {cta} <ChevronRight size={12} strokeWidth={2.5} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
