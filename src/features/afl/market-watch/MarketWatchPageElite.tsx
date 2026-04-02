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

  const fetchData = useCallback(async (premium: boolean) => {
    setLoading(true);
    try {
      const limit = premium ? 200 : 100;
      const viewName = premium ? "v_mw_premium" : "v_mw_free";
      const { data, error } = await supabase.from(viewName).select("*").limit(limit);

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
        ceiling: r.ceiling ?? 0,
        floor_val: r.floor_val ?? 0,
        risk_pct: r.risk_pct ?? 0,
        price_edge_pts: r.price_edge_pts ?? 0,
        expected_price_change: r.expected_price_change ?? 0,
        projected_price: r.projected_price ?? 0,
        projected_price_r1: r.projected_price_r1 ?? 0,
        projected_price_r2: r.projected_price_r2 ?? 0,
        projected_price_r3: r.projected_price_r3 ?? 0,
        breakout_score: r.breakout_score ?? null,
        breakout_flag: r.breakout_flag ?? null,
        volatility_score: r.volatility_score ?? 0,
        volatility_level: r.volatility_level ?? null,
        category: (r.action ?? 'WATCH').toUpperCase(),
        action: r.action ?? 'WATCH',
        trade_score: r.trade_score ?? 0,
        reasons: r.reasons ?? {},
        category_reason: r.category_reason ?? null,
        last3_avg: null,
        estimated_price: r.price ?? null,
        value_score: r.value_score ?? 0,
        value_label: r.value_label ?? null,
        price_range_top: null,
        price_range_bottom: null,
        value_momentum: r.value_momentum ?? null,
        momentum_label: r.momentum_label ?? null,
        peak_price: r.peak_price ?? null,
        peak_round: r.peak_round ?? null,
        peak_status: r.peak_status ?? null,
        season: r.season ?? 2026,
        round_number: r.round_number ?? 1,
        snapshot_updated_at: r.snapshot_updated_at ?? new Date().toISOString(),
        neeko_rating: r.neeko_rating ?? null,
        consistency_score: r.consistency ?? null,
        projection_confidence: r.projection_confidence ?? null,
        avg_season: null,
        last5_avg: null,
        ai_recommendation: r.ai_recommendation ?? null,
        recommendation_short: r.recommendation_short ?? null,
        matchup_label: r.matchup_label ?? null,
        summary_short: r.summary_short ?? null,
        summary_long: r.summary_long ?? null,
        is_injured: r.status === 'injured' || r.manual_status === 'injured' || false,
        is_bye: (r.is_bye ?? false) || r.status === 'bye' || r.manual_status === 'bye',
        status: r.status ?? r.manual_status ?? null,
        manual_status: r.manual_status ?? null,
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

  // MEMOIZE: All derived players sorted by category priority, then value_score DESC, then projection DESC
  const allDerivedPlayers = useMemo(() => {
    const CATEGORY_PRIORITY: Record<string, number> = {
      BUY: 0,
      HOLD: 1,
      SELL: 2,
    };

    const all = [
      ...(classified?.buys ?? []),
      ...(classified?.holds ?? []),
      ...(classified?.sells ?? []),
    ].filter(p => p && p.player_id);

    all.sort((a, b) => {
      const pa = CATEGORY_PRIORITY[a._category] ?? 1;
      const pb = CATEGORY_PRIORITY[b._category] ?? 1;
      if (pa !== pb) return pa - pb;
      const vsA = a.value_score ?? 0;
      const vsB = b.value_score ?? 0;
      if (vsB !== vsA) return vsB - vsA;
      return (b.projection ?? 0) - (a.projection ?? 0);
    });

    return all;
  }, [classified]);

  // MEMOIZE: Filtered players (prevents re-filter on every render)
  const filteredPlayers = useMemo(() => {
    let filtered = allDerivedPlayers;

    // Apply signal filter using _category (canonical BUY/HOLD/SELL from engine)
    if (activeFilter === "TARGET") {
      filtered = allDerivedPlayers.filter(p => p._category === 'BUY');
    } else if (activeFilter === "WATCH") {
      filtered = allDerivedPlayers.filter(p => p._category === 'HOLD');
    } else if (activeFilter === "AVOID") {
      filtered = allDerivedPlayers.filter(p => p._category === 'SELL');
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
  }, [activeFilter, allDerivedPlayers, classified, selectedTeam, selectedPosition, isPremium]);

  // MEMOIZE: Visible players for progressive loading
  const visiblePlayers = useMemo(() => {
    return filteredPlayers.slice(0, visibleCount);
  }, [filteredPlayers, visibleCount]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(100);
  }, [activeFilter, selectedTeam, selectedPosition]);

  const hasMorePlayers = filteredPlayers.length > visibleCount;
  const handleShowMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  const topTarget = classified?.buys?.[0] || null;
  const topWatch = classified?.holds?.[0] || null;
  const topAvoid = classified?.sells?.[0] ||
    allDerivedPlayers.find(p => p._category === 'SELL') ||
    [...allDerivedPlayers]
      .filter(p => (p.value_score ?? 0) < 0)
      .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))[0] || null;

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
              AI-powered trade signals · Updated weekly
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

        {/* SEO Content Block */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white mb-3">Who to Trade in AFL Fantasy — Market Watch Guide</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Market Watch is your weekly AFL Fantasy trade advice hub — tracking price movements and surfacing the best trade targets, holds, and fades each round. Every player is scored using Neeko's value model, which compares projected points output against current fantasy price to identify inefficiencies: who to trade in before a price rise, who to hold, and who to trade out before a price drop.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-2">How to read the categories</h3>
            <ul className="space-y-2 text-sm text-white/50 leading-relaxed">
              <li><strong className="text-white/70">Target (Buy)</strong> — Underpriced relative to projected output. Strong trade-in candidates who should rise in price over the next 1–3 rounds.</li>
              <li><strong className="text-white/70">Watch (Hold)</strong> — Fairly valued. Keep in your squad but no urgent action required this week.</li>
              <li><strong className="text-white/70">Avoid (Sell)</strong> — Overpriced for their current projection. Consider trading out before their price drops.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-2">For this round</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Market Watch updates after weekly AFL Fantasy price changes. The value score and breakeven are recalculated each round based on the latest prices and projection data. For focused round decisions, also check the <a href="/sports/afl/edge-board" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Edge Board</a> for top captain and trap picks, or the <a href="/sports/afl/current-round" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Current Round tips</a> for this week's full analysis.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <MarketControls
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              targetCount={classified?.buys?.length ?? 0}
              watchCount={classified?.holds?.length ?? 0}
              avoidCount={classified?.sells?.length ?? 0}
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
