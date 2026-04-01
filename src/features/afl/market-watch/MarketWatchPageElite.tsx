import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Clock } from "lucide-react";
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

export default function MarketWatchPageElite() {
  const { isPremium, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<DerivedPlayer | null>(null);
  const [activeFilter, setActiveFilter] = useState<MarketFilter>("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);

  const fetchData = useCallback(async (premium: boolean) => {
    const fetchStart = performance.now();
    setLoading(true);
    try {
      const limit = premium ? 200 : 100;
      const viewName = premium ? "v_mw_premium" : "v_mw_free";
      const { data, error } = await supabase.from(viewName).select("*").limit(limit);

      if (error) throw error;

      const mapStart = performance.now();
      console.log(`[MW PERF] Fetched ${data?.length ?? 0} rows in ${(mapStart - fetchStart).toFixed(1)}ms`);

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

      const mapEnd = performance.now();
      console.log(`[MW PERF] Mapped ${mapped.length} players in ${(mapEnd - mapStart).toFixed(1)}ms`);

      console.log("[MW DEBUG - FETCH]", {
        source: viewName,
        total: data?.length ?? 0,
        mapped: mapped.length,
        categoryDistribution: {
          TARGET: mapped.filter(p => p.category === 'TARGET').length,
          WATCH: mapped.filter(p => p.category === 'WATCH').length,
          AVOID: mapped.filter(p => p.category === 'AVOID').length,
        }
      });

      setPlayers(mapped);
      console.log(`[MW PERF] Total fetch + map: ${(performance.now() - fetchStart).toFixed(1)}ms`);
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
    const classifyStart = performance.now();
    const result = classifyPlayers(players);
    console.log(`[MW PERF] Classified ${players.length} players in ${(performance.now() - classifyStart).toFixed(1)}ms`);
    return result;
  }, [players]);

  // MEMOIZE: All derived players
  const allDerivedPlayers = useMemo(() => {
    return [
      ...(classified?.buys ?? []),
      ...(classified?.holds ?? []),
      ...(classified?.sells ?? []),
    ];
  }, [classified]);

  // MEMOIZE: Filtered players (prevents re-filter on every render)
  const filteredPlayers = useMemo(() => {
    const filterStart = performance.now();
    let filtered = allDerivedPlayers;

    // Apply signal filter (TARGET/WATCH/AVOID)
    if (activeFilter === "TARGET") filtered = classified?.buys ?? [];
    else if (activeFilter === "WATCH") filtered = classified?.holds ?? [];
    else if (activeFilter === "AVOID") filtered = classified?.sells ?? [];

    // Apply team filter (premium only)
    if (selectedTeam && isPremium) {
      filtered = filtered.filter(p => p.team === selectedTeam);
    }

    // Apply position filter (premium only)
    if (selectedPosition && isPremium) {
      filtered = filtered.filter(p => p.position === selectedPosition);
    }

    console.log(`[MW PERF] Filtered to ${filtered.length} players in ${(performance.now() - filterStart).toFixed(1)}ms`);
    return filtered;
  }, [activeFilter, allDerivedPlayers, classified, selectedTeam, selectedPosition, isPremium]);

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  const topTarget = classified?.buys?.[0] || null;
  const topWatch = classified?.holds?.[0] || null;
  const topAvoid = classified?.sells?.[0] || null;

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
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Market Watch
            </h1>
            <p className="text-sm text-white/60">
              AI-powered trade signals · Updated weekly
            </p>
          </div>

          <div className="flex items-center gap-3">
            {relativeTime && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/40">
                <Clock className="w-4 h-4" />
                <span>{relativeTime}</span>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-sm">Refresh</span>
            </button>
          </div>
        </div>

        {/* Market Snapshot Bar */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <MarketSnapshotBar
            topTarget={topTarget}
            topWatch={topWatch}
            topAvoid={topAvoid}
          />
        </div>

        {/* Market Metrics Strip */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
          <MarketMetricsStrip players={allDerivedPlayers} />
        </div>

        {/* Market Distribution Bar */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <MarketDistributionBar
            targetCount={classified?.buys?.length ?? 0}
            watchCount={classified?.holds?.length ?? 0}
            avoidCount={classified?.sells?.length ?? 0}
          />
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <MarketControls
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              targetCount={classified?.buys?.length ?? 0}
              watchCount={classified?.holds?.length ?? 0}
              avoidCount={classified?.sells?.length ?? 0}
            />

            <div className="text-xs text-white/40">
              Showing {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}
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
            players={filteredPlayers}
            onPlayerClick={setSelectedPlayer}
            isPremium={isPremium}
          />
        </div>
      </div>

      {/* Player Detail Panel */}
      <PlayerDetailPanel
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        allPlayers={filteredPlayers}
      />
    </div>
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
