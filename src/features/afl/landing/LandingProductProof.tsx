import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Star, User, Zap, ArrowRight } from "lucide-react";
import type { RankingRow } from "@/features/afl/rankings/components/types";

const GOLD = "#E0AE2D";

function resolveSignal(row: RankingRow): { label: string; color: string } {
  const raw = (row.action ?? row.signal_tag ?? row.signal ?? "").toUpperCase();
  if (raw === "STRONG_START" || raw === "START" || raw === "STRONG_UP" || raw === "UP") {
    return { label: "BUY", color: "#22c55e" };
  }
  if (raw === "STRONG_SIT" || raw === "SIT" || raw === "STRONG_DOWN" || raw === "DOWN") {
    return { label: "SELL", color: "#f87171" };
  }
  return { label: "HOLD", color: GOLD };
}

type StaticRow = { name: string; val: string; tag: string; tagColor: string };

type TabConfig = {
  id: string;
  label: string;
  icon: React.ReactNode;
  heading: string;
  desc: string;
  to: string;
  ctaLabel: string;
  accentColor: string;
  isLive?: boolean;
  staticRows?: StaticRow[];
};

const STATIC_TABS: TabConfig[] = [
  {
    id: "rankings",
    label: "Rankings",
    icon: <BarChart3 size={14} />,
    heading: "Full Player Rankings",
    desc: "See who to pick — based on real projections, value scores, and trend signals.",
    to: "/sports/afl/rankings",
    ctaLabel: "Explore Rankings",
    accentColor: GOLD,
    isLive: true,
  },
  {
    id: "market-watch",
    label: "Market Watch",
    icon: <TrendingUp size={14} />,
    heading: "Market Watch",
    desc: "Find undervalued players and avoid traps instantly.",
    to: "/sports/afl/market-watch",
    ctaLabel: "Open Market Watch",
    accentColor: "#34d170",
    staticRows: [
      { name: "Undervalued Midfielder", val: "$412k", tag: "UNDERVALUED", tagColor: "#34d170" },
      { name: "Breakout Candidate", val: "$398k", tag: "BREAKOUT", tagColor: "#34d170" },
      { name: "Stable Premium", val: "$545k", tag: "WATCH", tagColor: GOLD },
      { name: "Overpriced Defender", val: "$521k", tag: "OVERPRICED", tagColor: "#f87171" },
      { name: "Form Trap", val: "$611k", tag: "TRAP", tagColor: "#f87171" },
    ],
  },
  {
    id: "captains",
    label: "Captains",
    icon: <Star size={14} />,
    heading: "Captain Picks",
    desc: "Know the best captain picks before lockout.",
    to: "/sports/afl/captains",
    ctaLabel: "View Captain Picks",
    accentColor: "#fbbf24",
    staticRows: [
      { name: "Premium Midfielder", val: "Favourable", tag: "HIGH CONF", tagColor: "#fbbf24" },
      { name: "Elite Scorer", val: "Favourable", tag: "HIGH CONF", tagColor: "#fbbf24" },
      { name: "Top Forward", val: "Neutral", tag: "MID CONF", tagColor: GOLD },
      { name: "Reliable Defender", val: "Neutral", tag: "MID CONF", tagColor: GOLD },
      { name: "Risky Pick", val: "Difficult", tag: "RISKY", tagColor: "#f87171" },
    ],
  },
  {
    id: "players",
    label: "Players",
    icon: <User size={14} />,
    heading: "Player Profiles",
    desc: "Understand form, value, and projections for every player.",
    to: "/sports/afl/rankings",
    ctaLabel: "View Player Pages",
    accentColor: "#60a5fa",
    staticRows: [
      { name: "Last 5 avg", val: "118.6 pts", tag: "FORM UP", tagColor: "#34d170" },
      { name: "Season avg", val: "109.2 pts", tag: "ABOVE AVG", tagColor: GOLD },
      { name: "Breakeven", val: "82 pts", tag: "BEATS BE", tagColor: "#34d170" },
      { name: "Current price", val: "$612k", tag: "UNDERVALUED", tagColor: "#34d170" },
      { name: "Next matchup", val: "Favourable", tag: "EASY", tagColor: "#34d170" },
    ],
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    desc: "Your full weekly decision hub — trades, captains, and start/sit all in one place.",
    to: "/sports/afl/current-round",
    ctaLabel: "View Edge Board",
    accentColor: "#60a5fa",
    staticRows: [
      { name: "Top Scorer", val: "128 proj", tag: "MUST START", tagColor: "#34d170" },
      { name: "Breakout Pick", val: "102 proj", tag: "BREAKOUT", tagColor: "#34d170" },
      { name: "Watch List", val: "94 proj", tag: "WATCH", tagColor: GOLD },
      { name: "Risky Start", val: "78 proj", tag: "SIT", tagColor: "#f87171" },
      { name: "Form Trap", val: "71 proj", tag: "TRAP", tagColor: "#f87171" },
    ],
  },
];

interface Props {
  rankingsPlayers: RankingRow[];
  rankingsLoading: boolean;
}

function RankingsSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 22px",
            borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div style={{ width: 130, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 50, height: 12, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
            <div style={{ width: 44, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </>
  );
}

export default function LandingProductProof({ rankingsPlayers, rankingsLoading }: Props) {
  const [activeId, setActiveId] = useState("rankings");
  const [panelVisible, setPanelVisible] = useState(true);
  const pendingId = useRef<string | null>(null);

  function handleTabClick(id: string) {
    if (id === activeId) return;
    pendingId.current = id;
    setPanelVisible(false);
  }

  useEffect(() => {
    if (!panelVisible && pendingId.current) {
      const timer = setTimeout(() => {
        setActiveId(pendingId.current!);
        pendingId.current = null;
        setPanelVisible(true);
      }, 110);
      return () => clearTimeout(timer);
    }
  }, [panelVisible]);

  const active = STATIC_TABS.find(t => t.id === activeId) ?? STATIC_TABS[0];

  const liveRows: RankingRow[] = rankingsPlayers
    .filter(p =>
      !p.is_injured &&
      !p.is_bye &&
      (p.games_played ?? 0) >= 3 &&
      (p.projection ?? 0) > 50
    )
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);

  if (active.isLive) {
    console.log("[Landing Rankings Preview]", liveRows);
  }

  function renderRows() {
    if (active.isLive) {
      if (rankingsLoading) return <RankingsSkeletonRows />;
      if (liveRows.length === 0) {
        return (
          <div style={{ padding: "28px 22px", textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
            No rankings available right now.
          </div>
        );
      }
      return liveRows.map((row, i) => {
        const sig = resolveSignal(row);
        const proj = row.projection != null ? Math.round(row.projection) : null;
        return (
          <div
            key={row.player_id ?? i}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 22px",
              borderBottom: i < liveRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
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
              <div style={{ minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 13.5, fontWeight: 600, color: "#EAEAEA",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {row.player_name}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 1 }}>
                  {[row.position, row.team].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                {proj != null ? `${proj} pts` : "—"}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800,
                color: sig.color,
                background: `${sig.color}15`,
                border: `1px solid ${sig.color}28`,
                padding: "3px 9px",
                borderRadius: 999,
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}>
                {sig.label}
              </span>
            </div>
          </div>
        );
      });
    }

    return (active.staticRows ?? []).map((row, i) => (
      <div
        key={i}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 22px",
          borderBottom: i < (active.staticRows?.length ?? 0) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
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
    ));
  }

  return (
    <section style={{
      background: "linear-gradient(180deg, #0d0c0a 0%, #0a0909 100%)",
      padding: "64px clamp(16px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "left", marginBottom: 36 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 6px",
          }}>
            This Week's Edge
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 8px",
          }}>
            Inside Neeko+
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.85vw, 14px)",
            color: "rgba(255,255,255,0.38)",
            maxWidth: 520,
            lineHeight: 1.5,
          }}>
            Everything you need to make the right calls this week.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 20,
          alignItems: "start",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STATIC_TABS.map(tab => {
              const isActive = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)";
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.48)";
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${isActive ? tab.accentColor + "45" : "rgba(255,255,255,0.06)"}`,
                    background: isActive ? `${tab.accentColor}18` : "rgba(255,255,255,0.025)",
                    color: isActive ? tab.accentColor : "rgba(255,255,255,0.48)",
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.16s ease",
                    outline: "none",
                    boxShadow: isActive ? `0 0 0 1px ${tab.accentColor}20 inset` : "none",
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0 }}>{tab.icon}</span>
                  {tab.label}
                  {isActive && (
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexShrink: 0 }}>
                      {tab.isLive ? (
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#22c55e",
                          boxShadow: "0 0 6px rgba(34,197,94,0.7)",
                        }} />
                      ) : (
                        <div style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: tab.accentColor,
                        }} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{
            background: "rgba(255,255,255,0.03)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${active.accentColor}22`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px ${active.accentColor}10 inset`,
            transition: "border-color 0.22s ease, opacity 0.14s ease, transform 0.14s ease",
            opacity: panelVisible ? 1 : 0,
            transform: panelVisible ? "translateX(0)" : "translateX(6px)",
          }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 800,
                    color: "#F0F0F0", letterSpacing: "-0.01em",
                  }}>
                    {active.heading}
                  </p>
                  {active.isLive && (
                    <span style={{
                      fontSize: 9, fontWeight: 800,
                      color: "#22c55e",
                      background: "rgba(34,197,94,0.10)",
                      border: "1px solid rgba(34,197,94,0.22)",
                      padding: "2px 7px",
                      borderRadius: 999,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                      flexShrink: 0,
                    }}>
                      LIVE
                    </span>
                  )}
                </div>
                <p style={{
                  margin: 0, fontSize: 11, color: "rgba(255,255,255,0.36)",
                  fontWeight: 500, lineHeight: 1.4, marginTop: 2,
                }}>
                  {active.desc}
                </p>
              </div>
            </div>

            <div style={{ padding: "6px 0" }}>
              {renderRows()}
            </div>

            <div style={{
              padding: "16px 22px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(0,0,0,0.18)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
                {active.isLive
                  ? "Live data — updated before every round lockout"
                  : "Feature preview — see full data inside Neeko+"}
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
