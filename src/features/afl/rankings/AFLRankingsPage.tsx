import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Search, X, RefreshCw, TrendingUp, Star, Zap, Crown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { DataFreshnessIndicator } from "@/components/ui/DataFreshnessIndicator";
import { ErrorState } from "@/components/ui/ErrorState";

import {
  RankingRow, PositionFilter, PremiumFilter, SortKey, SortDir, RowTier,
} from "./components/types";
import {
  FREE_FULL_ROWS, PREMIUM_INITIAL_ROWS,
  getFreeTier, fmt, fmtValueScore, applyRelativeConfidenceLabels,
} from "./components/helpers";
import { mapRankingRow } from "./components/mapRankingRow";
import {
  NeekoRatingInfoModal, UpgradeModal, PlayerDetailModal,
} from "./components/RankingsModals";
import {
  TableHeader, TableRow, ConversionWallRow, LoadingSkeletonRows,
} from "./components/RankingsTable";
import { MobileRankingsTable } from "./components/MobileRankingsTable";
import { CollapsibleSEO } from "./components/CollapsibleSEO";

const STALE_MS = 60_000;
const CACHE_VERSION = "v2-trend";
const _rankingsCache: { data: RankingRow[] | null; ts: number; userId: string | null; tier: string | null; version: string } = {
  data: null, ts: 0, userId: null, tier: null, version: "",
};

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

function ValueStrip({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) return null;

  const top8 = rows.slice(0, FREE_FULL_ROWS);

  const highestProj = top8.reduce<RankingRow | null>((best, r) => {
    if (r.projection == null) return best;
    if (!best || r.projection > (best.projection ?? 0)) return r;
    return best;
  }, null);

  const bestValue = top8.reduce<RankingRow | null>((best, r) => {
    const score = (r as any).decision_score ?? r.value_score;
    if (score == null) return best;
    const bestScore = (best as any)?.decision_score ?? best?.value_score;
    if (!best || score > (bestScore ?? 0)) return r;
    return best;
  }, null);

  const avgProj = (() => {
    const valid = top8.filter((r) => r.projection != null && !r.is_bye);
    if (valid.length === 0) return null;
    return valid.reduce((sum, r) => sum + (r.projection ?? 0), 0) / valid.length;
  })();

  const cards = [
    {
      icon: <TrendingUp size={13} className="text-emerald-400" />,
      label: "Top Value Pick",
      value: bestValue ? fmtValueScore(bestValue.value_score) : "—",
      sub: bestValue?.player_name ?? "—",
      color: "text-emerald-400",
    },
    {
      icon: <Star size={13} className="text-[#F5C84C]" />,
      label: "Highest Projection",
      value: highestProj ? fmt(highestProj.projection) : "—",
      sub: highestProj?.player_name ?? "—",
      color: "text-[#F5C84C]",
    },
    {
      icon: <Zap size={13} className="text-blue-400" />,
      label: "Avg Projection (Top 8)",
      value: avgProj != null ? avgProj.toFixed(1) : "—",
      sub: "Based on current top 8",
      color: "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(({ icon, label, value, sub, color }) => (
        <div key={label} className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 h-full">
          <div className="flex items-center gap-1.5 mb-2">
            {icon}
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium leading-none">{label}</p>
          </div>
          <p className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</p>
          <p className="text-[11px] text-white/35 mt-1 truncate leading-tight">{sub}</p>
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
              {row.projection != null && (
                <span className="text-xs font-semibold text-white/40 tabular-nums shrink-0 ml-2">
                  {Math.round(row.projection)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineGateBlock({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="border-t border-white/[0.04] px-4 py-5 flex flex-col items-center text-center gap-3">
      <p className="text-sm font-semibold text-white/70">
        200+ players ranked with AI analysis
      </p>
      <p className="text-xs text-white/35">
        Full projections, value scores &amp; weekly AI recommendations
      </p>
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-5 py-2 text-sm font-bold text-[#070707] transition-all shadow-lg"
      >
        <Crown size={13} />
        Unlock Full Rankings
      </button>
    </div>
  );
}

export default function AFLRankingsPage() {
  const { isPremium, user } = useAuth();

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PREMIUM_INITIAL_ROWS);
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [ratingInfoOpen, setRatingInfoOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [updatedAt, setUpdatedAt] = useState<{ ts: string; round: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { track("rankings_view"); }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchTerm]);

  async function fetchAIForRow(row: RankingRow): Promise<Partial<RankingRow>> {
    if (!row.player_id || !row.player_name) return {};
    const { data } = await supabase
      .rpc("get_player_detail_safe", {
        p_player_name: row.player_name,
        p_user_id: user?.id ?? null,
      });
    if (!data || !data[0]) return {};
    const d = data[0] as any;
    return {
      why:       d.why ?? null,
      why_long:  d.why_long ?? null,
      cached_at: d.cached_at ?? null,
    };
  }

  const fetchRankings = useCallback(async (force = false) => {
    const userId = user?.id ?? null;
    const tier = isPremium ? "premium" : "free";
    const now = Date.now();
    if (
      !force &&
      _rankingsCache.data &&
      _rankingsCache.userId === userId &&
      _rankingsCache.tier === tier &&
      _rankingsCache.version === CACHE_VERSION &&
      now - _rankingsCache.ts < STALE_MS
    ) {
      setRows(_rankingsCache.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);
    setSelected(null);
    setHighlightedPlayerId(null);

    const { data, error } = await supabase.rpc("get_rankings_safe", {
      p_user_id: userId,
      p_is_bot: false,
      p_limit: isPremium ? 700 : 100,
    });

    if (error) {
      console.error("Rankings fetch error:", error);
      setFetchError("Failed to load rankings. Check your connection and try again.");
      setRows([]);
      setLoading(false);
      return;
    }
    const normalized = applyRelativeConfidenceLabels(((data as any[]) ?? []).map(mapRankingRow));
    _rankingsCache.data = normalized;
    _rankingsCache.ts = Date.now();
    _rankingsCache.userId = userId;
    _rankingsCache.tier = tier;
    _rankingsCache.version = CACHE_VERSION;
    setRows(normalized);
    const firstCachedAt = (data as any[])?.[0]?.cached_at;
    if (firstCachedAt) {
      setUpdatedAt((prev) => prev ?? { ts: firstCachedAt, round: "Current Round" });
    }

    setLoading(false);
  }, [user?.id, isPremium]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  useEffect(() => {
    function onPricesApplied() {
      fetchRankings(true);
    }
    window.addEventListener("neeko:prices-applied", onPricesApplied);
    return () => window.removeEventListener("neeko:prices-applied", onPricesApplied);
  }, [fetchRankings]);

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    track("rankings_refresh_click");
    try {
      await fetchRankings(true);
    } finally {
      setIsRefreshing(false);
    }
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
      player_name: row.player_name,
      player_id:   row.player_id,
      position:    row.position,
      team:        row.team,
      is_unlocked: isUnlocked,
      source:      "rankings",
    });
    if (isUnlocked) {
      const needsAI = !row.why && !row.why_long;
      if (needsAI) {
        const aiData = await fetchAIForRow(row);
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
        filtered = filtered.slice(0, 50);
      } else if (premiumFilter === "TOP100") {
        filtered = filtered.slice(0, 100);
      } else if (premiumFilter === "ELITE") {
        filtered = filtered.filter((r) => (r.neeko_rating_scaled ?? r.neeko_rating ?? 0) >= 90);
      } else {
        filtered = filtered.filter((r) => r.position === premiumFilter);
      }
    }

    filtered = [...filtered].sort((a, b) => {
      const av = ((a as any)[sortKey] as number | null | undefined) ?? -Infinity;
      const bv = ((b as any)[sortKey] as number | null | undefined) ?? -Infinity;
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return filtered;
  }, [rows, debouncedSearch, isPremium, premiumFilter, sortKey, sortDir]);

  const displayRows = useMemo(() => {
    if (!isPremium) return sortedRows.slice(0, FREE_FULL_ROWS);
    return sortedRows.slice(0, visibleCount);
  }, [sortedRows, isPremium, visibleCount]);

  const rankingsHelmet = (
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
  );

  return (
    <>
      {rankingsHelmet}

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="w-full max-w-[1240px] mx-auto px-4 pt-8 pb-10">

          {/* HEADER */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Player Rankings</h1>
              <p className="text-sm text-white/45 mt-1.5 max-w-lg leading-relaxed">
                Full player rankings sorted by projected score. Use alongside Market Watch and Current Round for trade decisions.
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
            <div className="md:hidden mb-2">
              <DataFreshnessIndicator
                timestamp={updatedAt.ts}
                label="Rankings"
                variant="compact"
                className="text-[#F5C84C]"
              />
            </div>
          )}

          {/* VALUE STRIP */}
          {!loading && displayRows.length > 0 && (
            <div className="mb-4">
              <ValueStrip rows={displayRows} />
            </div>
          )}

          {/* PREMIUM CONTROLS */}
          {isPremium && (
            <>
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

              <div className="sticky top-[72px] z-30 bg-[#070707] pb-2 -mx-4 px-4 mb-3 flex flex-wrap gap-1.5">
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
            </>
          )}

          {/* TABLE — desktop */}
          <div className="hidden md:block">
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full min-w-[860px] border-collapse">
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
                    ) : fetchError ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-10">
                          <ErrorState
                            message={fetchError}
                            onRetry={() => fetchRankings(true)}
                            retrying={isRefreshing}
                          />
                        </td>
                      </tr>
                    ) : displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-16 text-center">
                          <p className="text-sm text-white/30">No players match the current filter.</p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {displayRows.map((row, idx) => {
                          const tier: RowTier = isPremium ? "premium" : getFreeTier(idx);
                          const isUnlocked = isPremium || tier === "full";
                          const isHighlighted = highlightedPlayerId != null && row.player_id === highlightedPlayerId;
                          return (
                            <TableRow
                              key={row.player_id ?? idx}
                              row={row}
                              idx={idx}
                              isPremium={isPremium}
                              tier={tier}
                              activeTab="best"
                              isHighlighted={isHighlighted}
                              onRowClick={() => openRow(row, idx + 1, tier, isUnlocked)}
                              onUpgrade={() => setShowUpgradeModal(true)}
                            />
                          );
                        })}
                        {!isPremium && !loading && (
                          <ConversionWallRow onUpgrade={() => setShowUpgradeModal(true)} />
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {isPremium && !loading && visibleCount < sortedRows.length && (
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

          {/* TABLE — mobile */}
          <div className="md:hidden">
            {fetchError && !loading && (
              <div className="px-4 pb-4">
                <ErrorState
                  variant="inline"
                  message={fetchError}
                  onRetry={() => fetchRankings(true)}
                  retrying={isRefreshing}
                />
              </div>
            )}
            <MobileRankingsTable
              rows={sortedRows}
              loading={loading}
              isPremium={isPremium}
              onOpenRow={(row, idx) => {
                const tier: RowTier = isPremium ? "premium" : getFreeTier(idx);
                const isUnlocked = isPremium || tier === "full";
                openRow(row, idx + 1, tier, isUnlocked);
              }}
              onUpgrade={() => setShowUpgradeModal(true)}
            />
            {!isPremium && !loading && (
              <InlineGateBlock onUpgrade={() => setShowUpgradeModal(true)} />
            )}
          </div>

          <CollapsibleSEO />

        </div>
      </div>

      {ratingInfoOpen && <NeekoRatingInfoModal onClose={() => setRatingInfoOpen(false)} />}
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
      {selected && (
        <PlayerDetailModal
          row={selected.row}
          rank={selected.rank}
          isPremium={isPremium}
          isUnlocked={selected.isUnlocked}
          tier={selected.tier}
          isFreeTop5={selected.tier === "full"}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
