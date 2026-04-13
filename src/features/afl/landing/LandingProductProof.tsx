import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Star, User, Zap, ArrowRight, Lock } from "lucide-react";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { fmtPrice } from "@/features/afl/market-watch/helpers";

const GOLD = "#E0AE2D";

// ── Signal helpers ─────────────────────────────────────────────────────────────

function resolveSignal(row: RankingRow): { label: string; color: string } {
  const raw = (row.action ?? row.signal_tag ?? row.signal ?? "").toUpperCase();
  if (raw === "STRONG_START" || raw === "START" || raw === "STRONG_UP" || raw === "UP" || raw === "BUY") {
    return { label: "BUY", color: "#22c55e" };
  }
  if (raw === "STRONG_SIT" || raw === "SIT" || raw === "STRONG_DOWN" || raw === "DOWN" || raw === "SELL") {
    return { label: "SELL", color: "#f87171" };
  }
  return { label: "HOLD", color: GOLD };
}

function resolveMWCategory(row: RankingRow): { label: string; color: string } {
  const cat = (row.category ?? row.signal ?? "").toUpperCase();
  if (cat.includes("BREAK") || cat.includes("UP") || cat.includes("BUY") || cat.includes("START")) {
    return { label: "BREAKOUT", color: "#34d170" };
  }
  if (cat.includes("TRAP") || cat.includes("DOWN") || cat.includes("SELL") || cat.includes("SIT")) {
    return { label: "TRAP", color: "#f87171" };
  }
  return { label: "WATCH", color: GOLD };
}

function resolveCaptainRating(row: RankingRow): { label: string; color: string } {
  const score = row.captain_score ?? 0;
  const conf = row.projection_confidence ?? 0;
  if (score >= 80 || (score >= 70 && conf >= 70)) return { label: "LOCK", color: "#fbbf24" };
  if (score >= 60) return { label: "SAFE", color: GOLD };
  if (score >= 40) return { label: "POD", color: "rgba(255,255,255,0.45)" };
  return { label: "RISKY", color: "#f87171" };
}

// ── Derived data builders ─────────────────────────────────────────────────────

function buildRankingsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => !p.is_injured && !p.is_bye && (p.games_played ?? 0) >= 3 && (p.projection ?? 0) > 50)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);
}

function buildMarketWatchRows(players: RankingRow[]): RankingRow[] {
  const candidates = players.filter(
    p => !p.is_injured && !p.is_bye && (p.price ?? 0) > 0 && (p.games_played ?? 0) >= 2
  );
  const breakouts = candidates
    .filter(p => {
      const cat = (p.category ?? p.signal ?? "").toUpperCase();
      return cat.includes("BREAK") || cat.includes("UP") || cat.includes("BUY") || cat.includes("START");
    })
    .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
    .slice(0, 2);
  const traps = candidates
    .filter(p => {
      const cat = (p.category ?? p.signal ?? "").toUpperCase();
      return cat.includes("TRAP") || cat.includes("DOWN") || cat.includes("SELL") || cat.includes("SIT");
    })
    .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))
    .slice(0, 2);
  const watches = candidates
    .filter(p => !breakouts.includes(p) && !traps.includes(p))
    .sort((a, b) => Math.abs(b.value_score ?? 0) - Math.abs(a.value_score ?? 0))
    .slice(0, 1);
  return [...breakouts, ...watches, ...traps].slice(0, 5);
}

function buildCaptainsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => !p.is_injured && !p.is_bye && (p.captain_score ?? 0) > 0 && (p.projection ?? 0) > 50)
    .sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0))
    .slice(0, 5);
}

function buildPlayersRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => (p.games_played ?? 0) >= 3 && (p.last_5_avg ?? 0) > 0)
    .sort((a, b) => (b.neeko_rating ?? 0) - (a.neeko_rating ?? 0))
    .slice(0, 5);
}

function buildEdgeRows(players: RankingRow[]): RankingRow[] {
  const eligible = players.filter(
    p => !p.is_injured && !p.is_bye && (p.projection ?? 0) > 0
  );
  const mustStart = eligible
    .filter(p => {
      const sig = (p.action ?? p.signal ?? "").toUpperCase();
      return sig === "START" || sig === "STRONG_START" || sig === "BUY";
    })
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 2);
  const breakouts = eligible
    .filter(p => !mustStart.includes(p) && (p.trend_score ?? 0) > 5)
    .sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))
    .slice(0, 2);
  const sits = eligible
    .filter(p => {
      const sig = (p.action ?? p.signal ?? "").toUpperCase();
      return sig === "SIT" || sig === "STRONG_SIT" || sig === "SELL";
    })
    .sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))
    .slice(0, 1);
  return [...mustStart, ...breakouts, ...sits].slice(0, 5);
}

function resolveEdgeTag(row: RankingRow): { label: string; color: string } {
  const sig = (row.action ?? row.signal ?? "").toUpperCase();
  const trend = row.trend_score ?? 0;
  if (sig === "STRONG_START" || sig === "BUY") return { label: "MUST START", color: "#22c55e" };
  if (sig === "START") return { label: "START", color: "#34d170" };
  if (trend > 10) return { label: "BREAKOUT", color: "#34d170" };
  if (trend > 3) return { label: "WATCH", color: GOLD };
  if (sig === "SIT" || sig === "STRONG_SIT" || sig === "SELL") return { label: "SIT", color: "#f87171" };
  return { label: "HOLD", color: GOLD };
}

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = "rankings" | "market-watch" | "captains" | "players" | "current-round";

type TabConfig = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  heading: string;
  desc: string;
  to: string;
  ctaLabel: string;
  accentColor: string;
};

const TABS: TabConfig[] = [
  {
    id: "rankings",
    label: "Rankings",
    icon: <BarChart3 size={14} />,
    heading: "Full Player Rankings",
    desc: "See who to pick — based on real projections, value scores, and trend signals.",
    to: "/sports/afl/rankings",
    ctaLabel: "Explore Rankings",
    accentColor: GOLD,
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
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    desc: "Your full weekly decision hub — trades, captains, and start/sit all in one place.",
    to: "/sports/afl/current-round",
    ctaLabel: "View Edge Board",
    accentColor: "#a78bfa",
  },
];

// ── Row renderers ─────────────────────────────────────────────────────────────

type RowProps = { row: RankingRow; index: number; tabId: TabId; locked: boolean };

function DataRow({ row, index, tabId, locked }: RowProps) {
  const accent = TABS.find(t => t.id === tabId)?.accentColor ?? GOLD;

  let rightVal: string;
  let tag: { label: string; color: string };

  if (tabId === "rankings") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    rightVal = proj != null ? `${proj} pts` : "—";
    tag = resolveSignal(row);
  } else if (tabId === "market-watch") {
    rightVal = fmtPrice(row.price);
    tag = resolveMWCategory(row);
  } else if (tabId === "captains") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    const matchup = row.matchup_label ?? "Neutral";
    rightVal = proj != null ? `${proj} pts` : matchup;
    tag = resolveCaptainRating(row);
  } else if (tabId === "players") {
    const avg5 = row.last_5_avg != null ? `${Math.round(row.last_5_avg)} avg` : "—";
    rightVal = avg5;
    tag = resolveSignal(row);
  } else {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    rightVal = proj != null ? `${proj} proj` : "—";
    tag = resolveEdgeTag(row);
  }

  const subtitle =
    tabId === "players"
      ? [`$${Math.round((row.price ?? 0) / 1000)}K`, row.position].filter(Boolean).join(" · ")
      : [row.position, row.team].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 22px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        position: "relative",
        ...(locked ? {
          filter: "blur(3.5px)",
          userSelect: "none",
          pointerEvents: "none",
          opacity: 0.5,
        } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: locked ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800,
          color: "rgba(255,255,255,0.22)",
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 600, color: "#EAEAEA",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.player_name}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 1 }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>
          {rightVal}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: tag.color,
          background: `${tag.color}18`,
          border: `1px solid ${tag.color}30`,
          padding: "3px 9px",
          borderRadius: 999,
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}>
          {tag.label}
        </span>
      </div>
    </div>
  );
}

function LockedOverlayRow({ index }: { index: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "11px 22px",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2,
        gap: 6,
      }}>
        <Lock size={12} color="rgba(255,255,255,0.25)" />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>
          Neeko+ to unlock
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, filter: "blur(4px)", opacity: 0.3, userSelect: "none" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.2)" }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ width: 110, height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginBottom: 5 }} />
          <div style={{ width: 70, height: 9, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, filter: "blur(4px)", opacity: 0.3, userSelect: "none" }}>
        <div style={{ width: 44, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
        <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.06)", borderRadius: 999 }} />
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 22px",
          borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div>
              <div style={{ width: 130, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
              <div style={{ width: 80, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginTop: 5 }} />
            </div>
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  rankingsPlayers: RankingRow[];
  rankingsLoading: boolean;
  isPremium?: boolean;
}

export default function LandingProductProof({ rankingsPlayers, rankingsLoading, isPremium = false }: Props) {
  const [activeId, setActiveId] = useState<TabId>("rankings");
  const [panelVisible, setPanelVisible] = useState(true);
  const pendingId = useRef<TabId | null>(null);

  const VISIBLE_ROWS = isPremium ? 5 : 3;
  const LOCKED_ROWS = isPremium ? 0 : 2;

  function handleTabClick(id: TabId) {
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

  const active = TABS.find(t => t.id === activeId) ?? TABS[0];

  const derivedRows: RankingRow[] = (() => {
    if (rankingsLoading || rankingsPlayers.length === 0) return [];
    switch (activeId) {
      case "rankings":      return buildRankingsRows(rankingsPlayers);
      case "market-watch":  return buildMarketWatchRows(rankingsPlayers);
      case "captains":      return buildCaptainsRows(rankingsPlayers);
      case "players":       return buildPlayersRows(rankingsPlayers);
      case "current-round": return buildEdgeRows(rankingsPlayers);
    }
  })();

  const visibleRows = derivedRows.slice(0, VISIBLE_ROWS);
  const hasData = !rankingsLoading && derivedRows.length > 0;

  function renderRows() {
    if (rankingsLoading) return <SkeletonRows />;
    if (!hasData) {
      return (
        <div style={{ padding: "28px 22px", textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
          Data loading shortly — check back before lockout.
        </div>
      );
    }
    return (
      <>
        {visibleRows.map((row, i) => (
          <DataRow key={row.player_id ?? i} row={row} index={i} tabId={activeId} locked={false} />
        ))}
        {Array.from({ length: LOCKED_ROWS }).map((_, i) => (
          <LockedOverlayRow key={`locked-${i}`} index={visibleRows.length + i} />
        ))}
      </>
    );
  }

  return (
    <section style={{
      background: "linear-gradient(180deg, #0d0c0a 0%, #0a0909 100%)",
      padding: "clamp(64px, 6vw, 88px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
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
            margin: "0 auto",
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
          {/* Tab nav */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TABS.map(tab => {
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
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#22c55e",
                        boxShadow: "0 0 6px rgba(34,197,94,0.7)",
                      }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel */}
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
            {/* Panel header */}
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
                </div>
                <p style={{
                  margin: 0, fontSize: 11, color: "rgba(255,255,255,0.36)",
                  fontWeight: 500, lineHeight: 1.4, marginTop: 2,
                }}>
                  {active.desc}
                </p>
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: "6px 0" }}>
              {renderRows()}
            </div>

            {/* Footer */}
            <div style={{
              padding: "14px 22px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(0,0,0,0.18)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12,
            }}>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.22)", flexShrink: 0 }}>
                {isPremium
                  ? "Live data — updated before every round lockout"
                  : "Showing top 3 — unlock all with Neeko+"}
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
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
