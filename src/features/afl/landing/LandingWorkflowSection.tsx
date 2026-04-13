import { Link } from "react-router-dom";
import { TrendingUp, Target, Zap, ChevronRight } from "lucide-react";

const CARDS = [
  {
    num: "1",
    icon: <Target size={20} />,
    title: "Find the Right Plays",
    lines: ["Top projected scorers before lockout", "Must buys and captain options, data-backed"],
    color: "#E0AE2D",
    to: "/sports/afl/rankings",
    cta: "View Rankings",
  },
  {
    num: "2",
    icon: <TrendingUp size={20} />,
    title: "Trade With Confidence",
    lines: ["Spot undervalued players early", "Avoid overpriced traps before you get burned"],
    color: "#22C55E",
    to: "/sports/afl/market-watch",
    cta: "Open Market Watch",
  },
  {
    num: "3",
    icon: <Zap size={20} />,
    title: "Make Faster Decisions",
    lines: ["One clear weekly workflow — no guesswork", "Rankings, edge board, and signals in one place"],
    color: "#60A5FA",
    to: "/sports/afl/current-round",
    cta: "View This Round",
  },
] as const;

export default function LandingWorkflowSection() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0f0e0c 0%, #141210 100%)", padding: "96px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Your Weekly Workflow</p>
          <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: 0 }}>
            How Neeko Helps You Win This Week
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {CARDS.map(({ num, icon, title, lines, color, to, cta }) => (
            <Link key={num} to={to} style={{ textDecoration: "none" }}>
              <div
                style={{ background: "rgba(255,255,255,0.035)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "28px 26px 24px", position: "relative", overflow: "hidden", transition: "all 0.22s ease", height: "100%", boxSizing: "border-box", cursor: "pointer" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.06)";
                  el.style.borderColor = `${color}35`;
                  el.style.boxShadow = `0 8px 40px rgba(0,0,0,0.40), 0 0 0 1px ${color}18 inset`;
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.035)";
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.boxShadow = "none";
                  el.style.transform = "none";
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}55, transparent)` }} />

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${color}18`, border: `1.5px solid ${color}35`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto", flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: 0 }}>{num}</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#F5F5F5", lineHeight: 1.25, marginBottom: 12, letterSpacing: "-0.02em" }}>{title}</h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 22 }}>
                  {lines.map(line => (
                    <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, opacity: 0.55, flexShrink: 0, marginTop: 6 }} />
                      <span style={{ fontSize: 13.5, color: "#808080", lineHeight: 1.55 }}>{line}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color }}>
                  {cta} <ChevronRight size={13} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
