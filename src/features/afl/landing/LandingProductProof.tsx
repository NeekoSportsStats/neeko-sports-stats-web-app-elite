import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChartBar as BarChart3, TrendingUp, Star, User, Zap, ArrowRight, Lock } from "lucide-react";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { fmtPrice } from "@/features/afl/market-watch/helpers";
import { getCaptainScore, getCaptainConfidence, isCaptainEligible } from "@/features/afl/shared/data/captainScoring";

const GOLD = "#E0AE2D";

// ── View types ────────────────────────────────────────────────────────────────

type TabId = "rankings" | "market-watch" | "captains" | "players" | "current-round";

// ── Sorting / filtering for each view ────────────────────────────────────────

function buildRankingsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => !p.is_injured && !p.is_bye && (p.games_played ?? 0) >= 1 && (p.projection ?? 0) > 50)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 8);
}

function buildMarketRows(players: RankingRow[]): RankingRow[] {
  const stOut = (p: RankingRow) => {
    const s = (p.status ?? "").toUpperCase();
    const m = (p.manual_status ?? "").toUpperCase();
    return s === "OUT" || s === "INJURED" || s === "OMITTED" || m === "OUT" || m === "INJURED" || m === "OMITTED";
  };
  const eligible = players.filter(p =>
    !p.is_injured &&
    !p.is_bye &&
    !stOut(p) &&
    (p.price ?? 0) > 0 &&
    (p.games_played ?? 0) >= 1 &&
    (p.projection ?? 0) > 50
  );
  if (eligible.length === 0) {
    return players
      .filter(p => !p.is_injured && !p.is_bye && (p.price ?? 0) > 0 && (p.games_played ?? 0) >= 1)
      .sort((a, b) => (b.value_score ?? b.edge_canonical ?? 0) - (a.value_score ?? a.edge_canonical ?? 0))
      .slice(0, 8);
  }
  return eligible
    .sort((a, b) => (b.value_score ?? b.edge_canonical ?? 0) - (a.value_score ?? a.edge_canonical ?? 0))
    .slice(0, 8);
}

function buildCaptainsRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(isCaptainEligible)
    .sort((a, b) => {
      const aScore = a.captain_score ?? getCaptainScore(a);
      const bScore = b.captain_score ?? getCaptainScore(b);
      return bScore - aScore;
    })
    .slice(0, 8);
}

function buildPlayersRows(players: RankingRow[]): RankingRow[] {
  return players
    .filter(p => (p.games_played ?? 0) >= 2 && (p.last_3_avg ?? p.season_avg ?? 0) > 0)
    .map(p => ({
      ...p,
      _form_delta: p.trend_score ?? ((p.last_3_avg != null && p.season_avg != null) ? p.last_3_avg - p.season_avg : 0),
    } as RankingRow & { _form_delta: number }))
    .sort((a: any, b: any) => b._form_delta - a._form_delta)
    .slice(0, 8);
}

function buildCurrentWeekRows(players: RankingRow[]): RankingRow[] {
  const eligible = players.filter(
    p => !p.is_injured && !p.is_bye && (p.projection ?? 0) > 0
  );
  if (eligible.length === 0) return [];
  const maxTrend = Math.max(...eligible.map(p => p.trend_score ?? 0));
  const hasTrend = maxTrend > 0;
  if (hasTrend) {
    return eligible
      .sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))
      .slice(0, 8);
  }
  return eligible
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 8);
}

// ── Deduplication across all 5 views ─────────────────────────────────────────

function dedupeAcrossViews(views: Record<TabId, RankingRow[]>): Record<TabId, RankingRow[]> {
  return views;
}

// ── Tag resolvers — one per view ──────────────────────────────────────────────

function rankingsTag(row: RankingRow): { label: string; color: string } {
  const raw = (row.action_canonical ?? "").toUpperCase();
  if (raw === "START") return { label: "BUY", color: "#22c55e" };
  if (raw === "SIT") return { label: "SELL", color: "#f87171" };
  return { label: "HOLD", color: GOLD };
}

function marketTag(row: RankingRow): { label: string; color: string } {
  const raw = (row.signal_tag ?? row.action_canonical ?? row.signal ?? "").toUpperCase().trim();
  if (raw === "STRONG_UP" || raw === "SMASH_START")
    return { label: "STRONG BUY", color: "#22c55e" };
  if (raw === "UP" || raw === "START")
    return { label: "BUY",        color: "#4ade80" };
  if (raw === "STABLE" || raw === "HOLD" || raw === "WATCH")
    return { label: "HOLD",       color: GOLD };
  if (raw === "DOWN" || raw === "SIT")
    return { label: "SELL",       color: "#fb923c" };
  if (raw === "STRONG_DOWN" || raw === "HARD_SIT")
    return { label: "STRONG SELL",color: "#f87171" };
  const vs = row.value_score ?? row.edge_canonical ?? 0;
  if (vs >= 15)  return { label: "BUY",  color: "#4ade80" };
  if (vs >= -10) return { label: "HOLD", color: GOLD };
  return               { label: "SELL", color: "#fb923c" };
}

function captainsTag(row: RankingRow): { label: string; color: string } {
  const captainScore = row.captain_score ?? getCaptainScore(row);
  const confLabel = row.confidence_label ?? getCaptainConfidence(captainScore);
  const upside = row.upside_pct ?? 0;

  if (confLabel === "HIGH") return { label: "LOCK", color: GOLD };
  if (confLabel === "MEDIUM") return { label: "SAFE", color: "#86efac" };
  if (upside >= 25) return { label: "POD", color: "#fb923c" };
  return { label: "CAPTAIN", color: "rgba(255,255,255,0.45)" };
}

function formTag(row: RankingRow & { _form_delta?: number }): { label: string; color: string } {
  const delta = row._form_delta ?? row.trend_score ?? 0;
  if (delta > 20) return { label: "HOT", color: "#f97316" };
  if (delta > 10) return { label: "RISING", color: "#fb923c" };
  if (delta > 3) return { label: "TRENDING", color: "#fbbf24" };
  if (delta < -15) return { label: "COLD", color: "#93c5fd" };
  if (delta < -5) return { label: "FADING", color: "#60a5fa" };
  return { label: "STABLE", color: "rgba(255,255,255,0.38)" };
}

function startSitTag(row: RankingRow): { label: string; color: string } {
  const ac = (row.action_canonical ?? "").toUpperCase();
  const trend = row.trend_score ?? 0;
  if (ac === "START" && trend > 12) return { label: "MUST START", color: "#22c55e" };
  if (ac === "START") return { label: "START", color: "#4ade80" };
  if (trend > 12) return { label: "MUST START", color: "#22c55e" };
  if (trend > 5) return { label: "START", color: "#4ade80" };
  if (ac === "SIT") return { label: "SIT", color: "#fb923c" };
  if (trend < -5) return { label: "SIT", color: "#fb923c" };
  return { label: "HOLD", color: GOLD };
}

// ── Tab config ────────────────────────────────────────────────────────────────

type TabConfig = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  heading: string;
  lensLabel: string;
  lensSubLabel: string;
  desc: string;
  to: string;
  ctaLabel: string;
  accentColor: string;
  colStatLabel: string;
  colTagLabel: string;
};

const TABS: TabConfig[] = [
  {
    id: "rankings",
    label: "Rankings",
    icon: <BarChart3 size={14} />,
    heading: "Full Player Rankings",
    lensLabel: "LENS: PROJECTION",
    lensSubLabel: "Who scores the most points this round",
    desc: "Top-rated players sorted by projected fantasy score — the baseline view.",
    to: "/fantasy/rankings",
    ctaLabel: "Explore Rankings",
    accentColor: GOLD,
    colStatLabel: "Projected",
    colTagLabel: "Trade signal",
  },
  {
    id: "market-watch",
    label: "Market Watch",
    icon: <TrendingUp size={14} />,
    heading: "Market Watch",
    lensLabel: "LENS: VALUE GAP",
    lensSubLabel: "Who is mispriced vs their projected score — steals and traps before lockout",
    desc: "Sorted by value score: biggest upside vs breakeven. Spot steals and avoid traps.",
    to: "/fantasy/market-watch",
    ctaLabel: "Open Market Watch →",
    accentColor: "#22c55e",
    colStatLabel: "Price / Value",
    colTagLabel: "Signal",
  },
  {
    id: "captains",
    label: "Captains",
    icon: <Star size={14} />,
    heading: "Captain Picks",
    lensLabel: "LENS: CEILING",
    lensSubLabel: "Best captain based on ceiling score and confidence",
    desc: "Sorted by ceiling estimate — who has the highest upside to double-score.",
    to: "/fantasy/current-week",
    ctaLabel: "View Captain Picks",
    accentColor: "#facc15",
    colStatLabel: "Ceiling",
    colTagLabel: "Captain rating",
  },
  {
    id: "players",
    label: "Players",
    icon: <User size={14} />,
    heading: "Player Form",
    lensLabel: "LENS: MOMENTUM",
    lensSubLabel: "Who is trending up right now vs season baseline",
    desc: "Sorted by form delta: last 3 average minus season average — pure momentum.",
    to: "/fantasy/rankings",
    ctaLabel: "View Player Pages",
    accentColor: "#f97316",
    colStatLabel: "L3 Avg",
    colTagLabel: "Form signal",
  },
  {
    id: "current-round",
    label: "Current Week",
    icon: <Zap size={14} />,
    heading: "Weekly Edge Board",
    lensLabel: "LENS: CURRENT WEEK",
    lensSubLabel: "Captain picks, value targets and trap alerts for this round",
    desc: "Sorted by trend score — who to start, hold, or bench before lockout.",
    to: "/fantasy/current-week",
    ctaLabel: "View This Week",
    accentColor: "#38bdf8",
    colStatLabel: "Projected",
    colTagLabel: "Decision",
  },
];

// ── Row renderers ─────────────────────────────────────────────────────────────

type RowProps = { row: RankingRow; index: number; tabId: TabId; accentColor: string };

function DataRow({ row, index, tabId, accentColor }: RowProps) {
  let primaryStat: string;
  let subStat: string;
  let tag: { label: string; color: string };

  if (tabId === "rankings") {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    subStat = row.matchup_label ?? (row.season_avg != null ? `${Math.round(row.season_avg)} avg` : "—");
    tag = rankingsTag(row);

  } else if (tabId === "market-watch") {
    primaryStat = fmtPrice(row.price);
    const proj = row.projection ?? null;
    const be   = row.breakeven  ?? null;
    const vs   = row.value_score ?? null;
    let valueNum: number | null = null;
    if (proj != null && be != null) {
      valueNum = Math.round(proj - be);
    } else if (vs != null) {
      valueNum = Math.round(vs);
    }
    const valueStr   = valueNum != null ? (valueNum >= 0 ? `+${valueNum}` : `${valueNum}`) : "—";
    const valueColor = valueNum == null ? "rgba(255,255,255,0.26)" : valueNum >= 0 ? "#4ade80" : "#f87171";
    subStat = valueStr;
    tag = marketTag(row);

    const mwSubtitle = [row.position, row.team].filter(Boolean).join(" · ");
    return (
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 22px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          transition: "background 0.14s ease",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.035)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.22)", flexShrink: 0,
          }}>
            {index + 1}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 700, color: "#EAEAEA",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {row.player_name}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
              {mwSubtitle}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 700, color: "#22c55e",
              fontVariantNumeric: "tabular-nums",
            }}>
              {primaryStat}
            </p>
            <p style={{
              margin: "2px 0 0", fontSize: 10, color: valueColor,
              whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            }}>
              {subStat} vs BE
            </p>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: tag.color,
            background: `${tag.color}18`,
            border: `1px solid ${tag.color}30`,
            boxShadow: `0 0 10px ${tag.color}22`,
            padding: "3px 9px",
            borderRadius: 999,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            minWidth: 68,
            textAlign: "center" as const,
          }}>
            {tag.label}
          </span>
        </div>
      </div>
    );

  } else if (tabId === "captains") {
    const ceil = row.ceiling_estimate != null ? Math.round(row.ceiling_estimate) : null;
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = ceil != null ? `${ceil} ceil` : (proj != null ? `${proj} pts` : "—");
    const conf = row.projection_confidence != null ? `${Math.round(row.projection_confidence)}% conf` : "—";
    subStat = conf;
    tag = captainsTag(row);

  } else if (tabId === "players") {
    const l3 = row.last_3_avg != null ? Math.round(row.last_3_avg) : null;
    const avg = row.season_avg != null ? Math.round(row.season_avg) : null;
    primaryStat = l3 != null ? `${l3} avg` : (avg != null ? `${avg} avg` : "—");
    const delta = row.trend_score ?? ((row.last_3_avg != null && row.season_avg != null) ? row.last_3_avg - row.season_avg : 0);
    const sign = delta >= 0 ? "+" : "";
    subStat = `${sign}${Math.round(delta)} vs season`;
    tag = formTag(row as any);

  } else {
    const proj = row.projection != null ? Math.round(row.projection) : null;
    primaryStat = proj != null ? `${proj} pts` : "—";
    subStat = row.matchup_label ?? (row.trend_score != null ? `Trend ${row.trend_score > 0 ? "+" : ""}${row.trend_score}` : "—");
    tag = startSitTag(row);
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
            {subStat}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: tag.color,
          background: `${tag.color}18`,
          border: `1px solid ${tag.color}30`,
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

function EmptyState({ accentColor: _accentColor }: { accentColor: string }) {
  return (
    <div style={{ padding: "32px 22px", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
        Data updates before every round lockout.
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

  // Build all 5 views and deduplicate players across them
  const allViews = useMemo<Record<TabId, RankingRow[]>>(() => {
    if (rankingsLoading || rankingsPlayers.length === 0) {
      return {
        rankings: [],
        "market-watch": [],
        captains: [],
        players: [],
        "current-round": [],
      };
    }
    const raw: Record<TabId, RankingRow[]> = {
      rankings: buildRankingsRows(rankingsPlayers),
      "market-watch": buildMarketRows(rankingsPlayers),
      captains: buildCaptainsRows(rankingsPlayers),
      players: buildPlayersRows(rankingsPlayers),
      "current-round": buildCurrentWeekRows(rankingsPlayers),
    };
    return dedupeAcrossViews(raw);
  }, [rankingsPlayers, rankingsLoading]);

  const active = TABS.find(t => t.id === activeId) ?? TABS[0];
  const derivedRows = allViews[activeId] ?? [];
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
            <span style={{ color: "rgba(224,174,45,0.55)", fontWeight: 600 }}>5 unique views</span>
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
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  )}
                </button>
              );
            })}

            {/* Engine note */}
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
                Each tab sorts by a different signal. Different players, different decisions.
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
                    {active.lensLabel}
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
                  {active.lensSubLabel}
                </p>
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                flexShrink: 0, paddingTop: 8,
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.20)", letterSpacing: "0.06em", textTransform: "uppercase" as const, minWidth: 44, textAlign: "right" as const }}>
                  {active.colStatLabel}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.20)", letterSpacing: "0.06em", textTransform: "uppercase" as const, minWidth: 52, textAlign: "center" as const }}>
                  {active.colTagLabel}
                </span>
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: "4px 0" }}>
              {renderRows()}
            </div>

            {/* Gating strip */}
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
