import { useState, useEffect, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import {
  TrendingUp,
  TriangleAlert as AlertTriangle,
  Minus,
  RefreshCw,
  Lock,
  Crown,
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { DataFreshnessIndicator } from "@/components/ui/DataFreshnessIndicator";
import { fmt, fmtPrice, getCanonicalConfidenceStyles, formatCanonicalConfidenceLabel } from "@/features/afl/rankings/components/helpers";
import { applyDecisionFields } from "@/lib/decisionEngine";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import type { RowTier } from "@/features/afl/rankings/components/types";
import { classifyPlayers, type DerivedPlayer } from "./engine";
import type { MWPlayerRow } from "./types";

// ─── CONVERSION ──────────────────────────────────────────────────────────────

function rankingToMW(r: RankingRow): MWPlayerRow {
  // Use action_canonical when available (premium/free_player_ids rows),
  // then fall back to signal_display which is always returned for all rows.
  const acRaw = (r.action_canonical ?? r.category ?? "").toLowerCase();
  const sdRaw = (r.signal_display ?? "").toLowerCase();
  const displaySignal: "TARGET" | "WATCH" | "AVOID" =
    acRaw === "start" || acRaw === "smash_start" || acRaw === "strong_start" || acRaw === "target"
      ? "TARGET"
      : acRaw === "sit" || acRaw === "hard_sit" || acRaw === "avoid"
      ? "AVOID"
      : sdRaw === "strong start" || sdRaw === "start"
      ? "TARGET"
      : sdRaw === "hard avoid" || sdRaw === "avoid" || sdRaw === "hard sit" || sdRaw === "sit"
      ? "AVOID"
      : "WATCH";
  return {
    player_id: Number(r.player_id ?? 0),
    player_name: r.player_name,
    team: r.team ?? "",
    team_name: r.team_name ?? r.team ?? "",
    position: r.position ?? "",
    price: r.price ?? 0,
    prev_price: r.prev_price ?? null,
    price_change: r.price_change ?? null,
    price_change_pct: r.price_change_pct ?? null,
    projection: r.projection ?? null,
    season_avg: r.season_avg ?? null,
    last_3_avg: r.last_3_avg ?? null,
    last_5_avg: null,
    games_played: r.games_played ?? null,
    breakeven: r.breakeven ?? null,
    edge: r.edge ?? r.edge_canonical ?? null,
    value_score: r.value_score ?? null,
    signal: r.signal ?? null,
    signal_tag: r.signal_tag ?? null,
    signal_display: r.signal_display ?? null,
    category: r.category ?? null,
    action: r.action ?? r.action_canonical ?? null,
    why: null,
    why_long: null,
    matchup_label: r.matchup_label ?? null,
    matchup_rating: null,
    matchup_multiplier: r.matchup_multiplier ?? null,
    consistency: r.consistency ?? null,
    neeko_rating: r.neeko_rating ?? null,
    status: r.status ?? null,
    manual_status: r.manual_status ?? null,
    is_bye: r.is_bye ?? false,
    is_injured: r.is_injured ?? false,
    cached_at: r.cached_at ?? null,
    display_signal: displaySignal,
    access_tier: r.access_tier ?? "locked",
    action_canonical: r.action_canonical ?? null,
    action_display: r.action_display ?? null,
    confidence_label: r.confidence_label ?? null,
    value_band: r.value_band ?? null,
    decision_score: r.decision_score ?? null,
    action_reason_1: r.action_reason_1 ?? null,
    action_reason_2: r.action_reason_2 ?? null,
  };
}

// ─── CACHE ───────────────────────────────────────────────────────────────────

const _MW_STALE_MS = 60_000;
const _MW_CACHE_VERSION = "v4-dual-fetch";
const _mwCache: {
  data: MWPlayerRow[] | null;
  ts: number;
  userId: string | null;
  version: string;
} = { data: null, ts: 0, userId: null, version: "" };

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const FREE_BUY_LIMIT = 5;
const FREE_AVOID_LIMIT = 2;
const POSITIONS = ["DEF", "MID", "RUC", "FWD"];

type TabFilter = "ALL" | "BUY" | "HOLD" | "AVOID";

// ─── BADGE COMPONENTS ────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: "BUY" | "HOLD" | "AVOID" }) {
  if (action === "BUY") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-green-500/40 bg-green-500/15 text-green-400 shrink-0 leading-none whitespace-nowrap">
        <TrendingUp className="w-2.5 h-2.5" />
        BUY
      </span>
    );
  }
  if (action === "AVOID") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/15 text-red-400 shrink-0 leading-none whitespace-nowrap">
        <AlertTriangle className="w-2.5 h-2.5" />
        AVOID
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/15 bg-white/05 text-white/35 shrink-0 leading-none whitespace-nowrap">
      <Minus className="w-2.5 h-2.5" />
      HOLD
    </span>
  );
}

function PosBadge({ pos }: { pos: string }) {
  const p = pos.toUpperCase().trim();
  const map: Record<string, string> = {
    DEF: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    MID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    RUC: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    FWD: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const cls = map[p] ?? "border-white/15 bg-white/05 text-white/40";
  return (
    <span className={`inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none ${cls}`}>
      {p}
    </span>
  );
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

function GroupHeader({
  label,
  count,
  accentColor,
  icon,
}: {
  label: string;
  count: number;
  accentColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10"
      style={{ background: "#090909", borderBottom: `1px solid ${accentColor}20` }}
    >
      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
      <span style={{ color: accentColor }}>{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">{label}</span>
      <span
        className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: `${accentColor}15`, color: `${accentColor}80` }}
      >
        {count}
      </span>
    </div>
  );
}

// ─── TABLE ROW ───────────────────────────────────────────────────────────────

function PlayerTableRow({
  player,
  rank,
  onClick,
}: {
  player: DerivedPlayer;
  rank: number;
  onClick: () => void;
}) {
  const action: "BUY" | "HOLD" | "AVOID" =
    player._category === "START" ? "BUY" : player._category === "SIT" ? "AVOID" : "HOLD";

  const pos = (player.position ?? "").toUpperCase().trim();
  const normPos = pos === "MIDFIELDER" ? "MID" : pos === "FORWARD" ? "FWD" : pos === "DEFENDER" ? "DEF" : pos === "RUCK" ? "RUC" : pos;

  const valueBand = (player as any).value_band as string | null | undefined;
  const valueScore = (player as any).decision_score ?? player.value_score ?? null;
  const valuePct = valueScore;
  const valueDisplay = valueBand ?? (valueScore != null ? valueScore.toFixed(2) : null);
  const valueColor =
    valueBand === "BUY" || valueBand === "STRONG_BUY"
      ? "text-green-400"
      : valueBand === "SELL" || valueBand === "STRONG_SELL"
      ? "text-red-400"
      : valueBand === "HOLD"
      ? "text-white/60"
      : valueScore != null
      ? (valueScore >= 0 ? "text-green-400" : "text-red-400")
      : "text-white/25";

  const confLabel = player.confidence_label ?? null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-white/[0.04] border-b border-white/[0.04] transition-colors group"
    >
      <span className="text-[10px] text-white/20 w-5 text-right shrink-0 font-mono tabular-nums">{rank}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white truncate leading-tight">{player.player_name}</span>
          <ActionBadge action={action} />
          {normPos && <PosBadge pos={normPos} />}
        </div>
        <div className="text-[10px] text-white/30 mt-px leading-relaxed">
          {player.team}
          {player.price ? ` · ${fmtPrice(player.price)}` : ""}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-right">
        {valueDisplay != null && (
          <div className="hidden sm:block">
            <div className={`text-xs font-bold tabular-nums ${valueColor}`}>{valueDisplay}</div>
            <div className="text-[9px] text-white/25">value</div>
          </div>
        )}
        {confLabel != null && (
          <span className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap ${getCanonicalConfidenceStyles(confLabel)}`}>
            <span className="w-1 h-1 rounded-full shrink-0" style={{ background: "currentColor" }} />
            {formatCanonicalConfidenceLabel(confLabel)}
          </span>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-white tabular-nums">{fmt(player.projection, 0)}</div>
        <div className="text-[9px] text-white/25">proj</div>
      </div>

      <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
    </button>
  );
}

// ─── LOCKED ROW ──────────────────────────────────────────────────────────────

function LockedRow({ rank, lockedCount }: { rank: number; lockedCount?: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] select-none pointer-events-none opacity-60">
      <span className="text-[10px] text-white/20 w-5 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/25 shrink-0" />
        {lockedCount != null ? (
          <span className="text-[11px] text-white/30 font-medium">
            {lockedCount} more {lockedCount === 1 ? "player" : "players"} locked — Neeko+
          </span>
        ) : (
          <>
            <div className="h-2.5 w-32 rounded bg-white/[0.06]" />
            <div className="h-2 w-10 rounded bg-white/[0.04]" />
          </>
        )}
      </div>
      <div className="h-2.5 w-10 rounded bg-white/[0.04] shrink-0" />
    </div>
  );
}

// ─── LOCK CTA ────────────────────────────────────────────────────────────────

function LockCTA({ onUpgrade, hiddenCount }: { onUpgrade: () => void; hiddenCount: number }) {
  return (
    <div className="relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent 0%, #0a0a0acc 50%, #0a0a0af5 100%)" }}
      />
      <div className="px-4 py-4 flex flex-col items-center gap-3">
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 text-[12px] font-bold border rounded-xl px-4 py-2.5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            color: "#F5C84C",
            borderColor: "rgba(245,200,76,0.30)",
            background: "rgba(245,200,76,0.06)",
          }}
        >
          <Crown className="w-3.5 h-3.5" />
          Unlock {hiddenCount} more players — Neeko+
        </button>
        <p className="text-[10px] text-white/25">Full table access, all positions, player signals</p>
      </div>
    </div>
  );
}

// ─── COLLAPSIBLE SEO ─────────────────────────────────────────────────────────

function CollapsibleSEO() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[12px] text-white/40 font-medium">About Market Watch</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-white/25 rotate-180 transition-transform" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-white/25 transition-transform" />
        )}
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "600px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 pt-3 space-y-3">
          <p className="text-[12px] text-white/40 leading-relaxed">
            Market Watch surfaces players with clear trade signals based on Neeko's projection model, value scoring, and trend engine. Every player is scored against their breakeven and season context to determine a Start, Hold, or Avoid rating.
          </p>
          <ul className="space-y-2 text-[12px] text-white/35 leading-relaxed">
            <li><strong className="text-white/55">Top Targets</strong> — Strong Start signals: projecting above breakeven with positive edge and value score above 1.0.</li>
            <li><strong className="text-white/55">Solid Options</strong> — Hold-rated players. Performing to expectation but no urgent trade action needed.</li>
            <li><strong className="text-white/55">Risk / Avoid</strong> — Players projecting below breakeven or showing form decline. Consider trading out.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function MarketWatchPageElite() {
  const { isPremium, user, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("ALL");
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{ row: RankingRow; rank: number; tier: RowTier } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFilterHint, setShowFilterHint] = useState(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(null);

  const fetchData = useCallback(
    async (force = false) => {
      const userId = user?.id ?? null;
      const now = Date.now();
      if (
        !force &&
        _mwCache.data &&
        _mwCache.userId === userId &&
        _mwCache.version === _MW_CACHE_VERSION &&
        now - _mwCache.ts < _MW_STALE_MS
      ) {
        setPlayers(_mwCache.data);
        setLoading(false);
        return;
      }

      if (force) setRefreshing(true);
      else setLoading(true);
      setFetchError(null);

      try {
        // Dual-fetch: engine fetch uses null user_id to get full 700-row dataset with all
        // ungated fields for correct classification. User fetch (when logged in) returns
        // per-row access_tier so display gating is accurate.
        const [engineRes, userRes] = await Promise.all([
          supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 700 }),
          userId
            ? supabase.rpc("get_rankings_safe", { p_user_id: userId, p_is_bot: false, p_limit: 700 })
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (engineRes.error) throw engineRes.error;

        if (engineRes.data) {
          // Build access_tier map from user fetch
          const accessMap = new Map<string, string>();
          if (userRes.data && Array.isArray(userRes.data)) {
            for (const r of userRes.data as Record<string, unknown>[]) {
              if (r.player_id && r.access_tier) {
                accessMap.set(String(r.player_id), String(r.access_tier));
              }
            }
          }

          const rows = applyDecisionFields(
            (engineRes.data as Record<string, unknown>[]).map((r) => {
              const mapped = mapRankingRow(r);
              const tier = accessMap.get(String(mapped.player_id ?? ""));
              return tier ? { ...mapped, access_tier: tier as "premium" | "free" | "locked" } : mapped;
            })
          ).map(rankingToMW);

          const filtered = rows.filter((p) => !p.is_bye && !p.is_injured);
          const firstCachedAt = (engineRes.data as Record<string, unknown>[])[0]?.cached_at as string | undefined;
          if (firstCachedAt) setDataUpdatedAt(firstCachedAt);

          _mwCache.data = filtered;
          _mwCache.ts = Date.now();
          _mwCache.userId = userId;
          _mwCache.version = _MW_CACHE_VERSION;
          setPlayers(filtered);
        }
      } catch (err) {
        console.error("Market Watch fetch error:", err);
        setFetchError("Failed to load market data. Please refresh.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [fetchData, authLoading]);

  useEffect(() => {
    track("market_watch_page_view");
  }, []);

  // ── CLASSIFY ────────────────────────────────────────────────────────────────
  const { buys, holds, sells } = useMemo(() => classifyPlayers(players), [players]);

  // ── FILTERED TABLE ──────────────────────────────────────────────────────────
  const allPlayers = useMemo<DerivedPlayer[]>(() => {
    const byTab: DerivedPlayer[] =
      activeTab === "BUY" ? buys : activeTab === "AVOID" ? sells : activeTab === "HOLD" ? holds : [...buys, ...holds, ...sells];

    return byTab
      .filter((p) => {
        if (selectedPosition) {
          const rawPos = (p.position ?? "").toUpperCase().trim();
          const POS_MAP: Record<string, string> = { MIDFIELDER: "MID", FORWARD: "FWD", DEFENDER: "DEF", RUCK: "RUC" };
          const normPos = POS_MAP[rawPos] ?? rawPos;
          if (normPos !== selectedPosition) return false;
        }
        if (priceMin != null && (p.price ?? 0) < priceMin * 1000) return false;
        if (priceMax != null && (p.price ?? 0) > priceMax * 1000) return false;
        if (searchQuery.length >= 2 && !p.player_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const valB = (b as any).decision_score ?? b.value_score ?? (b as any).trend_score ?? 0;
        const valA = (a as any).decision_score ?? a.value_score ?? (a as any).trend_score ?? 0;
        return valB - valA;
      });
  }, [buys, holds, sells, activeTab, selectedPosition, priceMin, priceMax, searchQuery]);

  // ── GROUPED VIEW (ALL tab) ──────────────────────────────────────────────────
  const groupedView = useMemo(() => {
    if (activeTab !== "ALL" || selectedPosition || priceMin != null || priceMax != null || searchQuery.length >= 2) {
      return null;
    }
    return {
      targets: isPremium ? buys : buys.slice(0, FREE_BUY_LIMIT),
      options: isPremium ? holds : [],
      risks: isPremium ? sells : sells.slice(0, FREE_AVOID_LIMIT),
    };
  }, [activeTab, buys, holds, sells, isPremium, selectedPosition, priceMin, priceMax, searchQuery]);

  // For flat filtered view (tabs / search / filters)
  const visiblePlayers = isPremium ? allPlayers : allPlayers.slice(0, FREE_BUY_LIMIT);
  const hiddenCount = isPremium ? 0 : Math.max(0, allPlayers.length - FREE_BUY_LIMIT);

  // ── HERO STATS ──────────────────────────────────────────────────────────────
  const bestBuy = buys[0] ?? null;
  const bestAvoid = sells[0] ?? null;

  function openPlayer(p: DerivedPlayer, rank: number) {
    const row: RankingRow = {
      player_id: String(p.player_id),
      player_name: p.player_name,
      team: p.team,
      team_name: p.team_name,
      position: p.position,
      price: p.price,
      prev_price: p.prev_price,
      price_change: p.price_change,
      price_change_pct: p.price_change_pct,
      projection: p.projection,
      season_avg: p.season_avg,
      last_3_avg: p.last_3_avg,
      last_5_avg: p.last_5_avg,
      games_played: p.games_played,
      breakeven: p.breakeven,
      edge: p.edge,
      value_score: p.value_score,
      signal: p.signal,
      signal_tag: p.signal_tag,
      signal_display: p.signal_display,
      category: p.category,
      action: p.action,
      why: null,
      why_long: null,
      matchup_label: p.matchup_label,
      matchup_multiplier: p.matchup_multiplier,
      consistency: p.consistency,
      neeko_rating: p.neeko_rating,
      status: p.status,
      manual_status: p.manual_status,
      is_bye: p.is_bye,
      is_injured: p.is_injured,
      cached_at: p.cached_at,
      access_tier: p.access_tier,
      projection_confidence: null,
      captain_score: null,
      captain_rating: null,
      recommendation_color: null,
      upside_pct: null,
      ceiling_estimate: null,
      floor_estimate: null,
      form_score: null,
      neeko_rating_scaled: null,
      upside_rating: null,
      risk_rating: null,
      matchup_rating: null,
      trend_signal: null,
      trend_score: null,
      form_delta: null,
      form_label: null,
      is_available: null,
      bye_round: null,
      bye_next_round: null,
      consistency_tier: null,
      recommendation_strength: null,
      total_count: null,
      ai_updated_at: null,
      position_group: null,
      confidence_label: p.confidence_label ?? null,
      confidence_score_100: p.confidence_score_100 ?? null,
      decision_score: p.decision_score ?? null,
      value_band: p.value_band ?? null,
      action_display: p.action_display ?? null,
      action_canonical: p.action_canonical ?? null,
      action_reason_1: p.action_reason_1 ?? null,
      action_reason_2: p.action_reason_2 ?? null,
    };
    setSelectedPlayer({ row, rank, tier: isPremium ? "premium" : "full" });
    track("market_watch_player_click", { player_name: p.player_name });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-white/30 text-sm animate-pulse">Loading market data...</div>
      </div>
    );
  }

  const pageTitle = "AFL Fantasy Market Watch | Neeko Sports Stats";

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="AFL Fantasy Market Watch — Target, Watch and Avoid signals sorted by value score and projection data. Find the best trade targets this round." />
        <link rel="canonical" href="https://neekostats.com.au/fantasy/market-watch" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="AFL Fantasy Market Watch — Target, Watch and Avoid signals sorted by value score and projection data. Find the best trade targets this round." />
        <meta property="og:url" content="https://neekostats.com.au/fantasy/market-watch" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content="AFL Fantasy Market Watch — Target, Watch and Avoid signals sorted by value score and projection data. Find the best trade targets this round." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">

          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">AFL Fantasy</span>
                <span className="h-px w-6 bg-white/[0.06]" />
                <span className="text-[10px] uppercase tracking-wider text-[#F5C84C] font-semibold">Market Watch</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">Market Watch</h1>
                {dataUpdatedAt && (
                  <DataFreshnessIndicator
                    timestamp={dataUpdatedAt}
                    label="Data"
                    variant="compact"
                    className="text-white/40"
                  />
                )}
              </div>
              <p className="text-sm text-white/40 mt-1">Trade signals ranked by Neeko value, projection and confidence.</p>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-40 shrink-0"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* ── HERO STATS ──────────────────────────────────────────────────── */}
          {(bestBuy || bestAvoid) && (
            <div className="grid grid-cols-2 gap-3">
              {bestBuy && (
                <button
                  onClick={() => openPlayer(bestBuy, 1)}
                  className="rounded-xl p-4 text-left transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.22)" }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">Top Target</span>
                  </div>
                  <p className="text-base font-bold text-white truncate">{bestBuy.player_name}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{bestBuy.team} · {fmtPrice(bestBuy.price ?? 0)} · {fmt(bestBuy.projection, 0)} pts proj</p>
                </button>
              )}
              {bestAvoid && (
                <button
                  onClick={() => openPlayer(bestAvoid, sells.indexOf(bestAvoid) + 1)}
                  className="rounded-xl p-4 text-left transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.22)" }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400/70">Top Avoid</span>
                  </div>
                  <p className="text-base font-bold text-white truncate">{bestAvoid.player_name}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{bestAvoid.team} · {fmtPrice(bestAvoid.price ?? 0)} · {fmt(bestAvoid.projection, 0)} pts proj</p>
                </button>
              )}
            </div>
          )}

          {/* ── FILTER BAR ──────────────────────────────────────────────────── */}
          <div className="space-y-2">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["ALL", "BUY", "HOLD", "AVOID"] as TabFilter[]).map((tab) => {
                const isActive = activeTab === tab;
                const locked = !isPremium && tab !== "ALL";
                const color =
                  tab === "BUY"
                    ? "#4ade80"
                    : tab === "AVOID"
                    ? "#f87171"
                    : tab === "HOLD"
                    ? "rgba(255,255,255,0.4)"
                    : "#F5C84C";

                return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (locked) {
                        setShowFilterHint(true);
                        return;
                      }
                      setActiveTab(tab);
                      track("market_watch_tab_change", { tab });
                    }}
                    title={locked ? "Unlock filters with Neeko+" : undefined}
                    className="relative text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      background: isActive ? `${color}15` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isActive ? `${color}40` : locked ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.06)"}`,
                      color: locked
                        ? "rgba(255,255,255,0.30)"
                        : isActive
                        ? color
                        : "rgba(255,255,255,0.45)",
                      cursor: locked ? "pointer" : "pointer",
                    }}
                  >
                    {locked && <Lock className="inline-block w-2.5 h-2.5 mr-1 -mt-px text-[#F5C84C] opacity-60" />}
                    {tab}
                    {tab === "BUY" && <span className="ml-1.5 text-[10px]">{buys.length}</span>}
                    {tab === "AVOID" && <span className="ml-1.5 text-[10px]">{sells.length}</span>}
                    {tab === "HOLD" && <span className="ml-1.5 text-[10px]">{holds.length}</span>}
                  </button>
                );
              })}
            </div>

            {/* Filters row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Position filter */}
              <div className="flex items-center gap-1">
                {POSITIONS.map((pos) => {
                  const isActive = selectedPosition === pos;
                  const locked = !isPremium;
                  return (
                    <button
                      key={pos}
                      onClick={() => {
                        if (locked) {
                          setShowFilterHint(true);
                          return;
                        }
                        setSelectedPosition(isActive ? null : pos);
                      }}
                      title={locked ? "Unlock filters with Neeko+" : undefined}
                      className="relative text-[10px] font-bold uppercase px-2 py-1 rounded-lg transition-all"
                      style={{
                        background: isActive ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isActive ? "rgba(255,255,255,0.20)" : locked ? "rgba(245,200,76,0.12)" : "rgba(255,255,255,0.08)"}`,
                        color: locked ? "rgba(255,255,255,0.35)" : isActive ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.40)",
                      }}
                    >
                      {locked && <Lock className="inline-block w-2 h-2 mr-0.5 -mt-px text-[#F5C84C] opacity-50" />}
                      {pos}
                    </button>
                  );
                })}
              </div>

              {/* Price range — locked for free users */}
              {isPremium ? (
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="number"
                    placeholder="Min $K"
                    value={priceMin ?? ""}
                    onChange={(e) => setPriceMin(e.target.value ? Number(e.target.value) : null)}
                    className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-white/60 placeholder-white/25 outline-none focus:border-white/20 transition-colors"
                  />
                  <span className="text-[10px] text-white/25">—</span>
                  <input
                    type="number"
                    placeholder="Max $K"
                    value={priceMax ?? ""}
                    onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : null)}
                    className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-white/60 placeholder-white/25 outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowFilterHint(true)}
                  title="Unlock filters with Neeko+"
                  className="flex items-center gap-1.5 ml-1 px-3 py-1 rounded-lg text-[11px] transition-all hover:bg-white/[0.04]"
                  style={{
                    border: "1px solid rgba(245,200,76,0.15)",
                    background: "rgba(245,200,76,0.04)",
                    color: "rgba(245,200,76,0.55)",
                  }}
                >
                  <Lock className="w-2.5 h-2.5" />
                  Price filters are Neeko+
                </button>
              )}

              {/* Search */}
              {isPremium ? (
                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player..."
                    className="w-36 sm:w-44 bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-white/70 placeholder-white/25 outline-none focus:border-white/20 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowFilterHint(true)}
                  title="Unlock filters with Neeko+"
                  className="relative ml-auto flex items-center gap-1.5 pl-7 pr-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/[0.04]"
                  style={{
                    border: "1px solid rgba(245,200,76,0.15)",
                    background: "rgba(245,200,76,0.04)",
                    color: "rgba(245,200,76,0.55)",
                    width: "11rem",
                  }}
                >
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50" />
                  <Lock className="w-2.5 h-2.5 shrink-0" />
                  Search players with Neeko+
                </button>
              )}
            </div>

            {/* Inline upgrade hint — shown when a locked control is clicked */}
            {showFilterHint && !isPremium && (
              <div
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[12px]"
                style={{
                  background: "rgba(245,200,76,0.06)",
                  border: "1px solid rgba(245,200,76,0.20)",
                }}
              >
                <div className="flex items-center gap-2 text-[#F5C84C]/80">
                  <Crown className="w-3.5 h-3.5 shrink-0" />
                  <span>Filters, search and full table access are included in Neeko+</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all hover:opacity-90"
                    style={{
                      background: "rgba(245,200,76,0.15)",
                      border: "1px solid rgba(245,200,76,0.30)",
                      color: "#F5C84C",
                    }}
                  >
                    Upgrade
                  </button>
                  <button
                    onClick={() => setShowFilterHint(false)}
                    className="text-white/25 hover:text-white/50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── ERROR STATE ─────────────────────────────────────────────────── */}
          {fetchError && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/20 bg-red-500/05">
              {fetchError}
            </div>
          )}

          {/* ── TABLE ───────────────────────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden border border-white/[0.08]" style={{ background: "#0a0a0a" }}>
            {/* Table header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.06]">
              <span className="w-5 shrink-0" />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-white/25">Player</span>
              <div className="hidden md:flex items-center gap-4 shrink-0">
                <span className="w-12 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Value</span>
                <span className="w-12 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Conf</span>
              </div>
              <span className="w-10 text-[10px] font-semibold uppercase tracking-wider text-white/25 text-right">Proj</span>
              <span className="w-3 shrink-0" />
            </div>

            {/* Grouped view (default ALL tab, no filters) */}
            {groupedView ? (
              <>
                {/* Must Have / Buy section */}
                {groupedView.targets.length > 0 && (
                  <div>
                    <GroupHeader
                      label="Must Have"
                      count={buys.length}
                      accentColor="#4ade80"
                      icon={<TrendingUp className="w-3 h-3" />}
                    />
                    {groupedView.targets.map((p, i) => (
                      <PlayerTableRow key={p.player_id} player={p} rank={i + 1} onClick={() => openPlayer(p, i + 1)} />
                    ))}
                  </div>
                )}

                {/* Strong Value / Hold — premium only */}
                {isPremium && groupedView.options.length > 0 && (
                  <div>
                    <GroupHeader
                      label="Strong Value"
                      count={holds.length}
                      accentColor="rgba(255,255,255,0.40)"
                      icon={<Minus className="w-3 h-3" />}
                    />
                    {groupedView.options.map((p, i) => (
                      <PlayerTableRow key={p.player_id} player={p} rank={i + 1} onClick={() => openPlayer(p, i + 1)} />
                    ))}
                  </div>
                )}

                {/* Overpriced / Avoid section */}
                {sells.length > 0 && (
                  <div>
                    <GroupHeader
                      label="Overpriced / Avoid"
                      count={sells.length}
                      accentColor="#f87171"
                      icon={<AlertTriangle className="w-3 h-3" />}
                    />
                    {groupedView.risks.map((p, i) => (
                      <PlayerTableRow key={p.player_id} player={p} rank={i + 1} onClick={() => openPlayer(p, i + 1)} />
                    ))}
                    {!isPremium && sells.length > FREE_AVOID_LIMIT && (
                      <LockedRow rank={FREE_AVOID_LIMIT + 1} lockedCount={sells.length - FREE_AVOID_LIMIT} />
                    )}
                  </div>
                )}

                {/* Upgrade CTA for free users */}
                {!isPremium && (
                  <LockCTA
                    onUpgrade={() => setShowUpgradeModal(true)}
                    hiddenCount={Math.max(0, (buys.length - FREE_BUY_LIMIT) + holds.length + Math.max(0, sells.length - FREE_AVOID_LIMIT))}
                  />
                )}
              </>
            ) : (
              /* Flat filtered view */
              <>
                {visiblePlayers.length === 0 ? (
                  <div className="py-12 text-center text-white/30 text-sm">No players match these filters.</div>
                ) : (
                  visiblePlayers.map((p, i) => (
                    <PlayerTableRow key={p.player_id} player={p} rank={i + 1} onClick={() => openPlayer(p, i + 1)} />
                  ))
                )}
                {!isPremium && hiddenCount > 0 && (
                  <>
                    <LockedRow rank={visiblePlayers.length + 1} lockedCount={hiddenCount} />
                    <LockCTA onUpgrade={() => setShowUpgradeModal(true)} hiddenCount={hiddenCount} />
                  </>
                )}
              </>
            )}

            {/* Stats row */}
            {players.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
                <span className="text-[10px] text-white/20">
                  {isPremium ? `${allPlayers.length} players` : `${FREE_BUY_LIMIT + FREE_AVOID_LIMIT} of ${allPlayers.length} players`}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-green-400/60">{buys.length} start</span>
                  <span className="text-[10px] text-white/20">{holds.length} hold</span>
                  <span className="text-[10px] text-red-400/60">{sells.length} avoid</span>
                </div>
              </div>
            )}
          </div>

          {/* ── DISTRIBUTION SUMMARY ────────────────────────────────────────── */}
          {players.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/[0.06] flex">
                <div
                  className="h-full bg-green-500/60 transition-all duration-500"
                  style={{ width: `${(buys.length / players.length) * 100}%` }}
                />
                <div
                  className="h-full bg-white/20 transition-all duration-500"
                  style={{ width: `${(holds.length / players.length) * 100}%` }}
                />
                <div
                  className="h-full bg-red-500/60 transition-all duration-500"
                  style={{ width: `${(sells.length / players.length) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-white/25 shrink-0">
                {buys.length} start · {holds.length} hold · {sells.length} avoid
              </span>
            </div>
          )}

          {/* ── SEO ─────────────────────────────────────────────────────────── */}
          <CollapsibleSEO />

        </div>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          row={selectedPlayer.row}
          rank={selectedPlayer.rank}
          isPremium={isPremium}
          isUnlocked={true}
          tier={selectedPlayer.tier}
          isFreeTop5={false}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
