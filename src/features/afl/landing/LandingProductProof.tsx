import { useState } from "react";
import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Star, User, Zap, ArrowRight } from "lucide-react";

const GOLD = "#E0AE2D";

type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  heading: string;
  desc: string;
  to: string;
  ctaLabel: string;
  accentColor: string;
  mockRows: { name: string; val: string; tag: string; tagColor: string }[];
};

const TABS: Tab[] = [
  {
    id: "rankings",
    label: "Rankings",
    icon: <BarChart3 size={14} />,
    heading: "Full Player Rankings",
    desc: "Complete player rankings with projections, form, trend signals, and value scores — every position, every round.",
    to: "/sports/afl/rankings",
    ctaLabel: "Explore Rankings",
    accentColor: GOLD,
    mockRows: [
      { name: "Marcus Bontempelli", val: "128 pts", tag: "BUY", tagColor: "#22c55e" },
      { name: "Clayton Oliver", val: "121 pts", tag: "BUY", tagColor: "#22c55e" },
      { name: "Patrick Cripps", val: "118 pts", tag: "HOLD", tagColor: GOLD },
      { name: "Zach Merrett", val: "115 pts", tag: "HOLD", tagColor: GOLD },
      { name: "Tom Mitchell", val: "109 pts", tag: "SELL", tagColor: "#f87171" },
    ],
  },
  {
    id: "market-watch",
    label: "Market Watch",
    icon: <TrendingUp size={14} />,
    heading: "Market Watch",
    desc: "Identify undervalued players and avoid traps instantly. Price-vs-projection gaps, breakeven tracking, and trade signals all in one view.",
    to: "/sports/afl/market-watch",
    ctaLabel: "Open Market Watch",
    accentColor: "#34d170",
    mockRows: [
      { name: "Matt Rowell", val: "$412k", tag: "UNDERVALUED", tagColor: "#34d170" },
      { name: "Will Ashcroft", val: "$398k", tag: "BREAKOUT", tagColor: "#34d170" },
      { name: "Sam Walsh", val: "$545k", tag: "WATCH", tagColor: GOLD },
      { name: "Jordan Dawson", val: "$521k", tag: "OVERPRICED", tagColor: "#f87171" },
      { name: "Lachie Neale", val: "$611k", tag: "TRAP", tagColor: "#f87171" },
    ],
  },
  {
    id: "captains",
    label: "Captains",
    icon: <Star size={14} />,
    heading: "Captain Picks",
    desc: "Top projected captains ranked by matchup context, form, and confidence score — so you know exactly who to double.",
    to: "/sports/afl/captains",
    ctaLabel: "View Captain Picks",
    accentColor: "#fbbf24",
    mockRows: [
      { name: "Marcus Bontempelli", val: "vs STK (H)", tag: "HIGH CONF", tagColor: "#fbbf24" },
      { name: "Clayton Oliver", val: "vs BRL (A)", tag: "HIGH CONF", tagColor: "#fbbf24" },
      { name: "Patrick Cripps", val: "vs SYD (H)", tag: "MID CONF", tagColor: GOLD },
      { name: "Zach Merrett", val: "vs GCS (H)", tag: "MID CONF", tagColor: GOLD },
      { name: "Tom Mitchell", val: "vs WBD (A)", tag: "RISKY", tagColor: "#f87171" },
    ],
  },
  {
    id: "players",
    label: "Players",
    icon: <User size={14} />,
    heading: "Player Profiles",
    desc: "Deep player insights — projections, historical form, matchup context, price movement, and AI analysis all in one place.",
    to: "/sports/afl/rankings",
    ctaLabel: "View Player Pages",
    accentColor: "#60a5fa",
    mockRows: [
      { name: "Last 5 avg", val: "118.6 pts", tag: "FORM UP", tagColor: "#34d170" },
      { name: "Season avg", val: "109.2 pts", tag: "ABOVE AVG", tagColor: GOLD },
      { name: "Breakeven", val: "82 pts", tag: "BEATS BE", tagColor: "#34d170" },
      { name: "Current price", val: "$612k", tag: "UNDERVALUED", tagColor: "#34d170" },
      { name: "Next opponent", val: "vs STK (H)", tag: "EASY", tagColor: "#34d170" },
    ],
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    desc: "Start/sit decisions, must-have targets, and trap alerts — everything you need to finalise your team before lockout.",
    to: "/sports/afl/current-round",
    ctaLabel: "View Edge Board",
    accentColor: "#60a5fa",
    mockRows: [
      { name: "Marcus Bontempelli", val: "128 proj", tag: "MUST START", tagColor: "#34d170" },
      { name: "Will Ashcroft", val: "102 proj", tag: "BREAKOUT", tagColor: "#34d170" },
      { name: "Izak Rankine", val: "94 proj", tag: "WATCH", tagColor: GOLD },
      { name: "Jordan Dawson", val: "78 proj", tag: "SIT", tagColor: "#f87171" },
      { name: "Lachie Neale", val: "71 proj", tag: "TRAP", tagColor: "#f87171" },
    ],
  },
];

export default function LandingProductProof() {
  const [activeId, setActiveId] = useState("rankings");
  const active = TABS.find(t => t.id === activeId) ?? TABS[0];

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
            Product Preview
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.1,
            margin: "0 0 12px",
          }}>
            Inside Neeko+
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 400, margin: "0 auto",
            lineHeight: 1.55,
          }}>
            The tools serious AFL Fantasy coaches use each week.
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 20,
          alignItems: "start",
        }}>
          {/* LEFT — tab nav */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TABS.map(tab => {
              const isActive = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${isActive ? tab.accentColor + "35" : "rgba(255,255,255,0.06)"}`,
                    background: isActive ? `${tab.accentColor}12` : "rgba(255,255,255,0.025)",
                    color: isActive ? tab.accentColor : "rgba(255,255,255,0.48)",
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.16s ease",
                    outline: "none",
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0 }}>{tab.icon}</span>
                  {tab.label}
                  {isActive && (
                    <div style={{
                      marginLeft: "auto",
                      width: 5, height: 5, borderRadius: "50%",
                      background: tab.accentColor,
                      flexShrink: 0,
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* RIGHT — preview panel */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${active.accentColor}22`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${active.accentColor}10 inset`,
            transition: "border-color 0.22s ease",
          }}>
            {/* Panel top bar */}
            <div style={{
              padding: "16px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: `linear-gradient(to right, ${active.accentColor}10, transparent)`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${active.accentColor}18`,
                border: `1px solid ${active.accentColor}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: active.accentColor,
              }}>
                {active.icon}
              </div>
              <div>
                <p style={{
                  margin: 0, fontSize: 13, fontWeight: 800,
                  color: "#F0F0F0", letterSpacing: "-0.01em",
                }}>
                  {active.heading}
                </p>
                <p style={{
                  margin: 0, fontSize: 11, color: "rgba(255,255,255,0.36)",
                  fontWeight: 500, lineHeight: 1.4, marginTop: 2,
                }}>
                  {active.desc}
                </p>
              </div>
            </div>

            {/* Mock data rows */}
            <div style={{ padding: "6px 0" }}>
              {active.mockRows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 22px",
                    borderBottom: i < active.mockRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: "rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 800,
                      color: "rgba(255,255,255,0.22)",
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#EAEAEA" }}>
                      {row.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: "rgba(255,255,255,0.45)",
                    }}>
                      {row.val}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: row.tagColor,
                      background: `${row.tagColor}15`,
                      border: `1px solid ${row.tagColor}28`,
                      padding: "3px 9px",
                      borderRadius: 999,
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}>
                      {row.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Panel CTA */}
            <div style={{
              padding: "16px 22px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(0,0,0,0.18)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <p style={{
                margin: 0, fontSize: 11,
                color: "rgba(255,255,255,0.22)",
              }}>
                Updated before every round lockout
              </p>
              <Link
                to={active.to}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontSize: 12, fontWeight: 700,
                  color: active.accentColor,
                  textDecoration: "none",
                  border: `1px solid ${active.accentColor}30`,
                  padding: "7px 14px",
                  borderRadius: 8,
                  background: `${active.accentColor}10`,
                  transition: "all 0.16s ease",
                  letterSpacing: "0.01em",
                }}
              >
                {active.ctaLabel} <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
