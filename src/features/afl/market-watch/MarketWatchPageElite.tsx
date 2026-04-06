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
      const { data, error } = await supabase
        .schema("afl")
        .from("player_rankings_cache")
        .select("player_id, player_name, team, team_name, position, price, prev_price, price_change, projection_final, season_avg, last_3_avg, last_5_avg, breakeven_canonical, edge_canonical, value_score_canonical, signal_canonical, category_canonical, action_canonical, recommendation_short, summary_short, summary_long, matchup_label, matchup_rating, matchup_multiplier, consistency, neeko_rating, status, manual_status, is_bye, games_played, cached_at")
        .order("value_score_canonical", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) throw error;

      const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => {
        const catRaw = (r.category_canonical ?? "").toLowerCase();
        const displaySignal: "TARGET" | "WATCH" | "AVOID" =
          catRaw === "target" ? "TARGET" : catRaw === "avoid" ? "AVOID" : "WATCH";

        const isInjured = ['injured', 'out', 'omitted'].includes((r.status ?? '').toLowerCase()) || ['injured', 'out'].includes((r.manual_status ?? '').toLowerCase());
        const isBye = r.is_bye === true || (r.status ?? '').toLowerCase() === 'bye' || (r.manual_status ?? '').toLowerCase() === 'bye';

        return {
          player_id: r.player_id,
          player_name: r.player_name,
          team: r.team ?? r.team_name ?? '',
          team_name: r.team_name ?? r.team ?? '',
          position: r.position,
          price: r.price ?? 0,
          prev_price: r.prev_price ?? null,
          price_change: r.price_change ?? null,
          price_change_pct: null,
          projection: parseFloat(r.projection_final ?? '0') || 0,
          projection_final: parseFloat(r.projection_final ?? '0') || 0,
          season_avg: r.season_avg ?? null,
          last_3_avg: r.last_3_avg ?? null,
          last_5_avg: r.last_5_avg ?? null,
          ceiling: null,
          floor_val: null,
          breakeven_canonical: r.breakeven_canonical != null ? Number(r.breakeven_canonical) : null,
          edge_canonical: r.edge_canonical != null ? Number(r.edge_canonical) : null,
          value_score_canonical: r.value_score_canonical != null ? Number(r.value_score_canonical) : null,
          signal_canonical: r.signal_canonical ?? null,
          category_canonical: r.category_canonical ?? null,
          action_canonical: r.action_canonical ?? null,
          signal_tag: r.category_canonical ?? null,
          signal: r.signal_canonical ?? null,
          market_watch_category: r.category_canonical ?? null,
          action: r.action_canonical ?? null,
          recommendation_short: r.recommendation_short ?? null,
          summary_short: r.summary_short ?? null,
          summary_long: r.summary_long ?? null,
          matchup_label: r.matchup_label ?? null,
          matchup_rating: r.matchup_rating ?? null,
          matchup_multiplier: r.matchup_multiplier ?? null,
          consistency: r.consistency ?? null,
          neeko_rating: r.neeko_rating ?? null,
          is_injured: isInjured,
          is_bye: isBye,
          games_played: r.games_played ?? null,
          status: r.status ?? null,
          manual_status: r.manual_status ?? null,
          cached_at: r.cached_at ?? null,
          display_signal: displaySignal,
        };
      });

      // Eligibility filter: meaningful players only (no rookies, no noise)
      const isEligible = (p: MWPlayerRow) =>
        (p.games_played ?? 0) >= 3 &&
        (p.projection ?? 0) >= 55 &&
        !p.is_injured &&
        !p.is_bye;

      const finalPlayers = mapped.filter(isEligible);

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

  // MEMOIZE: All derived players — bucket-first (TARGET → WATCH → AVOID), then edge_canonical DESC within bucket
  const allDerivedPlayers = useMemo(() => {
    const bucketOrder: Record<string, number> = { BUY: 0, HOLD: 1, SELL: 2 };
    return [
      ...(classified?.buys ?? []),
      ...(classified?.holds ?? []),
      ...(classified?.sells ?? []),
    ]
      .filter(p => p && p.player_id)
      .sort((a, b) => {
        const bucketDiff = (bucketOrder[a._category] ?? 1) - (bucketOrder[b._category] ?? 1);
        if (bucketDiff !== 0) return bucketDiff;
        const edgeDiff = (b.edge_canonical ?? 0) - (a.edge_canonical ?? 0);
        if (edgeDiff !== 0) return edgeDiff;
        return (b.projection ?? 0) - (a.projection ?? 0);
      });
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
