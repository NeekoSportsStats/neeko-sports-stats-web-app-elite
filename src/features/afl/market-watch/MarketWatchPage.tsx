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
      const viewName = premium ? "v_rankings_master" : "v_rankings_free";
      const { data, error } = await supabase.from(viewName).select("*").limit(limit);

      if (error) throw error;

      const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => ({
        snapshot_id: 'rankings-cache',
        player_id: r.player_id,
        player_name: r.player_name,
        team: r.team,
        position: r.position,
        price: r.price ?? 0,
        breakeven: Math.round(r.projection_final ?? 0),
        projection: r.projection ?? 0,
        ceiling: r.ceiling ?? 0,
        floor_val: r.floor ?? 0,
        risk_pct: (100 - (r.consistency ?? 0)),
        price_edge_pts: (r.projection ?? 0) - (r.projection_final ?? 0),
        expected_price_change: (r.price_change ?? 0) * 3,
        projected_price: (r.price ?? 0) + (r.price_change ?? 0),
        projected_price_r1: (r.price ?? 0) + (r.price_change ?? 0),
        projected_price_r2: (r.price ?? 0) + ((r.price_change ?? 0) * 2),
        projected_price_r3: (r.price ?? 0) + ((r.price_change ?? 0) * 3),
        breakout_score: null,
        breakout_flag: null,
        volatility_score: r.consistency ?? 0,
        volatility_level: null,
        category: null,
        action: r.ai_recommendation === 'BUY' ? 'BUY' : r.ai_recommendation === 'SELL' ? 'SELL' : 'HOLD',
        trade_score: r.best_value_score ?? r.value_score ?? 0,
        reasons: {},
        category_reason: r.recommendation_short ?? r.recommendation_why ?? null,
        last3_avg: r.avg_last_3 ?? null,
        estimated_price: r.price ?? null,
        value_score: r.best_value_score ?? r.value_score ?? 0,
        price_range_top: null,
        price_range_bottom: null,
        value_momentum: null,
        momentum_label: null,
        peak_price: null,
        peak_round: null,
        peak_status: null,
        season: 2026,
        round_number: 1,
        snapshot_updated_at: r.cached_at ?? r.ai_updated_at ?? new Date().toISOString(),
        neeko_rating: r.neeko_rating ?? null,
        consistency_score: r.consistency ?? null,
        projection_confidence: r.projection_confidence ?? null,
        avg_season: r.form_score ?? null,
        last5_avg: r.avg_last_5 ?? null,
        ai_recommendation: r.ai_recommendation ?? null,
        recommendation_short: r.recommendation_short ?? null,
        matchup_label: r.matchup_label ?? null,
        summary_short: r.summary_short ?? null,
        summary_long: r.summary_long ?? null,
        is_injured: r.is_injured ?? r.status === 'injured' ?? r.manual_status === 'injured' ?? false,
        is_bye: r.is_bye ?? r.status === 'bye' ?? r.manual_status === 'bye' ?? false,
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

  const classified = useMemo(() => classifyPlayers(players), [players]);

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  const topSell = classified.sells[0] || null;
  const topBuy = classified.buyBeforeRise[0] || null;
  const topValue = classified.upgrades[0] || null;

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
          <MarketWatchHero topSell={topSell} topBuy={topBuy} topValue={topValue} />
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
          <MarketWatchSignalStrip
            sellCount={classified.sells.length}
            buyCount={classified.buyBeforeRise.length}
            valueCount={classified.upgrades.length}
            upgradeCount={classified.upgrades.length}
          />
        </div>

        {!isPremium && <MarketWatchPaywall />}

        <PremiumGate>
          <div className="space-y-12 animate-in fade-in duration-500">
            <CategorySection
              title="🔴 Sell Risks"
              subtitle="Players at risk of price drops"
              players={classified.sells.slice(0, 12)}
              type="sell"
              onPlayerClick={setSelectedPlayer}
            />

            <CategorySection
              title="🟢 Buy Opportunities"
              subtitle="Strong upside potential"
              players={classified.buyBeforeRise.slice(0, 12)}
              type="buy"
              onPlayerClick={setSelectedPlayer}
            />

            <CategorySection
              title="🟡 Best Value"
              subtitle="Elite value at current prices"
              players={classified.upgrades.slice(0, 12)}
              type="value"
              onPlayerClick={setSelectedPlayer}
            />

            <CategorySection
              title="⚡ Premium Upgrades"
              subtitle="Highest projection gains"
              players={classified.upgrades.slice(0, 12)}
              type="upgrade"
              onPlayerClick={setSelectedPlayer}
            />
          </div>
        </PremiumGate>
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
  players: any[];
  type: "sell" | "buy" | "value" | "upgrade";
  onPlayerClick: (player: DerivedPlayer) => void;
}

function CategorySection({ title, subtitle, players, type, onPlayerClick }: CategorySectionProps) {
  if (players.length === 0) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
          {title}
        </h2>
        <p className="text-white/50">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map((player, i) => (
          <MarketWatchPremiumCard
            key={player.player_id}
            player={player}
            rank={i + 1}
            type={type}
            onPlayerClick={onPlayerClick}
          />
        ))}
      </div>
    </div>
  );
}
