import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Search, X, RefreshCw, TrendingUp, Star, Zap, Crown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { DataFreshnessIndicator, StaleDataWarning } from "@/components/ui/DataFreshnessIndicator";

import {
  RankingRow, RankingsTab, PositionFilter, PremiumFilter, SortKey, SortDir, RowTier,
} from "./components/types";
import {
  TAB_SORT_KEY, TAB_DESCRIPTIONS, TAB_DEFAULT_SORT,
  FREE_FULL_ROWS, FREE_PARTIAL_ROWS, PREMIUM_INITIAL_ROWS,
  getFreeTier, normalisePosition, computeKpiTiles, fmtUpdatedAt, fmt, fmtValueScore,
} from "./components/helpers";
import {
  NeekoRatingInfoModal, UpgradeModal, PlayerDetailModal,
} from "./components/RankingsModals";
import {
  TableHeader, TableRow, ConversionWallRow, LoadingSkeletonRows,
  FreeTableHeader, FreeTableRow, FreeConversionWallRow, FreeLoadingSkeletonRows,
} from "./components/RankingsTable";
import { MobileRankingsTable } from "./components/MobileRankingsTable";
import { CollapsibleSEO } from "./components/CollapsibleSEO";

const POSITIONS: PositionFilter[] = ["ALL", "DEF", "MID", "FWD", "RUC"];

const PREMIUM_QUICK_FILTERS: { key: PremiumFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DEF", label: "DEF" },
  { key: "MID", label: "MID" },
  { key: "FWD", label: "FWD" },
  { key: "RUC", label: "RUC" },
  { key: "TOP50", label: "Top 50" },
  { key: "TOP100", label: "Top 100" },
  { key: "ELITE", label: "Elite Only" },
];

function KpiTiles({ rows }: { rows: RankingRow[] }) {
  const { captainAvgProj, valueUpgrades, trapAlerts, highConfidence } = computeKpiTiles(rows);

  const tiles = [
    { label: "Top Captain Avg", value: captainAvgProj != null ? captainAvgProj.toFixed(1) : "—", sub: "Top 5 captain projections", color: "text-[#F5C84C]" },
    { label: "Value Upgrades", value: valueUpgrades.toString(), sub: "Strong+ value (top 30%)", color: "text-green-400" },
    { label: "Trap Alerts", value: trapAlerts.toString(), sub: "Overpriced or high risk", color: "text-red-400" },
    { label: "High Confidence", value: highConfidence.toString(), sub: "Confidence ≥ 65%", color: "text-green-400" },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map(({ label, value, sub, color }) => (
        <div key={label} className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
          <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function FreeValueStrip({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) return null;

  const top8 = rows.slice(0, FREE_FULL_ROWS);

  const highestProj = top8.reduce<RankingRow | null>((best, r) => {
    if (r.projection_final == null) return best;
    if (!best || r.projection_final > (best.projection_final ?? 0)) return r;
    return best;
  }, null);

  const bestValue = top8.reduce<RankingRow | null>((best, r) => {
    if (r.value_score == null) return best;
    if (!best || r.value_score > (best.value_score ?? 0)) return r;
    return best;
  }, null);

  const avgProj = (() => {
    const valid = top8.filter((r) => r.projection_final != null && !r.is_bye);
    if (valid.length === 0) return null;
    return valid.reduce((sum, r) => sum + (r.projection_final ?? 0), 0) / valid.length;
  })();

  const cards = [
    {
      icon: <Star size={14} className="text-[#F5C84C]" />,
      label: "Highest Projection",
      value: highestProj ? fmt(highestProj.projection_final) : "—",
      sub: highestProj?.player_name ?? "—",
      color: "text-[#F5C84C]",
    },
    {
      icon: <TrendingUp size={14} className="text-emerald-400" />,
      label: "Best Value Pick",
      value: bestValue ? fmtValueScore(bestValue.value_score) : "—",
      sub: bestValue?.player_name ?? "—",
      color: "text-emerald-400",
    },
    {
      icon: <Zap size={14} className="text-blue-400" />,
      label: "Avg Projection (Top 8)",
      value: avgProj != null ? avgProj.toFixed(1) : "—",
      sub: "Based on current top 8",
      color: "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {cards.map(({ icon, label, value, sub, color }) => (
        <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            {icon}
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{label}</p>
          </div>
          <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function SearchAutocomplete({
  rows,
  value,
  onChange,
  onSelect,
  isPremium,
  onUpgrade,
}: {
  rows: RankingRow[];
  value: string;
  onChange: (v: string) => void;
  onSelect: (row: RankingRow) => void;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!isPremium) return [];
    const term = value.trim().toLowerCase();
    if (!term || term.length < 2) return [];
    return rows
      .filter(
        (r) =>
          r.player_name.toLowerCase().includes(term) ||
          r.team.toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [rows, value, isPremium]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleFocus() {
    if (!isPremium) { onUpgrade(); return; }
    setOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isPremium) { onUpgrade(); return; }
    onChange(e.target.value);
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
      <input
        type="text"
        placeholder={isPremium ? "Search players or teams..." : "Search players (Neeko+ only)..."}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        readOnly={!isPremium}
        className={`h-11 w-full rounded-xl border bg-white/[0.04] pl-10 pr-8 text-sm text-white placeholder-white/30 outline-none transition-colors ${
          isPremium
            ? "border-white/15 focus:border-[#F5C84C]/40 focus:bg-white/[0.06] cursor-text"
            : "border-white/10 cursor-pointer opacity-60"
        }`}
      />
      {value && isPremium && (
        <button
          onClick={() => { onChange(""); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={12} />
        </button>
      )}
      {!isPremium && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <span className="text-[9px] text-[#F5C84C]/50 font-semibold uppercase tracking-wider">Neeko+</span>
        </div>
      )}
      {open && suggestions.length > 0 && isPremium && (
        <div className="absolute top-full mt-1 left-0 w-64 rounded-xl border border-white/10 bg-[#111] shadow-2xl z-50 overflow-hidden">
          {suggestions.map((row) => (
            <button
              key={row.player_id ?? row.player_name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(row); onChange(row.player_name); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.06] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-white group-hover:text-[#F5C84C] transition-colors leading-tight">
                  {row.player_name}
                </p>
                <p className="text-[11px] text-white/35 mt-0.5">{row.team}{row.position ? ` · ${row.position}` : ""}</p>
              </div>
              {row.neeko_rating != null && (
                <span className="text-xs font-semibold text-white/40 tabular-nums shrink-0 ml-2">
                  {Number(row.neeko_rating).toFixed(0)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


const PREMIUM_COLUMNS =
  "player_id,player_name,team,team_name,position,position_group," +
  "projection_final,ceiling,floor," +
  "consistency,form_score,neeko_rating,neeko_rating_scaled,price,prev_price,price_change,price_change_pct,breakeven,value_score,best_value_score,value_tag,value_tier," +
  "projection_confidence,risk_rating,matchup_rating,matchup_label,matchup_multiplier," +
  "upside_rating,upside_pct,captain_score,captain_rating,ai_recommendation,recommendation_strength,recommendation_color," +
  "summary_short,summary_long,recommendation_short,recommendation_why,ai_summary,consistency_tier,total_count,cached_at,games_played,ai_updated_at," +
  "start_sit_decision,edge_score,edge_tier,market_watch_category,status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round";

const FREE_COLUMNS =
  "player_id,player_name,team,team_name,position,position_group," +
  "projection_final,ceiling,floor," +
  "consistency,form_score,neeko_rating,neeko_rating_scaled,price,prev_price,price_change,price_change_pct,breakeven,value_score,best_value_score,value_tag,value_tier," +
  "projection_confidence,risk_rating,matchup_rating,matchup_label,matchup_multiplier," +
  "ai_recommendation,recommendation_strength,recommendation_color,summary_short,summary_long,recommendation_short,recommendation_why,ai_summary," +
  "consistency_tier,access_tier,total_count,cached_at,games_played,row_rank," +
  "start_sit_decision,edge_score,edge_tier,market_watch_category,status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round";

const AI_COLUMNS =
  "player_id,summary_short,summary_long,recommendation_short,recommendation_why,ai_summary,ai_updated_at";

function StickyUpgradeBar({ onUpgrade }: { onUpgrade: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 480);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-[#0d0d0d]/95 border-t border-white/[0.08] backdrop-blur-sm md:px-8">
      <p className="text-sm font-medium text-white/70 hidden sm:block">
        Unlock full rankings + AI insights
      </p>
      <p className="text-sm font-medium text-white/70 sm:hidden">
        More picks hidden
      </p>
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-5 py-2 text-sm font-bold text-[#070707] transition-all shadow-lg shrink-0"
      >
        <Crown size={13} />
        Subscribe
      </button>
    </div>
  );
}

export default function AFLRankingsPage() {
  const { isPremium } = useAuth();

  const [activeTab, setActiveTab] = useState<RankingsTab>("best");
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PREMIUM_INITIAL_ROWS);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [ratingInfoOpen, setRatingInfoOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(TAB_DEFAULT_SORT["best"]);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [updatedAt, setUpdatedAt] = useState<{ ts: string; round: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { track("rankings_view"); }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchTerm]);

  useEffect(() => {
    async function fetchUpdatedAt() {
      try {
        const { data, error } = await supabase.rpc("get_rankings_updated_at");
        if (!error && data && Array.isArray(data) && data[0]) {
          setUpdatedAt({ ts: data[0].updated_at, round: data[0].round_label ?? "Current Round" });
        }
      } catch {
        // RPC unavailable — silently ignore
      }
    }
    fetchUpdatedAt();
  }, []);

  function normalizeRow(r: any): RankingRow {
    return {
      player_id:              r.player_id,
      player_name:            r.player_name,
      team:                   r.team ?? r.team_name ?? "",
      position:               normalisePosition(r.position ?? r.position_group ?? null),
      projection_final:       r.projection_final != null ? Number(r.projection_final) : null,
      ceiling_estimate:       r.ceiling != null ? Number(r.ceiling) : (r.ceiling_estimate != null ? Number(r.ceiling_estimate) : null),
      floor_estimate:         r.floor != null ? Number(r.floor) : (r.floor_estimate != null ? Number(r.floor_estimate) : null),
      consistency_score:      r.consistency != null ? Number(r.consistency) : (r.consistency_score != null ? Number(r.consistency_score) : null),
      form_rating:            r.form_score != null ? Number(r.form_score) : (r.form_rating != null ? Number(r.form_rating) : null),
      neeko_rating:           r.neeko_rating_scaled != null ? Number(r.neeko_rating_scaled) : (r.neeko_rating != null ? Number(r.neeko_rating) : null),
      neeko_rating_scaled:    r.neeko_rating_scaled != null ? Number(r.neeko_rating_scaled) : null,
      projection_confidence:  r.projection_confidence != null ? Number(r.projection_confidence) : null,
      risk_rating:            r.risk_rating != null ? Number(r.risk_rating) : null,
      form_score:             r.form_score != null ? Number(r.form_score) : (r.form_rating != null ? Number(r.form_rating) : null),
      matchup_rating:         r.matchup_label ?? r.matchup_rating ?? null,
      upside_rating:          r.upside_rating != null ? Number(r.upside_rating) : null,
      captain_score:          r.captain_score != null ? Number(r.captain_score) : null,
      captain_rating:         r.captain_rating ?? null,
      price:                  r.price != null ? Number(r.price) : null,
      prev_price:             r.prev_price != null ? Number(r.prev_price) : null,
      price_change:           r.price_change != null ? Number(r.price_change) : null,
      price_change_pct:       r.price_change_pct != null ? Number(r.price_change_pct) : null,
      breakeven:              r.breakeven != null ? Number(r.breakeven) : null,
      value_score:            r.value_score != null ? Number(r.value_score) : null,
      best_value_score:       r.best_value_score != null ? Number(r.best_value_score) : null,
      value_tag:              r.value_tag ?? null,
      value_tier:             r.value_tier ?? null,
      ai_recommendation:      r.ai_recommendation ?? null,
      recommendation_strength: r.recommendation_strength ?? null,
      recommendation_color:   r.recommendation_color ?? null,
      consistency_tier:       r.consistency_tier ?? null,
      total_count:            r.total_count != null ? Number(r.total_count) : null,
      games_played:           r.games_played != null ? Number(r.games_played) : null,
      ai_updated_at:          r.ai_updated_at ?? null,
      why: r.why
        ?? r.summary_short
        ?? r.recommendation_short
        ?? null,
      long: r.long
        ?? r.summary_long
        ?? r.recommendation_why
        ?? r.ai_summary
        ?? null,
      ai_summary:           r.ai_summary ?? null,
      start_sit_decision:   r.start_sit_decision ?? null,
      edge_score:           r.edge_score != null ? Number(r.edge_score) : null,
      edge_tier:            r.edge_tier ?? null,
      market_watch_category: r.market_watch_category ?? null,
      upside_pct:           r.upside_pct != null ? Number(r.upside_pct) : null,
      status:               r.status ?? null,
      manual_status:        r.manual_status ?? null,
      is_available:         r.is_available != null ? Boolean(r.is_available) : null,
      bye_round:            r.bye_round != null ? Number(r.bye_round) : null,
      is_bye:               r.is_bye != null ? Boolean(r.is_bye) : null,
      bye_next_round:       r.bye_next_round != null ? Boolean(r.bye_next_round) : null,
    };
  }

  async function fetchAIForRow(row: RankingRow, forceView?: "master" | "free"): Promise<Partial<RankingRow>> {
    if (!row.player_id) return {};
    const view = forceView ?? (isPremium ? "master" : "free");
    if (view === "free") {
      return {
        why: row.why,
      };
    }
    const { data } = await supabase
      .from("v_rankings_master")
      .select(AI_COLUMNS)
      .eq("player_id", row.player_id)
      .maybeSingle();
    if (!data) return {};
    return {
      why:           (data as any).summary_short ?? (data as any).recommendation_short ?? row.why,
      long:          (data as any).summary_long ?? (data as any).recommendation_why ?? row.long,
      ai_updated_at: (data as any).ai_updated_at ?? row.ai_updated_at,
    };
  }

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    setHighlightedPlayerId(null);

    if (isPremium) {
      const { data, error } = await supabase
        .from("v_rankings_master")
        .select(PREMIUM_COLUMNS)
        .order("neeko_rating_scaled", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("Rankings fetch error (premium):", error);
        setRows([]);
        setLoading(false);
        return;
      }
      const normalized = ((data as any[]) ?? []).map(normalizeRow);
      setRows(normalized);
      const firstCachedAt = (data as any[])?.[0]?.cached_at;
      if (firstCachedAt) {
        setUpdatedAt((prev) => prev ?? { ts: firstCachedAt, round: "Current Round" });
      }
    } else {
      const { data: authData } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: authData?.user?.id ?? null,
        p_is_bot: false,
        p_limit: 500,
      });

      if (error) {
        console.error("Rankings fetch error (free):", error);
        setRows([]);
        setLoading(false);
        return;
      }
      const normalized = ((data as any[]) ?? []).map(normalizeRow);
      setRows(normalized);
      const firstCachedAt = (data as any[])?.[0]?.cached_at;
      if (firstCachedAt) {
        setUpdatedAt((prev) => prev ?? { ts: firstCachedAt, round: "Current Round" });
      }
    }

    setLoading(false);
  }, [isPremium]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  useEffect(() => {
    function onPricesApplied() {
      fetchRankings();
    }
    window.addEventListener("neeko:prices-applied", onPricesApplied);
    return () => window.removeEventListener("neeko:prices-applied", onPricesApplied);
  }, [fetchRankings]);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    track("rankings_refresh_click");
    try {
      await fetchRankings();
      try {
        const { data, error } = await supabase.rpc("get_rankings_updated_at");
        if (!error && data && Array.isArray(data) && data[0]) {
          setUpdatedAt({ ts: data[0].updated_at, round: data[0].round_label ?? "Current Round" });
        }
      } catch { /* ignore */ }
    } finally {
      setIsRefreshing(false);
    }
  }

  const PREMIUM_TABS: RankingsTab[] = ["value", "projection"];

  function handleTabChange(tab: RankingsTab) {
    if (!isPremium && PREMIUM_TABS.includes(tab)) {
      setShowUpgradeModal(true);
      return;
    }
    setActiveTab(tab);
    setPremiumFilter("ALL");
    setSearchTerm("");
    setDebouncedSearch("");
    setSortKey(TAB_DEFAULT_SORT[tab]);
    setSortDir("desc");
    setVisibleCount(50);
  }

  function handleSortClick(col: SortKey) {
    if (!isPremium) return;
    if (sortKey === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  }

  async function openRow(row: RankingRow, rank: number, tier: RowTier, isUnlocked: boolean) {
    setSelected({ row, rank, tier, isUnlocked });
    track("player_modal_open", {
      player_name:  row.player_name,
      player_id:    row.player_id,
      position:     row.position,
      team:         row.team,
      is_unlocked:  isUnlocked,
      source:       "rankings",
    });
    const isFreeTop5 = !isPremium && tier === "full";
    if (isUnlocked || isFreeTop5) {
      const needsAI = !row.why && !row.long;
      if (needsAI) {
        const aiData = await fetchAIForRow(row, isFreeTop5 && !isPremium ? "free" : undefined);
        if (Object.keys(aiData).length > 0) {
          setSelected((prev) => prev ? { ...prev, row: { ...prev.row, ...aiData } } : prev);
        }
      }
    }
  }

  function handleSearchSelect(row: RankingRow) {
    setHighlightedPlayerId(row.player_id ?? null);
    const idx = displayRows.findIndex((r) => r.player_id === row.player_id);
    if (idx >= 0) {
      const tier: RowTier = isPremium ? "premium" : getFreeTier(idx);
      const isUnlocked = isPremium || tier === "full";
      openRow(row, idx + 1, tier, isUnlocked);
    }
  }

  const safeActiveTab: RankingsTab = (!isPremium && PREMIUM_TABS.includes(activeTab)) ? "best" : activeTab;

  const sortedRows = useMemo(() => {
    let filtered = [...rows];

    if (isPremium && debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.player_name.toLowerCase().includes(term) ||
          (r.team ?? "").toLowerCase().includes(term)
      );
    }

    if (isPremium && premiumFilter !== "ALL") {
      if (premiumFilter === "TOP50") {
        filtered = filtered.filter((r) => (r.games_played ?? 0) >= 3);
      } else if (premiumFilter === "TOP100") {
        filtered = filtered.slice(0, 100);
      } else if (premiumFilter === "ELITE") {
        filtered = filtered.filter((r) => (r.neeko_rating_scaled ?? r.neeko_rating ?? 0) >= 90);
      } else {
        filtered = filtered.filter((r) => r.position === premiumFilter);
      }
    }

    if (isPremium && sortKey && sortKey !== TAB_DEFAULT_SORT[safeActiveTab]) {
      filtered = [...filtered].sort((a, b) => {
        const av = ((a as any)[sortKey] as number | null | undefined) ?? -Infinity;
        const bv = ((b as any)[sortKey] as number | null | undefined) ?? -Infinity;
        return sortDir === "desc" ? bv - av : av - bv;
      });
    } else {
      if (safeActiveTab === "best") {
        filtered = [...filtered].sort((a, b) => (b.neeko_rating_scaled ?? b.neeko_rating ?? 0) - (a.neeko_rating_scaled ?? a.neeko_rating ?? 0));
      } else if (safeActiveTab === "value") {
        filtered = filtered.filter((r) => (r.games_played ?? 0) >= 1 && r.price != null && r.price > 0);
        filtered = [...filtered].sort((a, b) => ((b.best_value_score ?? b.value_score ?? -Infinity) - (a.best_value_score ?? a.value_score ?? -Infinity)));
      } else if (safeActiveTab === "projection") {
        filtered = [...filtered].sort((a, b) => ((b.projection_final ?? -Infinity) - (a.projection_final ?? -Infinity)));
      }
    }

    return filtered;
  }, [rows, debouncedSearch, isPremium, premiumFilter, sortKey, sortDir, safeActiveTab]);

  const displayRows = useMemo(() => {
    if (!isPremium) return sortedRows.slice(0, FREE_FULL_ROWS);
    return sortedRows.slice(0, visibleCount);
  }, [sortedRows, isPremium, visibleCount]);

  const TABS: { key: RankingsTab; label: string; premiumOnly: boolean }[] = [
    { key: "best", label: "Best Overall", premiumOnly: false },
    { key: "value", label: "Best Value", premiumOnly: true },
    { key: "projection", label: "Top Projections", premiumOnly: true },
  ];

  if (!isPremium) {
    return (
      <>
        <Helmet>
          <title>AFL Fantasy Rankings 2026 | Top Players, Projections & Value | Neeko</title>
          <meta name="description" content="Complete AFL Fantasy rankings for 2026. AI-powered player projections, value scores, and recommendations. Updated weekly with the latest stats and analysis." />
          <meta name="keywords" content="AFL Fantasy rankings, fantasy football, player rankings, projections, value picks, 2026 season, AFL stats, fantasy drafts" />
          <meta property="og:title" content="AFL Fantasy Rankings 2026 | Neeko" />
          <meta property="og:description" content="Complete AFL Fantasy rankings for 2026. AI-powered projections, value analysis, and recommendations updated weekly." />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://neekostats.com.au/sports/afl/rankings" />
          <meta property="og:site_name" content="Neeko Sports" />
          <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
          <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="AFL Fantasy Rankings 2026 | Neeko" />
          <meta name="twitter:description" content="AI-powered AFL Fantasy rankings with projections, value scores, and recommendations." />
          <link rel="canonical" href="https://neekostats.com.au/sports/afl/rankings" />
          <meta name="robots" content="index, follow" />
          <meta name="author" content="Neeko Sports" />
          <meta property="article:modified_time" content={new Date().toISOString()} />
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": "AFL Fantasy Rankings 2026",
            "description": "Complete AFL Fantasy rankings for 2026. AI-powered player projections, value scores, and recommendations. Updated weekly with the latest stats and analysis.",
            "url": "https://neekostats.com.au/sports/afl/rankings",
            "publisher": {
              "@type": "Organization",
              "name": "Neeko Sports",
              "url": "https://neekostats.com.au"
            },
            "breadcrumb": {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
                { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/sports/afl" },
                { "@type": "ListItem", "position": 3, "name": "Rankings", "item": "https://neekostats.com.au/sports/afl/rankings" }
              ]
            }
          })}</script>
        </Helmet>

        <div className="min-h-screen bg-[#070707] text-white">

          {/* FREE HERO */}
          <div className="px-4 pt-10 pb-6 md:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">AFL Fantasy Rankings 2026</h1>
                <p className="text-sm text-white/45 mt-1.5 max-w-lg leading-relaxed">
                  AI-ranked BUY, HOLD &amp; AVOID picks for this round
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1 shrink-0">
                {updatedAt && (
                  <div className="hidden md:block">
                    <DataFreshnessIndicator
                      timestamp={updatedAt.ts}
                      label="Rankings"
                      variant="compact"
                      className="text-[#F5C84C]"
                    />
                  </div>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title="Refresh rankings data"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                </button>
              </div>
            </div>
            {updatedAt && (
              <div className="md:hidden mt-2">
                <DataFreshnessIndicator
                  timestamp={updatedAt.ts}
                  label="Rankings"
                  variant="compact"
                  className="text-[#F5C84C]"
                />
              </div>
            )}
            {updatedAt && <StaleDataWarning timestamp={updatedAt.ts} className="mt-3" />}
          </div>

          <div className="px-4 pb-16 md:px-8">

            {/* QUICK VALUE STRIP */}
            {!loading && displayRows.length > 0 && (
              <FreeValueStrip rows={displayRows} />
            )}

            {/* FREE TABLE — desktop */}
            <div className="hidden md:block">
              <div
                className="w-full overflow-x-auto rounded-xl border border-white/[0.06]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <table className="min-w-[640px] w-full border-collapse">
                  <thead className="sticky top-0 z-30 bg-[#0a0a0a] border-b border-[#222]">
                    <FreeTableHeader />
                  </thead>
                  <tbody>
                    {loading ? (
                      <FreeLoadingSkeletonRows />
                    ) : displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center">
                          <p className="text-sm text-white/30">No players available.</p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {displayRows.map((row, idx) => {
                          const tier: RowTier = getFreeTier(idx);
                          const isUnlocked = tier === "full";
                          return (
                            <FreeTableRow
                              key={row.player_id ?? idx}
                              row={row}
                              idx={idx}
                              onRowClick={() => openRow(row, idx + 1, tier, isUnlocked)}
                            />
                          );
                        })}
                        <FreeConversionWallRow onUpgrade={() => setShowUpgradeModal(true)} />
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FREE TABLE — mobile */}
            <div className="md:hidden">
              <MobileRankingsTable
                rows={sortedRows}
                loading={loading}
                isPremium={false}
                activeTab={activeTab}
                onOpenRow={(row, idx) => {
                  const tier: RowTier = getFreeTier(idx);
                  const isUnlocked = tier === "full";
                  openRow(row, idx + 1, tier, isUnlocked);
                }}
                onUpgrade={() => setShowUpgradeModal(true)}
              />
              {!loading && (
                <div className="mt-4">
                  <FreeConversionWallRow onUpgrade={() => setShowUpgradeModal(true)} />
                </div>
              )}
            </div>

          </div>

          <CollapsibleSEO />

        </div>

        <StickyUpgradeBar onUpgrade={() => setShowUpgradeModal(true)} />

        {ratingInfoOpen && <NeekoRatingInfoModal onClose={() => setRatingInfoOpen(false)} />}
        {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
        {selected && (
          <PlayerDetailModal
            row={selected.row}
            rank={selected.rank}
            isPremium={false}
            isUnlocked={selected.isUnlocked}
            tier={selected.tier}
            isFreeTop5={selected.tier === "full"}
            onClose={() => setSelected(null)}
          />
        )}
      </>
    );
  }

  // ── PREMIUM LAYOUT ──────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title>AFL Fantasy Rankings 2026 | Top Players, Projections & Value | Neeko</title>
        <meta name="description" content="Complete AFL Fantasy rankings for 2026. AI-powered player projections, value scores, and recommendations. Updated weekly with the latest stats and analysis." />
        <meta name="keywords" content="AFL Fantasy rankings, fantasy football, player rankings, projections, value picks, 2026 season, AFL stats, fantasy drafts" />
        <meta property="og:title" content="AFL Fantasy Rankings 2026 | Neeko" />
        <meta property="og:description" content="Complete AFL Fantasy rankings for 2026. AI-powered projections, value analysis, and recommendations updated weekly." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/rankings" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Fantasy Rankings 2026 | Neeko" />
        <meta name="twitter:description" content="AI-powered AFL Fantasy rankings with projections, value scores, and recommendations." />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/rankings" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Neeko Sports" />
        <meta property="article:modified_time" content={new Date().toISOString()} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "AFL Fantasy Rankings 2026",
          "description": "Complete AFL Fantasy rankings for 2026. AI-powered player projections, value scores, and recommendations. Updated weekly with the latest stats and analysis.",
          "url": "https://neekostats.com.au/sports/afl/rankings",
          "publisher": {
            "@type": "Organization",
            "name": "Neeko Sports",
            "url": "https://neekostats.com.au"
          },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/sports/afl" },
              { "@type": "ListItem", "position": 3, "name": "Rankings", "item": "https://neekostats.com.au/sports/afl/rankings" }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">

        <div className="px-4 pt-10 pb-4 md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">AFL Fantasy Rankings 2026</h1>
              <p className="text-sm text-white/40 mt-1">Fantasy projection rankings powered by AI</p>
            </div>
            <div className="flex items-center gap-3 mt-1 shrink-0">
              {updatedAt && (
                <div className="hidden md:block">
                  <DataFreshnessIndicator
                    timestamp={updatedAt.ts}
                    label="Rankings"
                    variant="compact"
                    className="text-[#F5C84C]"
                  />
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh rankings data"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 hover:border-white/20 hover:text-white/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
                <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            </div>
          </div>
          {updatedAt && (
            <div className="md:hidden mt-3">
              <DataFreshnessIndicator
                timestamp={updatedAt.ts}
                label="Rankings"
                variant="compact"
                className="text-[#F5C84C]"
              />
            </div>
          )}

          {updatedAt && <StaleDataWarning timestamp={updatedAt.ts} className="mt-3" />}
        </div>

        <div className="px-4 pb-16 md:px-8">

          <div className="mb-0 flex items-center gap-2 border-b border-white/[0.06]">
            {TABS.map(({ key, label, premiumOnly }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    isActive
                      ? "border-[#F5C84C] text-[#F5C84C]"
                      : "border-transparent text-white/40 hover:text-white/70"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-white/30 mt-3 mb-4 leading-relaxed max-w-2xl">
            {TAB_DESCRIPTIONS[safeActiveTab]}
          </p>

          <div className="mb-3">
            <SearchAutocomplete
              rows={rows}
              value={searchTerm}
              isPremium={isPremium}
              onUpgrade={() => setShowUpgradeModal(true)}
              onChange={setSearchTerm}
              onSelect={handleSearchSelect}
            />
          </div>

          <div className="sticky top-[72px] z-30 bg-[#070707] pb-2 -mx-4 px-4 md:-mx-8 md:px-8 mb-2 flex flex-wrap gap-1.5">
            {PREMIUM_QUICK_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPremiumFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  premiumFilter === key
                    ? "bg-[#F5C84C] text-[#070707]"
                    : "border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {!loading && displayRows.length > 0 && (
            <KpiTiles rows={displayRows} />
          )}

          <div className="hidden md:block">
            <div
              className="w-full overflow-x-auto overflow-y-auto max-h-[75vh] rounded-xl border border-white/5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <table className="min-w-[1100px] w-full border-collapse">
                <thead className="sticky top-0 z-30 bg-[#0a0a0a] border-b border-[#222]">
                  <TableHeader
                    isPremium={isPremium}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortClick={handleSortClick}
                    onRatingInfoOpen={() => setRatingInfoOpen(true)}
                  />
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingSkeletonRows />
                  ) : displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-16 text-center">
                        <p className="text-sm text-white/30">No players match the current filter.</p>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {displayRows.map((row, idx) => {
                        const tier: RowTier = "premium";
                        const isUnlocked = true;
                        const isHighlighted = highlightedPlayerId != null && row.player_id === highlightedPlayerId;
                        return (
                          <TableRow
                            key={row.player_id ?? idx}
                            row={row}
                            idx={idx}
                            isPremium={isPremium}
                            tier={tier}
                            activeTab={activeTab}
                            isHighlighted={isHighlighted}
                            onRowClick={() => openRow(row, idx + 1, tier, isUnlocked)}
                            onUpgrade={() => setShowUpgradeModal(true)}
                          />
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {!loading && visibleCount < sortedRows.length && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  onClick={() => setVisibleCount((v) => v + 50)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-2.5 text-sm font-medium text-white/60 hover:border-white/20 hover:text-white/80 transition-colors"
                >
                  Load More ({displayRows.length} of {sortedRows.length} players)
                </button>
              </div>
            )}
          </div>

          <div className="md:hidden">
            <MobileRankingsTable
              rows={sortedRows}
              loading={loading}
              isPremium={isPremium}
              activeTab={activeTab}
              onOpenRow={(row, idx) => {
                const tier: RowTier = "premium";
                openRow(row, idx + 1, tier, true);
              }}
              onUpgrade={() => setShowUpgradeModal(true)}
            />
          </div>

        </div>

        <CollapsibleSEO />

      </div>

      {ratingInfoOpen && (
        <NeekoRatingInfoModal onClose={() => setRatingInfoOpen(false)} />
      )}

      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}

      {selected && (
        <PlayerDetailModal
          row={selected.row}
          rank={selected.rank}
          isPremium={isPremium}
          isUnlocked={selected.isUnlocked}
          tier={selected.tier}
          isFreeTop5={false}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
