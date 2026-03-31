import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow } from "./types";
import { MarketWatchPreview } from "./MarketWatchPreview";
import { MarketWatchPaywall } from "./MarketWatchPaywall";
import { MarketWatchPremium } from "./MarketWatchPremium";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { classifyPlayers, buildBestTrades } from "./engine";
import { PremiumGate } from "@/components/PremiumGate";

export default function MarketWatchPage() {
  const { isPremium, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (premium: boolean) => {
    setLoading(true);
    try {
      const limit = premium ? 200 : 100;
      const { data, error } = await supabase
        .from("v_mw_premium")
        .select("*")
        .limit(limit);

      if (error) throw error;

      const cleaned = (data ?? []).filter((p: MWPlayerRow) => {
        return p.category !== null && p.category !== undefined;
      });

      const categoryCounts = cleaned.reduce((acc, p) => {
        const cat = p.category || 'none';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log("[MW DEBUG]", {
        total: data?.length ?? 0,
        afterFilter: cleaned.length,
        categories: categoryCounts,
      });

      setPlayers(cleaned);
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

  const classified = classifyPlayers(players);
  const allTrades = buildBestTrades(
    classified.sells,
    classified.upgrades,
    classified.cashCows,
    classified.buyBeforeRise
  );

  const updatedAt = players[0]?.snapshot_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">

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

        <MarketWatchPreview
          sells={classified.sells}
          buys={classified.buyBeforeRise}
          value={classified.upgrades}
        />

        {!isPremium && <MarketWatchPaywall />}

        <PremiumGate>
          <MarketWatchPremium
            sells={classified.sells}
            buys={classified.buyBeforeRise}
            upgrades={classified.upgrades}
            cashCows={classified.cashCows}
            traps={classified.traps}
            allTrades={allTrades}
          />
        </PremiumGate>
      </div>
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
