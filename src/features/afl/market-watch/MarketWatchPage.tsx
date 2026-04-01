import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow } from "./types";
import { MarketWatchHero } from "./MarketWatchHero";
import { MarketWatchSignalStrip } from "./MarketWatchSignalStrip";
import { MarketWatchPremiumCard } from "./MarketWatchPremiumCard";
import { MarketWatchPaywall } from "./MarketWatchPaywall";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { classifyPlayers, DerivedPlayer } from "./engine";
import { PremiumGate } from "@/components/PremiumGate";
import { PlayerAIModal } from "./PlayerAIModal";

export default function MarketWatchPage() {
  const { isPremium, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<DerivedPlayer | null>(null);

  const fetchData = useCallback(async (premium: boolean) => {
    setLoading(true);
    try {
      const limit = premium ? 200 : 100;
      const viewName = premium ? "v_mw_premium" : "v_mw_summary";
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
        category: r.category ?? null,
        action: r.action ?? 'HOLD',
        trade_score: r.trade_score ?? 0,
        reasons: r.reasons ?? {},
        category_reason: r.category_reason ?? null,
        last3_avg: null,
        estimated_price: r.price ?? null,
        value_score: r.value_score ?? 0,
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
        consistency_score: r.consistency_score ?? null,
        projection_confidence: r.projection_confidence ?? null,
        avg_season: r.avg_season ?? null,
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

      console.log("[MW DEBUG - FETCH]", {
        source: viewName,
        total: data?.length ?? 0,
        mapped: mapped.length,
      });

      setPlayers(mapped);
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

  // ALL HOOKS MUST RUN BEFORE ANY CONDITIONAL RETURN
  const classified = useMemo(() => classifyPlayers(players), [players]);

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  const topBuy = classified?.buys?.[0] || null;

  // NOW SAFE TO DO CONDITIONAL RETURNS
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">

        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Market Watch
            </h1>
            <p className="text-white/50">
              AI-powered trade signals updated weekly
            </p>
          </div>

          <div className="flex items-center gap-4">
            {relativeTime && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-white/40">
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
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <MarketWatchHero topBuy={topBuy} />
        </div>

        <div className="animate-in fade-in-slide-in-from-bottom-4 duration-700 delay-150">
          <MarketWatchSignalStrip
            buyCount={classified?.buys?.length ?? 0}
            holdCount={classified?.holds?.length ?? 0}
            sellCount={classified?.sells?.length ?? 0}
          />
        </div>

        <div className="space-y-12 animate-in fade-in duration-500">
          <CategorySection
            title="🔥 BUY"
            subtitle="Strong value and upside — recommended purchases"
            count={classified?.buys?.length ?? 0}
            players={classified?.buys ?? []}
            type="buy"
            onPlayerClick={setSelectedPlayer}
            isPremium={isPremium}
          />

          <CategorySection
            title="🟡 HOLD"
            subtitle="Neutral value — monitor for changes"
            count={classified?.holds?.length ?? 0}
            players={classified?.holds ?? []}
            type="hold"
            onPlayerClick={setSelectedPlayer}
            isPremium={isPremium}
          />

          <CategorySection
            title="🔴 SELL"
            subtitle="Poor value or risk — recommended exits"
            count={classified?.sells?.length ?? 0}
            players={classified?.sells ?? []}
            type="sell"
            onPlayerClick={setSelectedPlayer}
            isPremium={isPremium}
          />
        </div>
      </div>

      <PlayerAIModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
}

function formatRelativeTime(ts: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min${Math.floor(diff / 60) === 1 ? "" : "s"} ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr${Math.floor(diff / 3600) === 1 ? "" : "s"} ago`;
    return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

interface CategorySectionProps {
  title: string;
  subtitle: string;
  count: number;
  players: DerivedPlayer[];
  type: "buy" | "hold" | "sell";
  onPlayerClick: (player: DerivedPlayer) => void;
  isPremium: boolean;
}

function CategorySection({ title, subtitle, count, players, type, onPlayerClick, isPremium }: CategorySectionProps) {
  const [showAll, setShowAll] = useState(false);

  if (players.length === 0) return null;

  const colorMap = {
    sell: 'text-red-400 bg-red-500/10 border-red-500/20',
    buy: 'text-green-400 bg-green-500/10 border-green-500/20',
    hold: 'text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/20',
  };

  const freeLimit = 1;
  const premiumLimit = 6;
  const visiblePlayers = isPremium
    ? (showAll ? players : players.slice(0, premiumLimit))
    : players.slice(0, freeLimit);

  const hasMore = isPremium ? players.length > premiumLimit : players.length > freeLimit;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              {title}
            </h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold border ${colorMap[type]}`}>
              {count}
            </span>
          </div>
          <p className="text-white/50">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visiblePlayers.map((player, i) => (
          <MarketWatchPremiumCard
            key={player.player_id}
            player={player}
            rank={i + 1}
            type={type}
            onPlayerClick={onPlayerClick}
          />
        ))}
      </div>

      {!isPremium && hasMore && (
        <div className="mt-6 p-8 border border-white/10 rounded-lg bg-white/[0.02] text-center">
          <div className="inline-block px-3 py-1 bg-[#F5C84C]/20 border border-[#F5C84C]/40 rounded-full text-xs font-bold text-[#F5C84C] mb-3">
            PREMIUM
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {count - freeLimit} More {type === 'buy' ? 'Buys' : type === 'sell' ? 'Sells' : 'Holds'} Available
          </h3>
          <p className="text-white/60 mb-4">
            Unlock full Market Watch with Rankings AI access
          </p>
          <a
            href="/neeko-plus"
            className="inline-block px-6 py-3 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 transition-all"
          >
            Upgrade to Premium
          </a>
        </div>
      )}

      {isPremium && hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-4 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-lg hover:bg-white/[0.05] transition-all text-white font-medium"
        >
          Show All {count} Players
        </button>
      )}

      {isPremium && showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full mt-4 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-lg hover:bg-white/[0.05] transition-all text-white font-medium"
        >
          Show Less
        </button>
      )}
    </div>
  );
}
