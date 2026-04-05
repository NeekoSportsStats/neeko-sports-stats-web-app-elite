import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow } from "./types";
import { classifyPlayers, DerivedPlayer } from "./engine";
import { MarketSnapshotBar } from "./MarketSnapshotBar";
import { MarketMetricsStrip } from "./MarketMetricsStrip";
import { MarketDataTable } from "./MarketDataTable";
import { PlayerDetailPanel } from "./PlayerDetailPanel";
import { MarketControls, MarketFilter } from "./MarketControls";
import { MarketAdvancedFilters } from "./MarketAdvancedFilters";
import { MarketDistributionBar } from "./MarketDistributionBar";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { MarketSearchBar } from "./MarketSearchBar";
import { DataFreshnessIndicator, StaleDataWarning } from "@/components/ui/DataFreshnessIndicator";

export default function MarketWatchPageElite() {
  const { isPremium, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<DerivedPlayer | null>(null);
  const [activeFilter, setActiveFilter] = useState<MarketFilter>("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [searchedPlayer, setSearchedPlayer] = useState<DerivedPlayer | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);

  const fetchData = useCallback(async (premium: boolean) => {
    setLoading(true);
    try {
      const limit = premium ? 200 : 100;
      const viewName = premium ? "v_mw_premium" : "v_mw_free";
      const { data, error } = await supabase
        .from(viewName)
        .select("*")
        .order("value_gap", { ascending: false })
        .limit(limit);


      if (error) throw error;

      const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => ({
        snapshot_id: r.snapshot_id ?? 'market-watch',
        player_id: r.player_id,
        player_name: r.player_name,
        team: r.team,
        position: r.position,
        price: r.price ?? 0,
        breakeven: r.breakeven ?? 0,
        projection: r.projection ?? 0,
        ceiling: r.ceiling ?? null,
        floor_val: r.floor_val ?? null,
        risk_pct: r.risk_pct ?? null,
        value_gap: r.value_gap ?? 0,
        signal_tag: r.signal_tag ?? null,
        signal: r.signal ?? null,
        category: (r.category ?? 'HOLD').toUpperCase(),
        action: (r.category ?? 'HOLD').toUpperCase(),
        recommendation_short: r.recommendation_short ?? null,
        summary_short: r.summary_short ?? null,
        summary_long: r.summary_long ?? null,
        matchup_label: r.matchup_label ?? null,
        prev_price: r.prev_price ?? null,
        price_change: r.price_change ?? null,
        consistency: r.consistency ?? null,
        projection_confidence: r.projection_confidence ?? null,
        neeko_rating: r.neeko_rating ?? null,
        season: r.season ?? 2026,
        round_number: r.round_number ?? 1,
        snapshot_updated_at: r.snapshot_updated_at ?? new Date().toISOString(),
        is_injured: ['injured', 'out', 'omitted'].includes((r.status ?? '').toLowerCase()) || ['injured', 'out'].includes((r.manual_status ?? '').toLowerCase()),
        is_bye: r.is_bye === true || (r.status ?? '').toLowerCase() === 'bye' || (r.manual_status ?? '').toLowerCase() === 'bye',
        status: r.status ?? null,
        manual_status: r.manual_status ?? null,
        value_signal: r.value_signal ?? null,
      }));

      // FREE TIER: Filter out injured/bye players for cleaner first impression
      const finalPlayers = premium ? mapped : mapped.filter(p => !p.is_injured && !p.is_bye);

      setPlayers(finalPlayers);
    } catch (error) {
      console.error("[Market Watch] Error:", error);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    track("market_watch_refresh");
    fetchData(isPremium);
  }, [fetchData, isPremium]);

  useEffect(() => { track("market_watch_view"); }, []);
  useEffect(() => {
    if (authLoading) return;
    fetchData(isPremium);
  }, [authLoading, isPremium, fetchData]);

  // MEMOIZE: Classification (expensive for 200+ players)
  const classified = useMemo(() => {
    return classifyPlayers(players);
  }, [players]);

  // MEMOIZE: All derived players sorted by ABS(value_gap) DESC — strongest signals first
  const allDerivedPlayers = useMemo(() => {
    return [
      ...(classified?.buys ?? []),
      ...(classified?.holds ?? []),
      ...(classified?.sells ?? []),
    ]
      .filter(p => p && p.player_id)
      .sort((a, b) => Math.abs(b.value_gap ?? 0) - Math.abs(a.value_gap ?? 0));
  }, [classified]);

  // MEMOIZE: Filtered players (prevents re-filter on every render)
  const filteredPlayers = useMemo(() => {
    // Search override: if a player was selected from search, show only that player
    if (searchedPlayer) {
      return allDerivedPlayers.filter(p => p.player_id === searchedPlayer.player_id);
    }

    let filtered = allDerivedPlayers;

    // Apply signal filter using _category — premium only for TARGET/WATCH/AVOID
    if (isPremium) {
      if (activeFilter === "TARGET") {
        filtered = allDerivedPlayers.filter(p => p._category === 'BUY');
      } else if (activeFilter === "WATCH") {
        filtered = allDerivedPlayers.filter(p => p._category === 'HOLD');
      } else if (activeFilter === "AVOID") {
        filtered = allDerivedPlayers.filter(p => p._category === 'SELL');
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

    return filtered;
  }, [activeFilter, allDerivedPlayers, searchedPlayer, selectedTeam, selectedPosition, isPremium]);

  // MEMOIZE: Visible players for progressive loading
  const visiblePlayers = useMemo(() => {
    return filteredPlayers.slice(0, visibleCount);
  }, [filteredPlayers, visibleCount]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(100);
  }, [activeFilter, selectedTeam, selectedPosition, searchedPlayer]);

  const hasMorePlayers = filteredPlayers.length > visibleCount;
  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  // Top cards: source from value_signal, pick highest ABS(value_gap) in each category
  const topTarget = useMemo(() => {
    const sorted = [...players]
      .filter(p => { const vs = (p.value_signal ?? "").toUpperCase(); return vs === "STRONG_BUY" || vs === "BUY"; })
      .sort((a, b) => Math.abs(b.value_gap ?? 0) - Math.abs(a.value_gap ?? 0));
    return sorted[0] ? { ...sorted[0], _category: 'BUY' as const } : null;
  }, [players]);

  const topWatch = useMemo(() => {
    const sorted = [...players]
      .filter(p => (p.value_signal ?? "").toUpperCase() === "HOLD")
      .sort((a, b) => Math.abs(b.value_gap ?? 0) - Math.abs(a.value_gap ?? 0));
    return sorted[0] ? { ...sorted[0], _category: 'HOLD' as const } : null;
  }, [players]);

  const topAvoid = useMemo(() => {
    const sorted = [...players]
      .filter(p => { const vs = (p.value_signal ?? "").toUpperCase(); return vs === "SELL" || vs === "STRONG_SELL"; })
      .sort((a, b) => Math.abs(b.value_gap ?? 0) - Math.abs(a.value_gap ?? 0));
    return sorted[0] ? { ...sorted[0], _category: 'SELL' as const } : null;
  }, [players]);

  if (loading) {
    return <MarketWatchSkeleton />;
  }

  if (players.length === 0) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">📊</div>
          <h2 className="text-2xl font-bold">No Market Data</h2>
          <p className="text-white/60">Check back after weekly price changes</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-6 py-3 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
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
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-1.5">
              Market Watch
            </h1>
            <p className="text-sm text-white/50">
              Players ranked by value relative to price. Top-rated players offer the best trade upside.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {players.length > 0 && (
              <div className="hidden sm:block">
                <DataFreshnessIndicator
                  timestamp={players[0]?.snapshot_updated_at}
                  label="Market Data"
                  variant="compact"
                />
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition-all text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Stale Data Warning */}
        {players.length > 0 && (
          <StaleDataWarning timestamp={players[0]?.snapshot_updated_at} />
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
                if (p) setSelectedPlayer(p);
              }}
              selectedPlayerId={searchedPlayer?.player_id ?? null}
            />
            {searchedPlayer && (
              <button
                onClick={() => setSearchedPlayer(null)}
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
              Showing {visiblePlayers.length} of {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}
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

        {/* Show More Button */}
        {hasMorePlayers && (
          <div className="flex justify-center pb-8 animate-in fade-in duration-300">
            <button
              onClick={handleShowMore}
              className="px-8 py-3 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition-all text-sm font-medium hover:border-white/20"
            >
              Show More ({filteredPlayers.length - visibleCount} remaining)
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
      <PlayerDetailPanel
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        allPlayers={filteredPlayers}
      />
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
