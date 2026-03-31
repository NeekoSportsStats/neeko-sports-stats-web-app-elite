import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow, MWSummary, MWStatus } from "./types";
import { MarketWatchHeroTrade } from "./MarketWatchHeroTrade";
import { MarketWatchPreview } from "./MarketWatchPreview";
import { MarketWatchPaywall } from "./MarketWatchPaywall";
import { MarketWatchPremium } from "./MarketWatchPremium";
import { ProjectedMoversSection } from "./ProjectedMoversSection";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { classifyPlayers, buildBestTrades } from "./engine";
import { PremiumGate } from "@/components/PremiumGate";

export default function MarketWatchPage() {
  const { isPremium, loading: authLoading } = useAuth();
  const isPremiumRef = useRef(isPremium);

  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [summary, setSummary] = useState<MWSummary | null>(null);
  const [status, setStatus] = useState<MWStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (premium: boolean) => {
    setDataLoading(true);
    try {
      if (premium) {
        const [playersRes, summaryRes, statusRes] = await Promise.all([
          supabase.from("v_mw_premium").select("*").limit(600),
          supabase.from("v_mw_summary").select("*").maybeSingle(),
          supabase.from("v_mw_status").select("*").maybeSingle(),
        ]);

        if (playersRes.error) {
          console.error("Market Watch data error:", playersRes.error);
          setPlayers([]);
        } else {
          setPlayers((playersRes.data ?? []) as MWPlayerRow[]);
        }

        if (summaryRes.error) {
          console.error("Market Watch summary error:", summaryRes.error);
        } else if (summaryRes.data) {
          setSummary(summaryRes.data as MWSummary);
        }

        if (statusRes.error) {
          console.error("Market Watch status error:", statusRes.error);
        } else if (statusRes.data) {
          setStatus(statusRes.data as MWStatus);
        }
      } else {
        const FREE_CAT_LIMIT = 20;
        const categories: Array<{ cat: string; order: string; asc: boolean }> = [
          { cat: "sell_before_drop", order: "expected_price_change", asc: true },
          { cat: "buy_before_rise",  order: "expected_price_change", asc: false },
          { cat: "upgrade_target",   order: "value_score",           asc: false },
          { cat: "cash_cow",         order: "expected_price_change", asc: false },
          { cat: "fade_trap",        order: "trade_score",           asc: false },
        ];
        const [catResults, summaryRes, statusRes] = await Promise.all([
          Promise.all(
            categories.map(({ cat, order, asc }) =>
              supabase
                .from("v_mw_premium")
                .select("*")
                .eq("category", cat)
                .order(order, { ascending: asc })
                .limit(FREE_CAT_LIMIT)
            )
          ),
          supabase.from("v_mw_summary").select("*").maybeSingle(),
          supabase.from("v_mw_status").select("*").maybeSingle(),
        ]);

        const combined = catResults.flatMap(r => {
          if (r.error) {
            console.error("Market Watch category error:", r.error);
            return [];
          }
          return (r.data ?? []) as MWPlayerRow[];
        });
        setPlayers(combined);

        if (summaryRes.error) {
          console.error("Market Watch summary error:", summaryRes.error);
        } else if (summaryRes.data) {
          setSummary(summaryRes.data as MWSummary);
        }

        if (statusRes.error) {
          console.error("Market Watch status error:", statusRes.error);
        } else if (statusRes.data) {
          setStatus(statusRes.data as MWStatus);
        }
      }
    } catch (error) {
      console.error("Market Watch fetch error:", error);
      setPlayers([]);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    track("market_watch_refresh_click");
    fetchData(isPremium);
    setLastUpdated(new Date());
  }, [fetchData, isPremium]);

  useEffect(() => { track("market_watch_view"); }, []);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);
  useEffect(() => {
    if (authLoading) return;
    fetchData(isPremium);
  }, [authLoading, isPremium, fetchData]);

  const classified = classifyPlayers(players);
  console.log("Market Watch - Players count:", players.length);
  console.log("Market Watch - Classified:", {
    sells: classified.sells.length,
    upgrades: classified.upgrades.length,
    cashCows: classified.cashCows.length,
    buyBeforeRise: classified.buyBeforeRise.length,
    traps: classified.traps.length,
  });

  const allTrades = buildBestTrades(
    classified.sells,
    classified.upgrades,
    classified.cashCows,
    classified.buyBeforeRise
  );
  console.log("Market Watch - Best trades count:", allTrades.length);

  const heroTrade = allTrades[0] ?? null;
  if (heroTrade) {
    console.log("Market Watch - Hero trade:", heroTrade.out.player_name, "→", heroTrade.in.player_name);
  }

  if (dataLoading && players.length === 0) {
    return <MarketWatchSkeleton />;
  }

  const hasData = players.length > 0;
  const updatedAt = status?.last_updated_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

  if (!hasData && !dataLoading) {
    return (
      <div className="min-h-screen bg-[#0A0F1A] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="text-6xl">📊</div>
            <h2 className="text-2xl font-bold text-white">No Market Data Available</h2>
            <p className="text-white/60 text-center max-w-md">
              Market Watch data is currently unavailable. Please check back later or contact support if this persists.
            </p>
            <button
              onClick={handleRefresh}
              className="mt-4 px-6 py-3 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1A] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">

        <div className="flex items-center justify-between border-b border-white/5 pb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              Weekly Trade Engine
            </h1>
            <p className="text-white/50">
              AI-powered trade signals updated weekly
            </p>
          </div>

          <div className="flex items-center gap-4">
            {relativeTime && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-white/40">
                <Clock className="w-4 h-4" />
                <span>Updated {relativeTime}</span>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={dataLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg hover:bg-white/[0.05] hover:border-white/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              This Week's Signals
            </h2>
            <p className="text-white/40">
              Top opportunities across all categories
            </p>
          </div>
          <MarketWatchPreview
            sells={classified.sells}
            buys={classified.buyBeforeRise}
            value={classified.upgrades}
          />
        </div>

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

        <div className="pt-8 border-t border-white/10">
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-3">
              How It Works
            </h3>
            <div className="space-y-2 text-sm text-white/60">
              <p>
                Our AI analyzes projection data, price movements, and value metrics to identify the best trades each week.
              </p>
              <p>
                All signals are based on live fantasy prices and updated weekly after price changes.
              </p>
              <p className="text-xs text-white/40 mt-4">
                Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : "Loading..."}
              </p>
            </div>
          </div>
        </div>
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
