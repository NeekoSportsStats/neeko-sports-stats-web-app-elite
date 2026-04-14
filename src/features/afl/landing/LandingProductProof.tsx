import { useState, useRef, useEffect, useMemo } from "react";
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
    return { label: "BREAKOUT", color: "#22c55e" };
  }
  if (cat.includes("TRAP") || cat.includes("DOWN") || cat.includes("SELL") || cat.includes("SIT")) {
    return { label: "TRAP", color: "#f87171" };
  }
  return { label: "WATCH", color: GOLD };
}

function resolveCaptainRating(row: RankingRow): { label: string; color: string } {
  const score = row.captain_score ?? 0;
  const conf = row.projection_confidence ?? 0;
  if (score >= 80 || (score >= 70 && conf >= 70)) return { label: "LOCK", color: "#E0AE2D" };
  if (score >= 60) return { label: "SAFE", color: GOLD };
  if (score >= 40) return { label: "POD", color: "rgba(255,255,255,0.45)" };
  return { label: "RISKY", color: "#f87171" };
}

function resolveEdgeTag(row: RankingRow): { label: string; color: string } {
  const sig = (row.action ?? row.signal ?? "").toUpperCase();
  const trend = row.trend_score ?? 0;
  if (sig === "STRONG_START" || sig === "BUY") return { label: "MUST START", color: "#22c55e" };
  if (sig === "START") return { label: "START", color: "#4ade80" };
  if (trend > 10) return { label: "BREAKOUT", color: "#4ade80" };
  if (trend > 3) return { label: "WATCH", color: GOLD };
  if (sig === "SIT" || sig === "STRONG_SIT" || sig === "SELL") return { label: "SIT", color: "#f87171" };
  return { label: "HOLD", color: GOLD };
}

// ── Derived data builders — no static fallback ────────────────────────────────

function buildRankingsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => !p.is_injured && !p.is_bye && (p.games_played ?? 0) >= 1 && (p.projection ?? 0) > 0)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);
}

function buildMarketWatchRows(players: RankingRow[]): RankingRow[] {
  const candidates = players.filter(
    p => !p.is_injured && !p.is_bye && (p.price ?? 0) > 0 && (p.games_played ?? 0) >= 1
  );
  const breakouts = candidates
    .filter(p => {
      const cat = (p.category ?? p.signal ?? "").toUpperCase();
      return cat.includes("BREAK") || cat.includes("UP") || cat.includes("BUY") || cat.includes("START");
    })
    .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
    .slice(0, 3);
  const traps = candidates
    .filter(p => {
      const cat = (p.category ?? p.signal ?? "").toUpperCase();
      return cat.includes("TRAP") || cat.includes("DOWN") || cat.includes("SELL") || cat.includes("SIT");
    })
    .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))
    .slice(0, 2);
  const result = [...breakouts, ...traps].slice(0, 5);
  if (result.length < 2) {
    return candidates.sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)).slice(0, 5);
  }
  return result;
}

function buildCaptainsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => !p.is_injured && !p.is_bye && (p.projection ?? 0) > 0)
    .sort((a, b) => (b.captain_score ?? b.projection ?? 0) - (a.captain_score ?? a.projection ?? 0))
    .slice(0, 5);
}

function buildPlayersRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => (p.games_played ?? 0) >= 1 && ((p.last_5_avg ?? 0) > 0 || (p.neeko_rating ?? 0) > 0))
    .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
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
    .slice(0, 3);
  const breakouts = eligible
    .filter(p => !mustStart.includes(p) && (p.trend_score ?? 0) > 5)
    .sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))
    .slice(0, 2);
  const result = [...mustStart, ...breakouts].slice(0, 5);
  if (result.length < 2) {
    return eligible.sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 5);
  }
  return result;
}

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = "rankings" | "market-watch" | "captains" | "players" | "current-round";

type TabConfig = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  heading: string;
  focusLabel: string;
  focusSublabel: string;
  desc: string;
  to: string;
  ctaLabel: string;
  accentColor: string;
  primaryStatLabel: string;
  actionPillContext: string;
};

const TABS: TabConfig[] = [
  {
    id: "rankings",
    label: "Rankings",
    icon: <BarChart3 size={14} />,
    heading: "Full Player Rankings",
    focusLabel: "Lens: Projection",
    focusSublabel: "Who scores the most points this round",
    desc: "See who to pick — based on real projections, value scores, and trend signals.",
    to: "/sports/afl/rankings",
    ctaLabel: "Explore Rankings",
    accentColor: GOLD,
    primaryStatLabel: "Projected",
    actionPillContext: "Trade action",
  },
  {
    id: "market-watch",
    label: "Market Watch",
    icon: <TrendingUp size={14} />,
    heading: "Market Watch",
    focusLabel: "Lens: Value Gap",
    focusSublabel: "Undervalued vs overpriced before trade deadline",
    desc: "Find undervalued players and avoid traps before every trade deadline.",
    to: "/sports/afl/market-watch",
    ctaLabel: "Open Market Watch",
    accentColor: "#22c55e",
    primaryStatLabel: "Price",
    actionPillContext: "Market signal",
  },
  {
    id: "captains",
    label: "Captains",
    icon: <Star size={14} />,
    heading: "Captain Picks",
    focusLabel: "Lens: Ceiling + Safety",
    focusSublabel: "Best captain based on upside and confidence",
    desc: "Know the best captain picks before lockout — ranked by confidence.",
    to: "/sports/afl/captains",
    ctaLabel: "View Captain Picks",
    accentColor: "#E0AE2D",
    primaryStatLabel: "Projected",
    actionPillContext: "Captain rating",
  },
  {
    id: "players",
    label: "Players",
    icon: <User size={14} />,
    heading: "Player Profiles",
    focusLabel: "Lens: Form",
    focusSublabel: "Recent form trend and consistency rating",
    desc: "Understand form, value, and projections for every AFL fantasy player.",
    to: "/sports/afl/rankings",
    ctaLabel: "View Player Pages",
    accentColor: "#E8855A",
    primaryStatLabel: "L5 Avg",
    actionPillContext: "Form signal",
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    focusLabel: "Lens: Matchup",
    focusSublabel: "Start/sit decisions based on this week's opponent",
    desc: "Your full weekly decision hub — trades, captains, and start/sit in one place.",
    to: "/sports/afl/current-round",
    ctaLabel: "View Edge Board",
    accentColor: "#E8855A",
    primaryStatLabel: "Projected",
    actionPillContext: "Start/sit",
  },
];

// ── Row renderers ─────────────────────────────────────────────────────────────

type RowProps = { row: RankingRow; index: number; tabId: TabId; accentColor: string };

function DataRow({ row, index, tabId, accentColor }: RowProps) {
  let primaryStat: string;
  let subLabel: string;
  let tag: { label: string; color: string };

  if (tabId === "rankings") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    subLabel = row.matchup_label ?? "—";
    tag = resolveSignal(row);
  } else if (tabId === "market-watch") {
    primaryStat = fmtPrice(row.price);
    const vs = row.value_score != null ? (row.value_score > 0 ? `+${row.value_score.toFixed(1)}` : row.value_score.toFixed(1)) : "—";
    subLabel = `Value ${vs}`;
    tag = resolveMWCategory(row);
  } else if (tabId === "captains") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    const conf = row.projection_confidence != null ? `${Math.round(row.projection_confidence)}% conf` : "—";
    subLabel = conf;
    tag = resolveCaptainRating(row);
  } else if (tabId === "players") {
    const avg5 = row.last_5_avg != null ? `${Math.round(row.last_5_avg)} avg` : "—";
    primaryStat = avg5;
    const nr = row.neeko_rating != null ? `NR ${Math.round(row.neeko_rating)}` : "—";
    subLabel = nr;
    tag = resolveSignal(row);
  } else {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} proj` : "—";
    subLabel = row.matchup_label ?? "—";
    tag = resolveEdgeTag(row);
  }

  const subtitle = [row.position, row.team].filter(Boolean).join(" · ");

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "11px 22px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800,
          color: "rgba(255,255,255,0.22)",
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 600, color: "#EAEAEA",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.player_name}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700,
            color: accentColor,
            fontVariantNumeric: "tabular-nums",
          }}>
            {primaryStat}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.26)", whiteSpace: "nowrap" }}>
            {subLabel}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: tag.color,
          background: `${tag.color}16`,
          border: `1px solid ${tag.color}28`,
          padding: "3px 9px",
          borderRadius: 999,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          minWidth: 52,
          textAlign: "center" as const,
        }}>
          {tag.label}
        </span>
      </div>
    </div>
  );
}

function LockedRow({ index }: { index: number }) {
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
        zIndex: 2, gap: 6,
      }}>
        <Lock size={11} color="rgba(255,255,255,0.22)" />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", fontWeight: 600 }}>
          Neeko+ to unlock
        </span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, minWidth: 0,
        filter: "blur(4px)", opacity: 0.25, userSelect: "none",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,255,255,0.05)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.18)",
        }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ width: 120, height: 11, background: "rgba(255,255,255,0.07)", borderRadius: 3, marginBottom: 5 }} />
          <div style={{ width: 72, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        filter: "blur(4px)", opacity: 0.25, userSelect: "none",
      }}>
        <div>
          <div style={{ width: 44, height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginBottom: 4 }} />
          <div style={{ width: 32, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
        </div>
        <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 999 }} />
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
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
            <div>
              <div style={{ width: 130, height: 11, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
              <div style={{ width: 80, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginTop: 5 }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <div style={{ width: 50, height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginBottom: 4 }} />
              <div style={{ width: 36, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
            </div>
            <div style={{ width: 44, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({ accentColor }: { accentColor: string }) {
  return (
    <div style={{
      padding: "32px 22px",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
        Data updates before every round lockout.
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: accentColor, opacity: 0.6 }}>
        Check back closer to game time.
      </p>
    </div>
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

  const FREE_VISIBLE = 2;
  const PREMIUM_VISIBLE = 5;
  const TOTAL_ROWS = 5;

  const visibleCount = isPremium ? PREMIUM_VISIBLE : FREE_VISIBLE;
  const lockedCount = isPremium ? 0 : TOTAL_ROWS - FREE_VISIBLE;

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
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [panelVisible]);

  const active = TABS.find(t => t.id === activeId) ?? TABS[0];

  const derivedRows: RankingRow[] = useMemo(() => {
    if (rankingsLoading || rankingsPlayers.length === 0) return [];
    switch (activeId) {
      case "rankings":      return buildRankingsRows(rankingsPlayers);
      case "market-watch":  return buildMarketWatchRows(rankingsPlayers);
      case "captains":      return buildCaptainsRows(rankingsPlayers);
      case "players":       return buildPlayersRows(rankingsPlayers);
      case "current-round": return buildEdgeRows(rankingsPlayers);
    }
  }, [activeId, rankingsPlayers, rankingsLoading]);

  const visibleRows = derivedRows.slice(0, visibleCount);
  const isLive = !rankingsLoading && rankingsPlayers.length > 0;
  const isEmpty = !rankingsLoading && derivedRows.length === 0;

  const playerCount = rankingsLoading ? "..." : (rankingsPlayers.length > 0 ? `${rankingsPlayers.length}+` : "630+");

  function renderRows() {
    if (rankingsLoading) return <SkeletonRows />;
    if (isEmpty) return <EmptyState accentColor={active.accentColor} />;
    return (
      <>
        {visibleRows.map((row, i) => (
          <DataRow
            key={row.player_id ?? i}
            row={row}
            index={i}
            tabId={activeId}
            accentColor={active.accentColor}
          />
        ))}
        {!isPremium && Array.from({ length: lockedCount }).map((_, i) => (
          <LockedRow key={`locked-${i}`} index={visibleRows.length + i} />
        ))}
      </>
    );
  }

  return (
    <section style={{
      background: "#05070A",
      padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Section header */}
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
            margin: "0 auto 20px",
          }}>
            One model. Five lenses. Every decision covered before lockout.
          </p>

          {/* Shared context row */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: "6px 16px",
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            fontWeight: 500,
          }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{playerCount} players</span>
            <span style={{ margin: "0 10px", color: "rgba(255,255,255,0.14)" }}>·</span>
            <span>{isLive ? "Live · Updated before lockout" : "Data ready before lockout"}</span>
            <span style={{ margin: "0 10px", color: "rgba(255,255,255,0.14)" }}>·</span>
            <span style={{ color: "rgba(224,174,45,0.55)", fontWeight: 600 }}>Same model · Different views</span>
          </div>
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
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.70)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)";
                      (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.46)";
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${isActive ? tab.accentColor + "40" : "rgba(255,255,255,0.06)"}`,
                    background: isActive ? `${tab.accentColor}14` : "rgba(255,255,255,0.025)",
                    color: isActive ? tab.accentColor : "rgba(255,255,255,0.46)",
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.16s ease",
                    outline: "none",
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0 }}>{tab.icon}</span>
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {isActive && (
                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#22c55e",
                      }} />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Engine label below nav */}
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(224,174,45,0.05)",
              border: "1px solid rgba(224,174,45,0.12)",
              borderRadius: 10,
            }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "rgba(224,174,45,0.55)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Neeko Engine
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
                One model powers all views. Data updates before every round.
              </p>
            </div>
          </div>

          {/* Panel */}
          <div style={{
            background: "rgba(10, 12, 16, 0.85)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${active.accentColor}20`,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 20px 56px rgba(0,0,0,0.50)",
            transition: "border-color 0.22s ease",
            opacity: panelVisible ? 1 : 0,
            transform: panelVisible ? "translateY(0)" : "translateY(4px)",
            transitionProperty: "opacity, transform, border-color",
            transitionDuration: "150ms, 150ms, 220ms",
            transitionTimingFunction: "ease, ease, ease",
          }}>

            {/* Panel header */}
            <div style={{
              padding: "14px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `${active.accentColor}14`,
                border: `1px solid ${active.accentColor}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: active.accentColor,
                flexShrink: 0,
                marginTop: 1,
              }}>
                {active.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{
                    margin: 0, fontSize: 13.5, fontWeight: 700,
                    color: "#F0F0F0", letterSpacing: "-0.01em",
                  }}>
                    {active.heading}
                  </p>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700,
                    color: active.accentColor,
                    background: `${active.accentColor}14`,
                    border: `1px solid ${active.accentColor}28`,
                    padding: "2px 8px", borderRadius: 999,
                    letterSpacing: "0.06em", textTransform: "uppercase" as const,
                    flexShrink: 0,
                  }}>
                    {active.focusLabel}
                  </span>
                  {isLive ? (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: "#22c55e",
                      background: "rgba(34,197,94,0.10)",
                      border: "1px solid rgba(34,197,94,0.20)",
                      padding: "2px 7px", borderRadius: 999,
                      letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      flexShrink: 0,
                    }}>
                      LIVE
                    </span>
                  ) : rankingsLoading ? null : (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: "rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      padding: "2px 7px", borderRadius: 999,
                      letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      flexShrink: 0,
                    }}>
                      LOADING
                    </span>
                  )}
                </div>
                <p style={{
                  margin: "3px 0 0", fontSize: 11, color: "rgba(255,255,255,0.34)",
                  fontWeight: 400, lineHeight: 1.4,
                }}>
                  {active.focusSublabel}
                </p>
              </div>

              {/* Column labels */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                flexShrink: 0, paddingTop: 8,
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.20)", letterSpacing: "0.06em", textTransform: "uppercase" as const, minWidth: 44, textAlign: "right" as const }}>
                  {active.primaryStatLabel}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.20)", letterSpacing: "0.06em", textTransform: "uppercase" as const, minWidth: 52, textAlign: "center" as const }}>
                  {active.actionPillContext}
                </span>
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: "4px 0" }}>
              {renderRows()}
            </div>

            {/* Gating message + footer */}
            {!isPremium && !rankingsLoading && !isEmpty && (
              <div style={{
                margin: "0 22px 0",
                padding: "10px 16px",
                background: "rgba(224,174,45,0.05)",
                border: "1px solid rgba(224,174,45,0.12)",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.40)", lineHeight: 1.4 }}>
                  Showing <strong style={{ color: "rgba(255,255,255,0.65)" }}>{FREE_VISIBLE} of {playerCount}</strong> players — unlock the full view with Neeko+.
                </p>
                <Link
                  to="/neeko-plus"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 700,
                    color: "#130c00",
                    background: "linear-gradient(160deg, #fad52a, #e09600)",
                    padding: "7px 14px",
                    borderRadius: 7,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Unlock All <ArrowRight size={11} />
                </Link>
              </div>
            )}

            <div style={{
              padding: "14px 22px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              background: "rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12,
            }}>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
                {isPremium
                  ? "Live data — updated before every round lockout"
                  : `Showing top ${FREE_VISIBLE} — unlock all ${TOTAL_ROWS} with Neeko+`}
              </p>
              <Link
                to={active.to}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 11.5, fontWeight: 700,
                  color: active.accentColor,
                  textDecoration: "none",
                  border: `1px solid ${active.accentColor}28`,
                  padding: "7px 14px",
                  borderRadius: 8,
                  background: `${active.accentColor}0e`,
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
