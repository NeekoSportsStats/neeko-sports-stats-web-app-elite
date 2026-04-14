import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Star, User, Zap, ArrowRight, Lock } from "lucide-react";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { fmtPrice } from "@/features/afl/market-watch/helpers";

const GOLD = "#E0AE2D";

// ── Static fallback data (used when live data is empty) ───────────────────────

const STATIC_FALLBACK: RankingRow[] = [
  {
    player_id: 1, player_name: "Patrick Cripps", team: "Carlton", position: "MID",
    projection: 118, captain_score: 88, last_5_avg: 112, value_score: 7.2,
    neeko_rating: 85, price: 975000, games_played: 8, is_injured: false, is_bye: false,
    action: "BUY", signal_tag: "BUY", signal: "BUY", category: "BREAKOUT",
    trend_score: 12, projection_confidence: 82, matchup_label: "Favourable",
  } as unknown as RankingRow,
  {
    player_id: 2, player_name: "Caleb Serong", team: "Fremantle", position: "MID",
    projection: 109, captain_score: 79, last_5_avg: 104, value_score: 6.8,
    neeko_rating: 81, price: 870000, games_played: 8, is_injured: false, is_bye: false,
    action: "BUY", signal_tag: "BUY", signal: "BUY", category: "START",
    trend_score: 8, projection_confidence: 76, matchup_label: "Favourable",
  } as unknown as RankingRow,
  {
    player_id: 3, player_name: "Marcus Bontempelli", team: "WB Dogs", position: "MID",
    projection: 104, captain_score: 74, last_5_avg: 101, value_score: 5.9,
    neeko_rating: 78, price: 910000, games_played: 8, is_injured: false, is_bye: false,
    action: "HOLD", signal_tag: "HOLD", signal: "HOLD", category: "WATCH",
    trend_score: 4, projection_confidence: 70, matchup_label: "Neutral",
  } as unknown as RankingRow,
  {
    player_id: 4, player_name: "Clayton Oliver", team: "Melbourne", position: "MID",
    projection: 98, captain_score: 65, last_5_avg: 96, value_score: 4.2,
    neeko_rating: 72, price: 840000, games_played: 7, is_injured: false, is_bye: false,
    action: "HOLD", signal_tag: "HOLD", signal: "HOLD", category: "WATCH",
    trend_score: 2, projection_confidence: 65, matchup_label: "Neutral",
  } as unknown as RankingRow,
  {
    player_id: 5, player_name: "Tom Green", team: "GWS Giants", position: "MID",
    projection: 96, captain_score: 62, last_5_avg: 93, value_score: 6.5,
    neeko_rating: 74, price: 790000, games_played: 7, is_injured: false, is_bye: false,
    action: "BUY", signal_tag: "BUY", signal: "BUY", category: "BREAKOUT",
    trend_score: 9, projection_confidence: 68, matchup_label: "Favourable",
  } as unknown as RankingRow,
];

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

// ── Derived data builders ─────────────────────────────────────────────────────

function buildRankingsRows(players: RankingRow[]): RankingRow[] {
  const live = players
    .filter(p => !p.is_injured && !p.is_bye && (p.games_played ?? 0) >= 3 && (p.projection ?? 0) > 50)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);
  return live.length >= 3 ? live : STATIC_FALLBACK;
}

function buildMarketWatchRows(players: RankingRow[]): RankingRow[] {
  const candidates = players.filter(
    p => !p.is_injured && !p.is_bye && (p.price ?? 0) > 0 && (p.games_played ?? 0) >= 2
  );
  if (candidates.length < 3) return STATIC_FALLBACK;
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
  const live = players
    .filter(p => !p.is_injured && !p.is_bye && (p.captain_score ?? 0) > 0 && (p.projection ?? 0) > 50)
    .sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0))
    .slice(0, 5);
  return live.length >= 3 ? live : STATIC_FALLBACK;
}

function buildPlayersRows(players: RankingRow[]): RankingRow[] {
  const live = players
    .filter(p => (p.games_played ?? 0) >= 3 && (p.last_5_avg ?? 0) > 0)
    .sort((a, b) => (b.neeko_rating ?? 0) - (a.neeko_rating ?? 0))
    .slice(0, 5);
  return live.length >= 3 ? live : STATIC_FALLBACK;
}

function buildEdgeRows(players: RankingRow[]): RankingRow[] {
  const eligible = players.filter(
    p => !p.is_injured && !p.is_bye && (p.projection ?? 0) > 0
  );
  if (eligible.length < 3) return STATIC_FALLBACK;
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
  const result = [...mustStart, ...breakouts, ...sits].slice(0, 5);
  return result.length >= 3 ? result : STATIC_FALLBACK;
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
    desc: "Find undervalued players and avoid traps before every trade deadline.",
    to: "/sports/afl/market-watch",
    ctaLabel: "Open Market Watch",
    accentColor: "#22c55e",
  },
  {
    id: "captains",
    label: "Captains",
    icon: <Star size={14} />,
    heading: "Captain Picks",
    desc: "Know the best captain picks before lockout — ranked by confidence.",
    to: "/sports/afl/captains",
    ctaLabel: "View Captain Picks",
    accentColor: "#E0AE2D",
  },
  {
    id: "players",
    label: "Players",
    icon: <User size={14} />,
    heading: "Player Profiles",
    desc: "Understand form, value, and projections for every AFL fantasy player.",
    to: "/sports/afl/rankings",
    ctaLabel: "View Player Pages",
    accentColor: "#60a5fa",
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    desc: "Your full weekly decision hub — trades, captains, and start/sit in one place.",
    to: "/sports/afl/current-round",
    ctaLabel: "View Edge Board",
    accentColor: "#60a5fa",
  },
];

// ── Row renderers ─────────────────────────────────────────────────────────────

type RowProps = { row: RankingRow; index: number; tabId: TabId };

function DataRow({ row, index, tabId }: RowProps) {
  const accent = TABS.find(t => t.id === tabId)?.accentColor ?? GOLD;

  let primaryStat: string;
  let tag: { label: string; color: string };

  if (tabId === "rankings") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    tag = resolveSignal(row);
  } else if (tabId === "market-watch") {
    primaryStat = fmtPrice(row.price);
    tag = resolveMWCategory(row);
  } else if (tabId === "captains") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    tag = resolveCaptainRating(row);
  } else if (tabId === "players") {
    const avg5 = row.last_5_avg != null ? `${Math.round(row.last_5_avg)} avg` : "—";
    primaryStat = avg5;
    tag = resolveSignal(row);
  } else {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} proj` : "—";
    tag = resolveEdgeTag(row);
  }

  const subtitle = [row.position, row.team].filter(Boolean).join(" · ");

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 22px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
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
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 600, color: "#EAEAEA",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {row.player_name}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "rgba(255,255,255,0.30)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: accent,
          fontVariantNumeric: "tabular-nums",
        }}>
          {primaryStat}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: tag.color,
          background: `${tag.color}16`,
          border: `1px solid ${tag.color}28`,
          padding: "3px 9px",
          borderRadius: 999,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
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
      padding: "12px 22px",
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
        display: "flex", alignItems: "center", gap: 10,
        filter: "blur(4px)", opacity: 0.25, userSelect: "none",
      }}>
        <div style={{ width: 44, height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
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
          padding: "12px 22px",
          borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
            <div>
              <div style={{ width: 130, height: 11, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
              <div style={{ width: 80, height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginTop: 5 }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 50, height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 3 }} />
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

  const VISIBLE_ROWS = 3;
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
    if (rankingsLoading) return [];
    const pool = rankingsPlayers.length > 0 ? rankingsPlayers : STATIC_FALLBACK;
    switch (activeId) {
      case "rankings":      return buildRankingsRows(pool);
      case "market-watch":  return buildMarketWatchRows(pool);
      case "captains":      return buildCaptainsRows(pool);
      case "players":       return buildPlayersRows(pool);
      case "current-round": return buildEdgeRows(pool);
    }
  })();

  const visibleRows = derivedRows.slice(0, VISIBLE_ROWS);
  const isFallback = rankingsPlayers.length === 0 && !rankingsLoading;

  function renderRows() {
    if (rankingsLoading) return <SkeletonRows />;
    return (
      <>
        {visibleRows.map((row, i) => (
          <DataRow key={row.player_id ?? i} row={row} index={i} tabId={activeId} />
        ))}
        {!isPremium && Array.from({ length: LOCKED_ROWS }).map((_, i) => (
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
                  {tab.label}
                  {isActive && (
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#22c55e",
                      }} />
                    </div>
                  )}
                </button>
              );
            })}
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
            transition: "border-color 0.22s ease, opacity 0.14s ease, transform 0.14s ease",
            opacity: panelVisible ? 1 : 0,
            transform: panelVisible ? "translateX(0)" : "translateX(5px)",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "16px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${active.accentColor}14`,
                border: `1px solid ${active.accentColor}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: active.accentColor,
                flexShrink: 0,
              }}>
                {active.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 700,
                    color: "#F0F0F0", letterSpacing: "-0.01em",
                  }}>
                    {active.heading}
                  </p>
                  {isFallback ? (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: "rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      padding: "2px 7px", borderRadius: 999,
                      letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      flexShrink: 0,
                    }}>
                      SAMPLE
                    </span>
                  ) : (
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
                  )}
                </div>
                <p style={{
                  margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.34)",
                  fontWeight: 400, lineHeight: 1.4,
                }}>
                  {active.desc}
                </p>
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: "4px 0" }}>
              {renderRows()}
            </div>

            {/* Footer */}
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
                  : "Showing top 3 — unlock all 5 with Neeko+"}
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
