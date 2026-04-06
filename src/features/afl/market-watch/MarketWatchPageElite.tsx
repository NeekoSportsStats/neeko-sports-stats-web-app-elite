import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Lock, Crown } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow } from "./types";
import { classifyPlayers, DerivedPlayer } from "./engine";

const _MW_STALE_MS = 60_000;
const _mwCache: { data: MWPlayerRow[] | null; ts: number; userId: string | null; tier: string | null } = {
  data: null, ts: 0, userId: null, tier: null,
};
import { MarketSnapshotBar } from "./MarketSnapshotBar";
import { MarketMetricsStrip } from "./MarketMetricsStrip";
import { MarketDataTable } from "./MarketDataTable";
const PlayerDetailPanel = lazy(() => import("./PlayerDetailPanel").then(m => ({ default: m.PlayerDetailPanel })));
import { MarketControls, MarketFilter } from "./MarketControls";
import { MarketAdvancedFilters } from "./MarketAdvancedFilters";
import { MarketDistributionBar } from "./MarketDistributionBar";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { MarketSearchBar } from "./MarketSearchBar";
import { DataFreshnessIndicator, StaleDataWarning } from "@/components/ui/DataFreshnessIndicator";
import { ErrorState } from "@/components/ui/ErrorState";

export default function MarketWatchPageElite() {
  const { isPremium, user, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<DerivedPlayer | null>(null);
  const [activeFilter, setActiveFilter] = useState<MarketFilter>("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const [searchedPlayer, setSearchedPlayer] = useState<DerivedPlayer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);

  const fetchData = useCallback(async (force = false) => {
    const userId = user?.id ?? null;
    const tier = isPremium ? "premium" : "free";
    const now = Date.now();
    if (
      !force &&
      _mwCache.data &&
      _mwCache.userId === userId &&
      _mwCache.tier === tier &&
      now - _mwCache.ts < _MW_STALE_MS
    ) {
      setPlayers(_mwCache.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.rpc("get_market_watch_safe", {
        p_user_id: userId,
        p_is_bot: false,
        p_limit: 250,
      });

      if (error) throw error;

      const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => {
        const catRaw = (r.category ?? "").toLowerCase();
        const displaySignal: "TARGET" | "WATCH" | "AVOID" =
          catRaw === "target" ? "TARGET" : catRaw === "avoid" ? "AVOID" : "WATCH";

        const isBye = r.is_bye === true || (r.status ?? '').toLowerCase() === 'bye' || (r.manual_status ?? '').toLowerCase() === 'bye';

        return {
          player_id: r.player_id,
          player_name: r.player_name,
          team: r.team ?? r.team_name ?? '',
          team_name: r.team_name ?? r.team ?? '',
          position: r.player_position ?? r.position ?? '',
          price: r.price != null ? Number(r.price) : 0,
          prev_price: r.prev_price != null ? Number(r.prev_price) : null,
          price_change: r.price_change != null ? Number(r.price_change) : null,
          price_change_pct: null,
          projection: r.projection != null ? Number(r.projection) : null,
          season_avg: r.season_avg != null ? Number(r.season_avg) : null,
          last_3_avg: r.last_3_avg != null ? Number(r.last_3_avg) : null,
          last_5_avg: r.last_5_avg != null ? Number(r.last_5_avg) : null,
          games_played: r.games_played != null ? Number(r.games_played) : null,
          breakeven: r.breakeven != null ? Number(r.breakeven) : null,
          edge: r.edge != null ? Number(r.edge) : null,
          value_score: r.value_score != null ? Number(r.value_score) : null,
          signal: r.signal ?? null,
          category: r.category ?? null,
          action: r.action ?? null,
          why: r.why ?? null,
          why_long: r.why_long ?? null,
          matchup_label: r.matchup_label ?? null,
          matchup_rating: r.matchup_rating ?? null,
          matchup_multiplier: r.matchup_multiplier != null ? Number(r.matchup_multiplier) : null,
          consistency: r.consistency != null ? Number(r.consistency) : null,
          neeko_rating: r.neeko_rating != null ? Number(r.neeko_rating) : null,
          is_bye: isBye,
          status: r.status ?? null,
          manual_status: r.manual_status ?? null,
          cached_at: r.cached_at ?? null,
          display_signal: displaySignal,
          access_tier: r.access_tier ?? 'locked',
        };
      });

      const finalPlayers = mapped.filter(p => !p.is_bye);

      _mwCache.data = finalPlayers;
      _mwCache.ts = Date.now();
      _mwCache.userId = userId;
      _mwCache.tier = tier;
      setPlayers(finalPlayers);
    } catch (error) {
      console.error("[Market Watch] Error:", error);
      setFetchError("Failed to load Market Watch data. Check your connection and try again.");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isPremium]);

  const handleRefresh = useCallback(() => {
    track("market_watch_refresh");
    fetchData(true);
  }, [fetchData]);

  useEffect(() => { track("market_watch_view"); }, []);
  useEffect(() => {
    if (authLoading) return;
    fetchData();
  }, [authLoading, fetchData]);

  // MEMOIZE: Classification (expensive for 200+ players)
  const classified = useMemo(() => {
    return classifyPlayers(players);
  }, [players]);

  const allDerivedPlayers = useMemo(() => {
    return [
      ...(classified?.buys ?? []),
      ...(classified?.holds ?? []),
      ...(classified?.sells ?? []),
    ]
      .filter(p => p && p.player_id)
      .sort((a, b) => {
        const vDiff = (b.value_score ?? 0) - (a.value_score ?? 0);
        if (vDiff !== 0) return vDiff;
        return (b.projection ?? 0) - (a.projection ?? 0);
      });
  }, [classified]);

  // MEMOIZE: Filtered players — search happens on full dataset before visible slice
  const filteredPlayers = useMemo(() => {
    let filtered = allDerivedPlayers;

    // Apply signal filter using _category — premium only for TARGET/WATCH/AVOID
    if (isPremium) {
      if (activeFilter === "TARGET") {
        filtered = filtered.filter(p => p._category === 'BUY');
      } else if (activeFilter === "WATCH") {
        filtered = filtered.filter(p => p._category === 'HOLD');
      } else if (activeFilter === "AVOID") {
        filtered = filtered.filter(p => p._category === 'SELL');
      }
    }

    // Apply team filter (premium only)
    if (selectedTeam && selectedTeam !== "all" && isPremium) {
      const normalizedTeam = selectedTeam.trim().toLowerCase();
      filtered = filtered.filter(p => {
        const playerTeam = (p.team ?? '').trim().toLowerCase();
        return playerTeam === normalizedTeam;
      });
    }

    // Apply position filter (premium only)
    if (selectedPosition && selectedPosition !== "all" && isPremium) {
      const normalizedPosition = selectedPosition.trim().toUpperCase();
      filtered = filtered.filter(p => {
        const playerPosition = (p.position ?? '').trim().toUpperCase();
        return playerPosition === normalizedPosition;
      });
    }

    // Apply text search on full filtered dataset (premium only) — before visible slice
    if (isPremium && searchQuery.trim().length >= 2) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(p =>
        p.player_name?.toLowerCase().includes(q) ||
        (p.team ?? '').toLowerCase().includes(q) ||
        (p.position ?? '').toLowerCase().includes(q)
      );
    }

    // Pin to single player when selected from dropdown (after text filter so it always resolves)
    if (searchedPlayer && searchQuery.trim().length === 0) {
      filtered = filtered.filter(p => p.player_id === searchedPlayer.player_id);
    }

    return filtered;
  }, [activeFilter, allDerivedPlayers, searchedPlayer, searchQuery, selectedTeam, selectedPosition, isPremium]);

  // Gate total pool: free users capped at 10, premium gets full list
  const gatedPlayers = useMemo(() => {
    if (!isPremium) return filteredPlayers.slice(0, 10);
    return filteredPlayers;
  }, [filteredPlayers, isPremium]);

  // MEMOIZE: Visible players for progressive loading (premium only pagination)
  const visiblePlayers = useMemo(() => {
    return gatedPlayers.slice(0, visibleCount);
  }, [gatedPlayers, visibleCount]);

  // Reset visible count when filters or search query change
  useEffect(() => {
    setVisibleCount(50);
  }, [activeFilter, selectedTeam, selectedPosition, searchedPlayer, searchQuery]);

  const hasMorePlayers = isPremium && gatedPlayers.length > visibleCount;
  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  const updatedAt = players[0]?.cached_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  // Hero card eligibility: stricter threshold — established player with real price
  const isHeroEligible = (p: DerivedPlayer) =>
    (p.projection ?? 0) >= 60 &&
    (p.price ?? 0) >= 300000;

  // Top cards: pull directly from classified buckets (single source of truth from engine)
  const topTarget = useMemo(() => {
    const sorted = [...(classified?.buys ?? [])].filter(isHeroEligible).sort((a, b) => b.percentile_rank - a.percentile_rank);
    return sorted[0] ?? null;
  }, [classified]);

  const topWatch = useMemo(() => {
    const sorted = [...(classified?.holds ?? [])].filter(isHeroEligible).sort((a, b) => b.percentile_rank - a.percentile_rank);
    return sorted[0] ?? null;
  }, [classified]);

  const topAvoid = useMemo(() => {
    const sorted = [...(classified?.sells ?? [])].filter(isHeroEligible).sort((a, b) => a.percentile_rank - b.percentile_rank);
    return sorted[0] ?? null;
  }, [classified]);

  if (loading) {
    return <MarketWatchSkeleton />;
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white">
        <ErrorState
          variant="page"
          message="Failed to load Market Watch"
          detail={fetchError}
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-white/30 text-sm">No market data available</p>
          <p className="text-white/20 text-xs">Check back after weekly price changes</p>
          <button
            onClick={handleRefresh}
            className="mt-2 px-5 py-2 bg-white/8 border border-white/10 rounded-lg hover:bg-white/12 transition-colors text-sm text-white/60 hover:text-white/80"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Trade Targets 2026 | Market Watch | Neeko Sports</title>
        <meta name="description" content="AFL Fantasy trade advice updated weekly — who to trade in, trade out, and hold based on price movement, value score, and AI projections." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/market-watch" />
        <meta property="og:title" content="AFL Fantasy Trade Targets 2026 | Market Watch | Neeko Sports" />
        <meta property="og:description" content="AFL Fantasy trade advice updated weekly — who to trade in, trade out, and hold based on price movement, value score, and AI projections." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/market-watch" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Fantasy Trade Targets 2026 | Market Watch | Neeko Sports" />
        <meta name="twitter:description" content="AFL Fantasy trade advice updated weekly — who to trade in, trade out, and hold based on price movement, value score, and AI projections." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "AFL Fantasy Market Watch — Trade Targets 2026",
          "description": "Track the best AFL Fantasy trade targets, avoids, value plays and market movement for the upcoming round.",
          "url": "https://neekostats.com.au/sports/afl/market-watch",
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
              { "@type": "ListItem", "position": 3, "name": "Market Watch", "item": "https://neekostats.com.au/sports/afl/market-watch" }
            ]
          }
        })}</script>
      </Helmet>
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-4 border-b border-white/[0.08] pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-1.5">
                Market Watch
              </h1>
              <p className="text-sm text-white/50">
                Trade targets, fair-priced holds, and overpriced risks for the upcoming round.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {players.length > 0 && (
                <div className="hidden sm:block">
                  <DataFreshnessIndicator
                    timestamp={players[0]?.cached_at}
                    label="Market Data"
                    variant="compact"
                  />
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] hover:border-white/[0.14] transition-all text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Helper badge strip */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/[0.06] border border-green-500/20 rounded-lg">
              <span className="text-sm">🔥</span>
              <div>
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider mr-1.5">TARGET</span>
                <span className="text-[11px] text-white/40">Underpriced players with upside</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F5C84C]/[0.04] border border-[#F5C84C]/15 rounded-lg">
              <span className="text-sm">👁</span>
              <div>
                <span className="text-[10px] font-bold text-[#F5C84C] uppercase tracking-wider mr-1.5">WATCH</span>
                <span className="text-[11px] text-white/40">Fair value or role-dependent</span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/[0.04] border border-orange-500/15 rounded-lg">
              <span className="text-sm">⚠️</span>
              <div>
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mr-1.5">AVOID</span>
                <span className="text-[11px] text-white/40">Overpriced or negative value</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stale Data Warning */}
        {players.length > 0 && (
          <StaleDataWarning timestamp={players[0]?.cached_at} />
        )}

        {/* Market Snapshot Bar */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <MarketSnapshotBar
            topTarget={topTarget}
            topWatch={topWatch}
            topAvoid={topAvoid}
          />
        </div>

        {/* Market Metrics Strip */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-50">
          <MarketMetricsStrip players={allDerivedPlayers} />
        </div>

        {/* Market Distribution Bar */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
          <MarketDistributionBar
            targetCount={classified?.buys?.length ?? 0}
            watchCount={classified?.holds?.length ?? 0}
            avoidCount={classified?.sells?.length ?? 0}
          />
        </div>

        {/* Search + Controls */}
        <div className="space-y-3">
          {/* Search row */}
          <div className="flex items-center gap-3 flex-wrap">
            <MarketSearchBar
              players={allDerivedPlayers}
              isPremium={isPremium ?? false}
              onSelect={(p) => {
                setSearchedPlayer(p);
                if (p) {
                  setSelectedPlayer(p);
                  setSearchQuery("");
                }
              }}
              onQueryChange={(q) => {
                setSearchQuery(q);
                if (q.trim().length === 0) setSearchedPlayer(null);
              }}
              selectedPlayerId={searchedPlayer?.player_id ?? null}
            />
            {(searchedPlayer || searchQuery.trim().length >= 2) && (
              <button
                onClick={() => { setSearchedPlayer(null); setSearchQuery(""); }}
                className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>

          {/* Filter pills + count */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <MarketControls
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              targetCount={classified?.buys?.length ?? 0}
              watchCount={classified?.holds?.length ?? 0}
              avoidCount={classified?.sells?.length ?? 0}
              isPremium={isPremium ?? false}
            />

            <div className="text-xs text-white/35 font-medium">
              Showing {visiblePlayers.length} of {gatedPlayers.length} player{gatedPlayers.length !== 1 ? 's' : ''}
              {!isPremium && filteredPlayers.length > 10 && (
                <span className="ml-1 text-[#F5C84C]/60">— <a href="/neeko-plus" className="underline underline-offset-2 hover:text-[#F5C84C]/90 transition-colors">Neeko+ to see all {filteredPlayers.length}</a></span>
              )}
            </div>
          </div>

          <MarketAdvancedFilters
            selectedTeam={selectedTeam}
            selectedPosition={selectedPosition}
            onTeamChange={setSelectedTeam}
            onPositionChange={setSelectedPosition}
            isPremium={isPremium ?? false}
          />
        </div>

        {/* Data Table */}
        <div className="animate-in fade-in duration-500 delay-150">
          <MarketDataTable
            players={visiblePlayers}
            onPlayerClick={setSelectedPlayer}
            isPremium={isPremium}
          />
        </div>

        {/* Free User CTA — shown after gated list */}
        {!isPremium && filteredPlayers.length > 10 && (
          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Gradient fade above CTA */}
            <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0D0D0D] pointer-events-none z-10" />

            {/* CTA Card */}
            <div
              className="relative rounded-2xl border border-[#F5C84C]/30 bg-[#0e0e0e] px-5 py-6 sm:px-8 sm:py-7 overflow-hidden"
              style={{ boxShadow: "0 0 40px rgba(245,200,76,0.06), 0 0 0 1px rgba(245,200,76,0.12)" }}
            >
              {/* Subtle background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#F5C84C]/[0.04] to-transparent pointer-events-none" />

              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
                <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/10 shrink-0">
                  <Lock size={18} className="text-[#F5C84C]" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-lg font-extrabold text-white leading-tight mb-1">
                    You're missing {filteredPlayers.length - 10}+ trade opportunities
                  </p>
                  <p className="text-sm text-white/45 leading-relaxed">
                    Unlock full Market Watch with value scores, edge signals, and AI insights
                  </p>
                </div>

                <Link
                  to="/neeko-plus"
                  onClick={() => track("market_watch_cta_click")}
                  className="shrink-0 inline-flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold text-sm px-6 py-3 rounded-xl hover:brightness-110 transition-all min-h-[48px] w-full sm:w-auto whitespace-nowrap"
                >
                  <Crown size={14} />
                  Unlock Full Market Watch
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Show More Button */}
        {hasMorePlayers && (
          <div className="flex justify-center pb-8 animate-in fade-in duration-300">
            <button
              onClick={handleShowMore}
              className="px-8 py-3 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition-all text-sm font-medium hover:border-white/20"
            >
              Show More ({gatedPlayers.length - visibleCount} remaining)
            </button>
          </div>
        )}

        {/* SEO Content — always in DOM for indexing, collapsed by default */}
        <div className="border border-white/[0.08] rounded-xl overflow-hidden">
          <button
            onClick={() => setSeoOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
          >
            <h2 className="text-sm font-semibold text-white/70">
              AFL Fantasy Trade Guide (How to Use Market Watch)
            </h2>
            <span className="text-xs text-white/40 ml-4 shrink-0">
              {seoOpen ? "Hide" : "Show"}
            </span>
          </button>

          <div
            className={`transition-all duration-300 ease-in-out ${seoOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"} overflow-hidden`}
            aria-hidden={!seoOpen}
          >
            <div className="px-5 pb-6 space-y-4 border-t border-white/[0.06]">
              <div className="pt-4">
                <p className="text-sm text-white/55 leading-relaxed">
                  Market Watch is your weekly AFL Fantasy trade advice hub — tracking price movements and surfacing the best trade targets, holds, and fades each round. Every player is scored using Neeko's value model, which compares projected points output against current fantasy price to identify inefficiencies: who to trade in before a price rise, who to hold, and who to trade out before a price drop.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/70 mb-2">How to read the categories</h3>
                <ul className="space-y-2 text-sm text-white/50 leading-relaxed">
                  <li><strong className="text-white/65">Target (Buy)</strong> — Underpriced relative to projected output. Strong trade-in candidates who should rise in price over the next 1–3 rounds.</li>
                  <li><strong className="text-white/65">Watch (Hold)</strong> — Fairly valued. Keep in your squad but no urgent action required this week.</li>
                  <li><strong className="text-white/65">Avoid (Sell)</strong> — Overpriced for their current projection. Consider trading out before their price drops.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/70 mb-2">For this round</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Market Watch updates after weekly AFL Fantasy price changes. The value score and breakeven are recalculated each round based on the latest prices and projection data. For focused round decisions, also check the <a href="/sports/afl/edge-board" className="text-white/65 underline underline-offset-2 hover:text-white transition-colors">Edge Board</a> for top captain and trap picks, or the <a href="/sports/afl/current-round" className="text-white/65 underline underline-offset-2 hover:text-white transition-colors">Current Round tips</a> for this week's full analysis.
                </p>
              </div>
            </div>
          </div>

          {!seoOpen && (
            <div className="sr-only">
              <p>Market Watch is your weekly AFL Fantasy trade advice hub — tracking price movements and surfacing the best trade targets, holds, and fades each round.</p>
              <p>Target (Buy) — Underpriced relative to projected output. Watch (Hold) — Fairly valued. Avoid (Sell) — Overpriced for their current projection.</p>
            </div>
          )}
        </div>
      </div>

      {/* Player Detail Panel */}
      <Suspense fallback={null}>
        <PlayerDetailPanel
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          allPlayers={filteredPlayers}
        />
      </Suspense>
    </div>
    </>
  );
}

function formatRelativeTime(ts: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}
