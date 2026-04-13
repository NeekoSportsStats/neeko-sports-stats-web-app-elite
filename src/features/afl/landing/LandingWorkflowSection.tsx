import { Link } from "react-router-dom";
import { ChartBar as BarChart2, TrendingUp, CircleCheck as CheckCircle } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: <BarChart2 size={22} />,
    title: "Scan Rankings",
    sub: "Find top projected players instantly",
    lines: ["600+ players ranked by projection and value", "Filter by position, team, or signal in seconds"],
    color: "#E0AE2D",
    to: "/sports/afl/rankings",
    cta: "View Rankings",
  },
  {
    num: "02",
    icon: <TrendingUp size={22} />,
    title: "Spot Value & Traps",
    sub: "Identify underpriced players and avoid losses",
    lines: ["Price-vs-projection gap flags real opportunities", "Trap alerts stop you overpaying before lockout"],
    color: "#34d170",
    to: "/sports/afl/market-watch",
    cta: "Open Market Watch",
  },
  {
    num: "03",
    icon: <CheckCircle size={22} />,
    title: "Lock In Your Team",
    sub: "Make confident decisions before lockout",
    lines: ["One clear edge board — no second-guessing", "Captain picks and start/sit backed by data"],
    color: "#60A5FA",
    to: "/sports/afl/current-round",
    cta: "View This Round",
  },
] as const;

export default function LandingWorkflowSection() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0d0c0a 0%, #111009 100%)", padding: "80px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 12, margin: "0 0 12px" }}>
            Your Weekly Workflow
          </p>
          <h2 style={{ fontSize: "clamp(1.65rem, 2.8vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: "0 0 12px" }}>
            How You Win Your Week in 30 Seconds
          </h2>
          <p style={{ fontSize: "clamp(13px, 0.9vw, 15px)", color: "rgba(255,255,255,0.38)", maxWidth: 480, margin: "0 auto", lineHeight: 1.55 }}>
            Three steps. Real data. No guesswork.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {STEPS.map(({ num, icon, title, sub, lines, color, to, cta }) => (
            <Link key={num} to={to} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "28px 26px 26px", position: "relative", overflow: "hidden", transition: "all 0.22s ease", height: "100%", boxSizing: "border-box", cursor: "pointer" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.055)";
                  el.style.borderColor = `${color}30`;
                  el.style.boxShadow = `0 10px 40px rgba(0,0,0,0.45), 0 0 0 1px ${color}15 inset`;
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
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}50, transparent)` }} />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}16`, border: `1.5px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <span style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.06)", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{num}</span>
                </div>

                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#F5F5F5", lineHeight: 1.2, marginBottom: 4, letterSpacing: "-0.02em" }}>{title}</h3>
                <p style={{ fontSize: 12.5, color: color, fontWeight: 600, marginBottom: 16, opacity: 0.8 }}>{sub}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {lines.map(line => (
                    <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, opacity: 0.5, flexShrink: 0, marginTop: 7 }} />
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.55 }}>{line}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color, letterSpacing: "0.02em" }}>
                  {cta}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
