import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TrendingUp, RefreshCw, Crown, ChevronDown, ArrowRight, CircleAlert as AlertCircle, Zap, Target, ArrowUpRight, ArrowDownRight, DollarSign, TrendingDown, ShieldAlert, ChartBar as BarChart3, Scale, ArrowUp, ChevronsUpDown, Lock, Clock, Flame, Timer, CircleCheck as CheckCircle2, Layers, Info, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { MWPlayerRow, MWSummary, MWStatus, MWSortKey } from "./types";
import { PlayerTradeCard } from "./PlayerTradeCard";
import { MarketWatchSkeleton } from "./MarketWatchSkeleton";
import { MarketWatchSort } from "./MarketWatchSort";
import { UpgradeModal } from "./UpgradeModal";
import { fmtPriceChange, fmtPrice } from "./helpers";
import { classifyPlayers, buildBestTrades, DerivedPlayer, BestTrade } from "./engine";
import { ProjectedMoversSection } from "./ProjectedMoversSection";

const SECTION_LIMIT = 8;
const FREE_SECTION_VISIBLE = 3;

// ─── Trade deduplication key ───────────────────────────────────────────────────

function tradeKey(t: BestTrade): string {
  return `${t.out.player_id}_${t.in.player_id}`;
}

// ─── Global used-trades cascade ────────────────────────────────────────────────

interface TradeCascade {
  yourMove: BestTrade | null;
  bestTrade: BestTrade | null;
  bestCash: BestTrade | null;
  bestUpgrade: BestTrade | null;
  remaining: BestTrade[];
}

function buildTradeCascade(allTrades: BestTrade[]): TradeCascade {
  const used = new Set<string>();

  function pickNext(predicate?: (t: BestTrade) => boolean): BestTrade | null {
    for (const t of allTrades) {
      const k = tradeKey(t);
      if (used.has(k)) continue;
      if (predicate && !predicate(t)) continue;
      used.add(k);
      return t;
    }
    return null;
  }

  const yourMove = pickNext();
  const bestTrade = pickNext();
  const bestCash = pickNext(t => t.trade_type === "CASH_GENERATION");
  const bestUpgrade = pickNext(t => t.trade_type === "AGGRESSIVE_UPGRADE");
  const remaining = allTrades.filter(t => !used.has(tradeKey(t)));

  return { yourMove, bestTrade, bestCash, bestUpgrade, remaining };
}

// ─── Sort helper ───────────────────────────────────────────────────────────────

function sortDerived(arr: DerivedPlayer[], key: MWSortKey): DerivedPlayer[] {
  return [...arr].sort((a, b) => {
    if (key === "projection")   return (b.projection ?? 0) - (a.projection ?? 0);
    if (key === "price_change") return (b.expected_price_change ?? 0) - (a.expected_price_change ?? 0);
    if (key === "price_rise")   return (b.expected_price_change ?? 0) - (a.expected_price_change ?? 0);
    if (key === "price_fall")   return (a.expected_price_change ?? 0) - (b.expected_price_change ?? 0);
    if (key === "cash_gen")     return (b.price_edge_pts ?? 0) - (a.price_edge_pts ?? 0);
    if (key === "confidence")   return (b.projection_confidence ?? 0) - (a.projection_confidence ?? 0);
    return (b.value_score ?? b.trade_score ?? 0) - (a.value_score ?? a.trade_score ?? 0);
  });
}

// ─── Text helpers ──────────────────────────────────────────────────────────────

function weeklyStrategyLine(
  sells: DerivedPlayer[],
  upgrades: DerivedPlayer[],
  cashCows: DerivedPlayer[],
  buyBeforeRise: DerivedPlayer[],
): string {
  const sellN = sells.length;
  const upN = upgrades.length;
  const cowN = cashCows.length;
  const buyN = buyBeforeRise.length;

  if (sellN >= 5 && cowN >= 3) return "Cash-generation week — trim underperformers and bank for upcoming upgrades.";
  if (sellN >= 5 && upN >= 4)  return "Upgrade week — move your red flags into premium scorers before prices shift.";
  if (buyN >= 4 && cowN >= 3)  return "Price rise week — grab cheap risers before the market catches on.";
  if (upN >= 5)                 return "Strong upgrade cycle — premium scorers are well priced right now.";
  if (cowN >= 4)                return "Cash cow round — load up on cheap risers to build your war chest.";
  if (sellN >= 4)               return "Sell cycle underway — act on your underperformers before prices fall further.";
  return "Mixed signals this round — prioritise sells, then look at value buys.";
}

function nextStepLine(trade: BestTrade): string {
  if (trade.trade_type === "AGGRESSIVE_UPGRADE") {
    if (trade.projection_gain > 25) return "Locks in elite scoring lift — holds value all season";
    return "Points upgrade — your team scoring improves immediately";
  }
  if (trade.trade_type === "CASH_GENERATION") {
    if (trade.cash_generated > 300000) return "Builds double-upgrade bank — two moves available next round";
    return "Frees budget for a premium move in the next 1–2 rounds";
  }
  if (trade.in_type === "buy_before_rise") return "Ride the price rise — sell higher after 2–3 rounds of growth";
  return "Removes your main downside risk while keeping scoring floor stable";
}

function heroWhyItWorks(trade: BestTrade): string {
  if (trade.trade_type === "AGGRESSIVE_UPGRADE") {
    if (trade.projection_gain > 30) return `Turns a declining scorer into an elite weekly performer — ${trade.projection_gain.toFixed(0)} extra pts per round`;
    if (trade.projection_gain > 15) return `Lifts your scoring floor materially — ${trade.in.player_name} consistently outscores ${trade.out.player_name}`;
    return `Scoring upgrade at a fair entry price — ${trade.in.player_name} projects ahead this week`;
  }
  if (trade.trade_type === "CASH_GENERATION") {
    const cashStr = fmtPrice(Math.abs(trade.cash_generated));
    return `Converts a falling asset into ${cashStr} in freed budget — ${trade.out.player_name}'s price is moving against you`;
  }
  if (trade.in_type === "buy_before_rise") {
    return `Buys ${trade.in.player_name} before the price rise lands — every round you wait costs more`;
  }
  return `Neutral trade that removes downside risk from ${trade.out.player_name} while preserving scoring floor`;
}

function enablesLine(trade: BestTrade): string {
  if (trade.cash_generated > 400000) return "Builds major upgrade bank — two moves available next round";
  if (trade.cash_generated > 200000) return "Unlocks upgrade to premium scorer next round";
  if (trade.cash_generated > 100000) return "Builds cash buffer — opens mid-tier upgrade window";
  if (trade.projection_gain > 25)    return "Locks in elite scoring lift — holds long-term value";
  if (trade.projection_gain > 10)    return "Points upgrade move — team scoring improves immediately";
  if (trade.trade_type === "CASH_GENERATION")  return "Builds cash for double upgrade in coming rounds";
  if (trade.in_type === "buy_before_rise")      return "Rides price rise — sell higher after a few rounds";
  return "Maintains flexibility — stay neutral while others overpay";
}

function whyThisTradeMatters(trade: BestTrade): string[] {
  const bullets: string[] = [];

  const priceDropStr = fmtPrice(Math.abs(trade.out.expected_price_change ?? 0));
  const cashStr = fmtPrice(Math.abs(trade.cash_generated));

  if ((trade.out.expected_price_change ?? 0) < -20000) {
    bullets.push(`You're losing ~${priceDropStr} if you hold — the price is already moving down`);
  } else if ((trade.out.expected_price_change ?? 0) < 0) {
    bullets.push(`${trade.out.player_name} is overpriced at current value — sell before the market reprices`);
  }

  if (trade.cash_generated > 300000) {
    bullets.push(`This trade unlocks a double upgrade next round — ${cashStr} in freed budget`);
  } else if (trade.cash_generated > 150000) {
    bullets.push(`Banking ${cashStr} opens a mid-tier upgrade window next round`);
  } else if (trade.cash_generated > 50000) {
    bullets.push(`Frees up ${cashStr} while upgrading your scoring floor`);
  }

  if (trade.projection_gain > 20) {
    bullets.push(`+${trade.projection_gain.toFixed(0)} pts/rd gain — that's a 23-round compounding advantage`);
  } else if (trade.projection_gain > 10) {
    bullets.push(`Solid scoring lift — ${trade.in.player_name} projects ahead every round from here`);
  }

  if (trade.in_type === "buy_before_rise") {
    bullets.push(`Price movement already started — every round you wait costs more to buy in`);
  }

  if ((trade.in.expected_price_change ?? 0) > 20000) {
    const riseStr = fmtPrice(trade.in.expected_price_change ?? 0);
    bullets.push(`${trade.in.player_name} expected to rise ${riseStr} — your entry now beats next round's price`);
  }

  while (bullets.length < 2) {
    if (trade.trade_type === "CASH_GENERATION" && bullets.length < 2) {
      bullets.push(`${trade.out.player_name}'s price is under sustained downward pressure — act before it accelerates`);
    } else if (bullets.length < 2) {
      bullets.push(`${trade.in.player_name} is better value at this price than ${trade.out.player_name} — straightforward swap`);
    }
  }

  return bullets.slice(0, 3);
}

function miniInsightLine(player: DerivedPlayer): string {
  const raw = player.projection_confidence ?? 0;
  const conf = raw <= 1 ? raw * 100 : raw;
  const expChange = player.expected_price_change ?? 0;
  const score = player.trade_score ?? player.value_score ?? 0;

  if (conf >= 70 && expChange > 15000) return "Breakout risk rising";
  if (conf >= 70) return "Scoring trend improving";
  if (expChange > 20000) return "Price momentum building";
  if (expChange < -20000) return "Sell window closing fast";
  if (score >= 350) return "Elite signal this round";
  if (score >= 250) return "Strong signal — act this week";
  if (conf < 40) return "Monitor — some volatility";
  return "Steady move — low risk";
}

function confidenceLabelProps(player: DerivedPlayer): { label: string; cls: string } {
  const raw = player.projection_confidence ?? 0;
  const conf = raw <= 1 ? raw * 100 : raw;
  if (conf >= 70) return { label: "HIGH", cls: "text-green-400 border-green-400/22 bg-green-400/[0.08]" };
  if (conf >= 45) return { label: "MED", cls: "text-amber-300 border-amber-400/22 bg-amber-400/[0.07]" };
  return { label: "LOW", cls: "text-red-400/70 border-red-400/18 bg-red-400/[0.06]" };
}

function confidenceExplanation(trade: BestTrade): string {
  const conf = trade.in.projection_confidence ?? 0;
  if (conf >= 0.7) return `${trade.in.player_name} has scored above breakeven in ${Math.round(conf * 10)}/10 recent games — very reliable.`;
  if (conf >= 0.5) return `${trade.in.player_name} is consistent but has ceiling variance — expect the average to hold.`;
  return `Lower confidence — ${trade.in.player_name} has some volatility. Size accordingly.`;
}

function strategyTypeTag(trade: BestTrade): { label: string; cls: string } {
  if (trade.trade_type === "CASH_GENERATION") return { label: "CASH BUILD", cls: "text-[#F5C84C]/70 border-[#F5C84C]/20 bg-[#F5C84C]/[0.06]" };
  if (trade.trade_type === "AGGRESSIVE_UPGRADE") return { label: "AGGRESSIVE", cls: "text-sky-300/70 border-sky-400/20 bg-sky-400/[0.06]" };
  return { label: "SAFE", cls: "text-green-300/70 border-green-400/20 bg-green-400/[0.06]" };
}

// ─── Score label helper ────────────────────────────────────────────────────────

function scoreLabel(score: number): { label: string; cls: string } {
  if (score >= 350) return { label: "ELITE",  cls: "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25" };
  if (score >= 250) return { label: "STRONG", cls: "text-sky-300 bg-sky-400/10 border-sky-400/25" };
  if (score >= 150) return { label: "SOLID",  cls: "text-green-400 bg-green-400/10 border-green-400/25" };
  return { label: "FAIR", cls: "text-white/40 bg-white/[0.04] border-white/10" };
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketWatchPage() {
  const { isPremium, loading: authLoading } = useAuth();
  const isPremiumRef = useRef(isPremium);

  const [players, setPlayers] = useState<MWPlayerRow[]>([]);
  const [summary, setSummary] = useState<MWSummary | null>(null);
  const [status, setStatus] = useState<MWStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<MWSortKey>("value_score");
  const [showMoreBuys, setShowMoreBuys] = useState(false);
  const [showMoreUpgrades, setShowMoreUpgrades] = useState(false);
  const [showMoreCows, setShowMoreCows] = useState(false);
  const [showMoreTraps, setShowMoreTraps] = useState(false);

  const fetchData = useCallback(async (premium: boolean) => {
    setDataLoading(true);
    try {
      if (premium) {
        const [playersRes, summaryRes, statusRes] = await Promise.all([
          supabase.from("v_mw_premium").select("*").limit(600),
          supabase.from("v_mw_summary").select("*").maybeSingle(),
          supabase.from("v_mw_status").select("*").maybeSingle(),
        ]);
        setPlayers((playersRes.data ?? []) as MWPlayerRow[]);
        if (summaryRes.data) setSummary(summaryRes.data as MWSummary);
        if (statusRes.data) setStatus(statusRes.data as MWStatus);
      } else {
        // Fetch each category separately so no category is starved by a global limit.
        // Premium users see all data; free users see up to 20 per category (shown 3, rest locked).
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
        const combined = catResults.flatMap(r => (r.data ?? []) as MWPlayerRow[]);
        setPlayers(combined);
        if (summaryRes.data) setSummary(summaryRes.data as MWSummary);
        if (statusRes.data) setStatus(statusRes.data as MWStatus);
      }
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
    fetchData(isPremiumRef.current).then(() => setLastUpdated(new Date()));
  }, [authLoading, fetchData]);

  useEffect(() => {
    function onPricesApplied() {
      console.log("[MarketWatch] neeko:prices-applied received — refetching");
      fetchData(isPremiumRef.current).then(() => setLastUpdated(new Date()));
    }
    window.addEventListener("neeko:prices-applied", onPricesApplied);
    return () => window.removeEventListener("neeko:prices-applied", onPricesApplied);
  }, [fetchData]);

  const { buyBeforeRise, cashCows, upgrades, sells, traps } = useMemo(
    () => classifyPlayers(players),
    [players]
  );

  const sortedBuys     = useMemo(() => sortDerived(buyBeforeRise, sortKey), [buyBeforeRise, sortKey]);
  const sortedUpgrades = useMemo(() => sortDerived(upgrades, sortKey),      [upgrades, sortKey]);
  const sortedCows     = useMemo(() => sortDerived(cashCows, sortKey),      [cashCows, sortKey]);
  const allBestTrades  = useMemo(
    () => buildBestTrades(sells, upgrades, cashCows, sortedBuys),
    [sells, upgrades, cashCows, sortedBuys]
  );

  const cascade = useMemo(() => buildTradeCascade(allBestTrades), [allBestTrades]);

  const isInactive = status != null && !status.is_active;
  const ready = !authLoading && !dataLoading;

  if (!ready) return <MarketWatchSkeleton />;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20">
                <TrendingUp className="h-3.5 w-3.5 text-[#F5C84C]" />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">Market Watch</h1>
            </div>
            <p className="text-[12px] text-white/35 ml-9.5">
              Know who to trade before prices move.
            </p>
            <p className="text-[10px] text-white/18 ml-9.5 mt-0.5">
              Signals ranked by value, price movement, and projected scoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UrgencyBadge lastUpdated={lastUpdated} />
            {lastUpdated && (
              <p className="text-[10px] text-white/20">
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/55 transition-colors px-2.5 py-1.5 rounded-lg border border-white/8 hover:border-white/15"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>

        {isInactive && (
          <div className="mb-5 rounded-xl px-4 py-3 flex items-start gap-3 border border-white/8 bg-white/[0.02]">
            <AlertCircle className="h-3.5 w-3.5 text-white/25 shrink-0 mt-0.5" />
            <p className="text-[11px] text-white/40">Price signals update after each round completes. Showing last available data.</p>
          </div>
        )}

        {!isPremium ? (
          <FreeUserView
            sells={sells}
            buyBeforeRise={sortedBuys}
            cashCows={sortedCows}
            upgrades={sortedUpgrades}
            traps={traps}
            cascade={cascade}
            summary={summary}
            lastUpdated={lastUpdated}
            onUnlock={() => setShowUpgrade(true)}
          />
        ) : players.length === 0 ? (
          <EmptySection
            message="No trade signals this round — hold strategy"
            subtext="Signals update after each round completes. Check back once match data is processed."
          />
        ) : (
          <PremiumView
            sells={sells}
            buyBeforeRise={sortedBuys}
            cashCows={sortedCows}
            upgrades={sortedUpgrades}
            traps={traps}
            cascade={cascade}
            summary={summary}
            sortKey={sortKey}
            showMoreBuys={showMoreBuys}
            showMoreUpgrades={showMoreUpgrades}
            showMoreCows={showMoreCows}
            showMoreTraps={showMoreTraps}
            onSortChange={setSortKey}
            onToggleBuys={() => setShowMoreBuys(e => !e)}
            onToggleUpgrades={() => setShowMoreUpgrades(e => !e)}
            onToggleCows={() => setShowMoreCows(e => !e)}
            onToggleTraps={() => setShowMoreTraps(e => !e)}
          />
        )}

        <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <ProjectedMoversSection
            isPremium={isPremium}
            onShowUpgrade={() => setShowUpgrade(true)}
          />
        </div>

        <p className="mt-12 text-center text-[10px] text-white/12 leading-relaxed max-w-lg mx-auto">
          Market Watch signals are generated from AI projections and AFL Fantasy pricing data.
          For informational purposes only — always use your own judgement when trading.
        </p>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

// ─── Urgency Badge ─────────────────────────────────────────────────────────────

function UrgencyBadge({ lastUpdated }: { lastUpdated: Date | null }) {
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!lastUpdated) return;
    const updateHours = () => {
      const nextUpdate = new Date(lastUpdated);
      nextUpdate.setHours(nextUpdate.getHours() + 24);
      const diff = (nextUpdate.getTime() - Date.now()) / (1000 * 60 * 60);
      setHoursLeft(Math.max(0, diff));
    };
    updateHours();
    const id = setInterval(updateHours, 60 * 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (hoursLeft === null) return null;

  if (hoursLeft <= 6) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-orange-400/30 bg-orange-400/[0.08] text-[9px] font-bold uppercase tracking-wide text-orange-300/90">
        <Flame className="h-2.5 w-2.5 shrink-0" />
        Prices updating soon — act now
      </div>
    );
  }

  if (hoursLeft <= 24) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-400/20 bg-amber-400/[0.05] text-[9px] font-bold uppercase tracking-wide text-amber-300/60">
        <Timer className="h-2.5 w-2.5 shrink-0" />
        Price movement incoming
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/8 bg-white/[0.02] text-[9px] font-bold uppercase tracking-wide text-white/25">
      <Clock className="h-2.5 w-2.5 shrink-0" />
      Prices live
    </div>
  );
}

// ─── Your Move This Week ───────────────────────────────────────────────────────

function YourMoveThisWeek({
  trade,
  onUnlock,
  isPremium,
  lastUpdated,
}: {
  trade: BestTrade;
  onUnlock: () => void;
  isPremium: boolean;
  lastUpdated: Date | null;
}) {
  const cashPositive = trade.cash_generated >= 0;
  const nextStep = nextStepLine(trade);

  const hoursLeft = useMemo(() => {
    if (!lastUpdated) return null;
    const nextUpdate = new Date(lastUpdated);
    nextUpdate.setHours(nextUpdate.getHours() + 24);
    return Math.max(0, (nextUpdate.getTime() - Date.now()) / (1000 * 60 * 60));
  }, [lastUpdated]);

  const isUrgent = hoursLeft !== null && hoursLeft <= 6;

  return (
    <div
      className="mb-5 rounded-2xl overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, rgba(245,200,76,0.07) 0%, rgba(13,13,13,1) 60%)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="px-5 pt-5 pb-3.5 border-b border-white/[0.05]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] animate-pulse" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#F5C84C]/70">Your Move This Week</p>
          </div>
          {isUrgent && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-orange-400/70">
              <Flame className="h-2.5 w-2.5" />
              Act now
            </div>
          )}
        </div>
        <p className="text-[11px] text-white/25 mt-1 ml-3.5">One trade that changes everything this round</p>
      </div>

      <div className="px-5 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-4">
          <div>
            <p className="text-[8px] font-extrabold uppercase tracking-widest text-red-400/45 mb-1.5">Sell</p>
            <p className="text-[19px] sm:text-[21px] font-extrabold text-white leading-none tracking-tight">{trade.out.player_name}</p>
            <p className="text-[10px] text-white/28 mt-1">{trade.out.team} · {trade.out.position}</p>
            <p className="text-[11px] font-semibold text-red-400/70 mt-1 tabular-nums">{fmtPriceChange(trade.out.expected_price_change)}</p>
          </div>

          <div className="flex flex-col items-center gap-1">
            <ArrowRight className="h-4 w-4 text-white/10" />
            {cashPositive && (
              <span className="text-[9px] font-extrabold text-green-400/65 tabular-nums whitespace-nowrap">
                +{fmtPrice(trade.cash_generated)}
              </span>
            )}
          </div>

          <div className="text-right">
            <p className="text-[8px] font-extrabold uppercase tracking-widest text-sky-400/45 mb-1.5">Buy</p>
            <p className="text-[19px] sm:text-[21px] font-extrabold text-white leading-none tracking-tight">{trade.in.player_name}</p>
            <p className="text-[10px] text-white/28 mt-1">{trade.in.team} · {trade.in.position}</p>
            <p className="text-[11px] font-semibold text-sky-400/60 mt-1">{fmtPrice(trade.in.price)} entry</p>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.025] px-4 py-2.5">
          <p className="text-[8px] font-extrabold uppercase tracking-widest text-[#F5C84C]/35 mb-1">Next Step</p>
          <p className="text-[12px] text-white/55 leading-snug">{nextStep}</p>
        </div>

      </div>
    </div>
  );
}

// ─── Best Trade Hero ───────────────────────────────────────────────────────────

function BestTradeHero({ trade, isPremium }: { trade: BestTrade; isPremium: boolean }) {
  const cashPositive = trade.cash_generated >= 0;
  const projPositive = trade.projection_gain >= 0;

  const projLabel = projPositive
    ? `+${trade.projection_gain.toFixed(0)} pts/rd`
    : `${trade.projection_gain.toFixed(0)} pts/rd`;

  const summaryLine = [
    `Sell ${trade.out.player_name}`,
    cashPositive ? `bank ${fmtPrice(trade.cash_generated)}` : null,
    projPositive ? `gain ${projLabel}` : null,
  ].filter(Boolean).join(", ");

  const inBadge =
    trade.trade_type === "AGGRESSIVE_UPGRADE"
      ? { label: "SCORING UPGRADE", cls: "text-sky-300 border-sky-400/30 bg-sky-400/10" }
      : trade.trade_type === "CASH_GENERATION"
      ? { label: "CASH GENERATION", cls: "text-[#F5C84C] border-[#F5C84C]/30 bg-[#F5C84C]/10" }
      : trade.in_type === "buy_before_rise"
      ? { label: "EARLY VALUE", cls: "text-green-300 border-green-400/30 bg-green-400/10" }
      : { label: "BALANCED", cls: "text-white/50 border-white/20 bg-white/5" };

  const whyItWorks = heroWhyItWorks(trade);
  const enables = enablesLine(trade);
  const sl = scoreLabel(trade.score);
  const stTag = strategyTypeTag(trade);
  const confExplain = confidenceExplanation(trade);

  return (
    <div
      className="mb-6 rounded-2xl border border-[#F5C84C]/20 overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgba(245,200,76,0.055) 0%, rgba(10,10,10,0) 65%)" }}
    >
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.04]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#F5C84C]" />
            <h2 className="text-base font-extrabold text-white tracking-tight">Best Trade This Round</h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPremium && (
              <span className={`text-[7px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${stTag.cls}`}>
                {stTag.label}
              </span>
            )}
            <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${sl.cls}`}>
              {sl.label}
            </span>
          </div>
        </div>
        <p className="text-[13px] font-semibold text-white/65 mb-1">{summaryLine}</p>

        <div className="mt-3 rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#F5C84C]/55 mt-0.5 shrink-0 w-28">Why it works</span>
            <p className="text-[11px] text-white/50 leading-snug">{whyItWorks}</p>
          </div>
          <div className="border-t border-white/[0.03] pt-2 flex items-start gap-2">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-400/45 mt-0.5 shrink-0 w-28">What it enables</span>
            <p className="text-[11px] text-white/40 leading-snug">{enables}</p>
          </div>
          {isPremium && (
            <div className="border-t border-white/[0.03] pt-2 flex items-start gap-2">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-green-400/40 mt-0.5 shrink-0 w-28">Confidence</span>
              <p className="text-[11px] text-white/35 leading-snug">{confExplain}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
          <div className="rounded-xl border border-red-400/18 bg-red-400/[0.03] p-4 flex flex-col gap-3">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-red-400/55 mb-1.5">Trade Out</p>
              <p className="font-extrabold text-lg text-white leading-tight">{trade.out.player_name}</p>
              <p className="text-[11px] text-white/30 mt-0.5">{trade.out.team} · {trade.out.position}</p>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <div>
                <p className="text-[9px] text-white/22 mb-0.5">Current price</p>
                <p className="text-sm font-bold text-white/50">{fmtPrice(trade.out.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/22 mb-0.5">Expected drop</p>
                <p className="text-base font-extrabold text-red-400">{fmtPriceChange(trade.out.expected_price_change)}</p>
              </div>
            </div>
            <div className="rounded-lg bg-red-400/[0.05] border border-red-400/12 px-2.5 py-1.5">
              <p className="text-[10px] text-red-300/55">Proj {trade.out.projection?.toFixed(0)} pts · BE {trade.out.breakeven?.toFixed(0)}</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 py-2 px-1">
            <ArrowRight className="h-5 w-5 text-white/12" />
            <div className="text-center space-y-1.5">
              <div className={`rounded-lg px-3 py-1.5 ${cashPositive ? "bg-green-400/[0.08] border border-green-400/18" : "bg-white/[0.02] border border-white/6"}`}>
                <p className={`text-sm font-extrabold tabular-nums ${cashPositive ? "text-green-400" : "text-white/30"}`}>
                  {cashPositive ? `+${fmtPrice(trade.cash_generated)}` : `-${fmtPrice(Math.abs(trade.cash_generated))}`}
                </p>
                <p className="text-[9px] text-white/22 mt-0.5">cash delta</p>
              </div>
              <div className={`rounded-lg px-3 py-1.5 ${projPositive ? "bg-sky-400/[0.08] border border-sky-400/18" : "bg-white/[0.02] border border-white/6"}`}>
                <p className={`text-sm font-extrabold tabular-nums ${projPositive ? "text-sky-300" : "text-white/30"}`}>
                  {projLabel}
                </p>
                <p className="text-[9px] text-white/22 mt-0.5">proj gain</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-sky-400/18 bg-sky-400/[0.025] p-4 flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-sky-400/55">Trade In</p>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${inBadge.cls}`}>
                  {inBadge.label}
                </span>
              </div>
              <p className="font-extrabold text-lg text-white leading-tight">{trade.in.player_name}</p>
              <p className="text-[11px] text-white/30 mt-0.5">{trade.in.team} · {trade.in.position}</p>
            </div>
            <div className="flex items-end justify-between mt-auto">
              <div>
                <p className="text-[9px] text-white/22 mb-0.5">Entry price</p>
                <p className="text-sm font-bold text-white/50">{fmtPrice(trade.in.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/22 mb-0.5">Expected rise</p>
                <p className={`text-base font-extrabold ${(trade.in.expected_price_change ?? 0) >= 0 ? "text-green-400" : "text-white/28"}`}>
                  {fmtPriceChange(trade.in.expected_price_change)}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-sky-400/[0.05] border border-sky-400/12 px-2.5 py-1.5">
              <p className="text-[10px] text-sky-300/45">Proj {trade.in.projection?.toFixed(0)} pts · BE {trade.in.breakeven?.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Why This Trade Matters ────────────────────────────────────────────────────

function WhyThisTradeMatters({ trade }: { trade: BestTrade }) {
  const bullets = whyThisTradeMatters(trade);

  return (
    <div className="mb-5 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Info className="h-3.5 w-3.5 text-[#F5C84C]/50 shrink-0" />
        <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-white/35">Why This Trade Matters</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-1 h-1 rounded-full bg-[#F5C84C]/35 shrink-0 mt-1.5" />
            <p className="text-[12px] text-white/50 leading-snug">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Free Player Card (enhanced) ───────────────────────────────────────────────

function FreePlayerCard({ player, isSell }: { player: DerivedPlayer; isSell?: boolean }) {
  const expChange = Number(player.expected_price_change ?? 0);
  const confProps = confidenceLabelProps(player);
  const insight = miniInsightLine(player);
  const sl = scoreLabel(player.trade_score ?? player.value_score ?? 0);
  const isLowConf = (player.projection_confidence ?? 0) < 0.45;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035] transition-colors px-4 py-3.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold text-white leading-tight truncate">{player.player_name}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{player.team} · {player.position}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[12px] font-bold text-white/50 tabular-nums">{fmtPrice(player.price)}</p>
          <p className={`text-[11px] font-semibold mt-0.5 tabular-nums ${expChange >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmtPriceChange(expChange)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {isSell && isLowConf ? (
          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wide text-orange-400/70 border-orange-400/20 bg-orange-400/[0.07]">
            Low Conf Sell
          </span>
        ) : (
          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wide ${sl.cls}`}>
            {sl.label}
          </span>
        )}
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${confProps.cls}`}>
          {confProps.label} CONF
        </span>
        <span className="text-[9px] text-white/25 italic">{insight}</span>
      </div>

      {player.projection != null && (
        <p className="text-[9px] text-white/18 mt-1.5 tabular-nums">
          Proj {player.projection.toFixed(0)} pts · BE {player.breakeven?.toFixed(0) ?? "—"}
        </p>
      )}
    </div>
  );
}

// ─── No Sells Empty Card (only shown when sells === 0) ─────────────────────────

function NoSellsCard() {
  return (
    <div className="rounded-xl border border-green-400/15 bg-green-400/[0.03] px-4 py-4 flex items-center gap-3">
      <ShieldCheck className="h-5 w-5 text-green-400/40 shrink-0" />
      <div>
        <p className="text-[12px] font-bold text-green-400/60 leading-tight">No urgent sells this round</p>
        <p className="text-[10px] text-white/22 mt-0.5">You're in a strong position — no forced trades</p>
      </div>
    </div>
  );
}

// ─── 3 Things Holding You Back ─────────────────────────────────────────────────

function ThreeThingsHoldingYouBack({
  sells,
  buyBeforeRise,
  upgrades,
}: {
  sells: DerivedPlayer[];
  buyBeforeRise: DerivedPlayer[];
  upgrades: DerivedPlayer[];
}) {
  const topSell = sells[0];
  const topBuy = buyBeforeRise[0];
  const topUpgrade = upgrades[0];

  const items = [
    {
      icon: <TrendingDown className="h-3.5 w-3.5 text-red-400/60 shrink-0" />,
      text: topSell
        ? `${topSell.player_name} is bleeding value — every round you hold costs you`
        : "You're holding players losing value every round",
      sub: "Act before the price drop accelerates",
      accent: "border-red-400/15 bg-red-400/[0.03]",
    },
    {
      icon: <ArrowUpRight className="h-3.5 w-3.5 text-green-400/60 shrink-0" />,
      text: topBuy
        ? `${topBuy.player_name} is rising — you're missing the early entry`
        : "You're missing early price rises happening this week",
      sub: "The window closes before most coaches notice",
      accent: "border-green-400/12 bg-green-400/[0.025]",
    },
    {
      icon: <Target className="h-3.5 w-3.5 text-sky-400/60 shrink-0" />,
      text: topUpgrade
        ? `${topUpgrade.player_name} is priced right now — without a plan, you'll overpay next round`
        : "Without a plan, you're overpaying for upgrades",
      sub: "Premium scorers at fair price are a narrow window",
      accent: "border-sky-400/12 bg-sky-400/[0.02]",
    },
  ];

  return (
    <div className="mb-5 rounded-2xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/30">What you don't see yet</p>
        <p className="text-[14px] font-extrabold text-white mt-0.5">3 Things Holding You Back</p>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {items.map((item, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-3.5 ${item.accent}`}>
            <div className="mt-0.5">{item.icon}</div>
            <div>
              <p className="text-[12px] font-semibold text-white/65 leading-snug">{item.text}</p>
              <p className="text-[10px] text-white/25 mt-0.5">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary Strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ sellCount, buyCount, upgradeCount, cowCount, trapCount }: {
  sellCount: number;
  buyCount: number;
  upgradeCount: number;
  cowCount: number;
  trapCount: number;
}) {
  const stats = [
    { label: "Sell Now",    value: sellCount,    icon: <ArrowDownRight className="h-3.5 w-3.5" />, cls: "text-red-400",    bg: "bg-red-400/[0.03] border-red-400/12" },
    { label: "Early Value", value: buyCount,     icon: <ArrowUpRight className="h-3.5 w-3.5" />,   cls: "text-green-400",  bg: "bg-green-400/[0.03] border-green-400/12" },
    { label: "Upgrades",    value: upgradeCount, icon: <TrendingUp className="h-3.5 w-3.5" />,     cls: "text-sky-400",    bg: "bg-sky-400/[0.03] border-sky-400/12" },
    { label: "Cash Cows",   value: cowCount,     icon: <DollarSign className="h-3.5 w-3.5" />,     cls: "text-[#F5C84C]",  bg: "bg-[#F5C84C]/[0.03] border-[#F5C84C]/12" },
    { label: "Traps",       value: trapCount,    icon: <ShieldAlert className="h-3.5 w-3.5" />,    cls: "text-orange-400", bg: "bg-orange-400/[0.03] border-orange-400/12" },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 mb-6">
      {stats.map(s => (
        <div key={s.label} className={`rounded-xl border px-2 py-3 text-center ${s.bg}`}>
          <div className={`flex items-center justify-center mb-1.5 ${s.cls} opacity-60`}>
            {s.icon}
          </div>
          <p className="text-xl font-extrabold text-white tabular-nums leading-none">{s.value}</p>
          <p className="text-[9px] text-white/22 mt-1.5 leading-tight">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Must Sell Strip ───────────────────────────────────────────────────────────

function MustSellStrip({ sells, isPremium }: { sells: DerivedPlayer[]; isPremium: boolean }) {
  const top = sells.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-red-400">Act Now — Sell Before Price Falls</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top.map(p => (
          <PlayerTradeCard key={p.player_id} row={p} isPremium={isPremium} compact />
        ))}
      </div>
    </div>
  );
}

// ─── Collapsible Section ───────────────────────────────────────────────────────

function CollapsibleSection({
  label, labelColor, dot, description, count, defaultOpen, children, id,
}: {
  label: string;
  labelColor: string;
  dot: string;
  description: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="mb-5" id={id}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 group"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
            <h2 className={`text-sm font-extrabold uppercase tracking-[0.12em] ${labelColor}`}>{label}</h2>
            <span className="text-[10px] text-white/18 font-mono">{count}</span>
          </div>
          <p className="text-[11px] text-white/22 mt-0.5 ml-3.5 text-left">{description}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/25 shrink-0 mt-1 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <div className={`transition-all duration-300 overflow-hidden ${open ? "max-h-[4000px] opacity-100 mt-4" : "max-h-0 opacity-0"}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Player Grid ───────────────────────────────────────────────────────────────

function PlayerGrid({ players, isPremium, showMore, limit }: {
  players: DerivedPlayer[];
  isPremium: boolean;
  showMore: boolean;
  limit?: number;
}) {
  const cap = limit ?? SECTION_LIMIT;
  const visible = showMore ? players : players.slice(0, cap);
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {visible.map((p, i) => (
        <PlayerTradeCard key={p.player_id} row={p} rank={i + 1} isPremium={isPremium} />
      ))}
    </div>
  );
}

// ─── Blur-Locked Cards ─────────────────────────────────────────────────────────

function BlurLockedGrid({
  players,
  onUnlock,
  sellCount,
  buyCount,
  upgradeCount,
  cowCount,
}: {
  players: DerivedPlayer[];
  onUnlock: () => void;
  sellCount?: number;
  buyCount?: number;
  upgradeCount?: number;
  cowCount?: number;
}) {
  if (players.length === 0) return null;

  const hiddenSells    = Math.max((sellCount ?? 1) - 1, 0);
  const hiddenBuys     = Math.max((buyCount ?? 1) - 1, 0);
  const hiddenUpgrades = Math.max((upgradeCount ?? 1) - 1, 0);
  const hiddenCows     = Math.max((cowCount ?? 1) - 1, 0);

  const chips = [
    hiddenSells > 0    && { label: `+${hiddenSells} sell signals hidden`,  cls: "text-red-400/60" },
    hiddenBuys > 0     && { label: `+${hiddenBuys} early value plays`,     cls: "text-green-400/60" },
    hiddenUpgrades > 0 && { label: `+${hiddenUpgrades} upgrade targets`,   cls: "text-sky-400/60" },
    hiddenCows > 0     && { label: `+${hiddenCows} cash cows`,             cls: "text-[#F5C84C]/55" },
  ].filter(Boolean) as { label: string; cls: string }[];

  return (
    <div className="relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pointer-events-none select-none">
        {players.slice(0, 3).map((p) => (
          <div key={p.player_id} className="blur-sm opacity-20">
            <PlayerTradeCard row={p} isPremium={false} />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-[#0a0a0a]/97 via-[#0a0a0a]/75 to-transparent rounded-xl px-4 text-center">
        <Lock className="h-3.5 w-3.5 text-white/22 mb-2" />
        <p className="text-[14px] font-extrabold text-white/65 mb-2 leading-snug">
          Unlock the full trade plan
        </p>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 mb-4">
            {chips.map(c => (
              <span key={c.label} className={`text-[10px] font-semibold ${c.cls}`}>{c.label}</span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/28 mb-3 max-w-[200px] leading-snug">
          See every upgrade target, sell signal, and price-rise play ranked for this round
        </p>
        <button
          onClick={onUnlock}
          className="flex items-center gap-2 bg-[#F5C84C] text-black font-extrabold text-[11px] px-4 py-2 rounded-lg hover:brightness-110 transition-all"
        >
          <Crown size={10} />
          See every trade signal
        </button>
      </div>
    </div>
  );
}

// ─── Trade Type Config ─────────────────────────────────────────────────────────

type TradeTypeKey = "CASH_GENERATION" | "AGGRESSIVE_UPGRADE" | "BALANCED";

interface TradeTypeConfig {
  key: TradeTypeKey;
  label: string;
  subtext: string;
  icon: React.ReactNode;
  headerCls: string;
  accentCls: string;
  borderCls: string;
  bgCls: string;
  headlineBorderCls: string;
  headlineBgCls: string;
}

const TRADE_TYPE_CONFIGS: TradeTypeConfig[] = [
  {
    key: "CASH_GENERATION",
    label: "Best Cash Generation",
    subtext: "Free up budget — sell overpriced players, land cheap risers",
    icon: <DollarSign className="h-4 w-4" />,
    headerCls: "text-[#F5C84C]",
    accentCls: "text-[#F5C84C]",
    borderCls: "border-[#F5C84C]/15",
    bgCls: "bg-[#F5C84C]/[0.015]",
    headlineBorderCls: "border-[#F5C84C]/18",
    headlineBgCls: "bg-[#F5C84C]/[0.03]",
  },
  {
    key: "AGGRESSIVE_UPGRADE",
    label: "Best Upgrade Trades",
    subtext: "Lift your scoring — trade into premium scorers at fair entry",
    icon: <ArrowUp className="h-4 w-4" />,
    headerCls: "text-sky-400",
    accentCls: "text-sky-300",
    borderCls: "border-sky-400/15",
    bgCls: "bg-sky-400/[0.015]",
    headlineBorderCls: "border-sky-400/18",
    headlineBgCls: "bg-sky-400/[0.03]",
  },
  {
    key: "BALANCED",
    label: "Best Balanced Trades",
    subtext: "Cash-neutral moves — improve scoring while staying budget-safe",
    icon: <Scale className="h-4 w-4" />,
    headerCls: "text-white/45",
    accentCls: "text-white/35",
    borderCls: "border-white/[0.06]",
    bgCls: "bg-white/[0.01]",
    headlineBorderCls: "border-white/8",
    headlineBgCls: "bg-white/[0.02]",
  },
];

// ─── Headline Trade Card ───────────────────────────────────────────────────────

function HeadlineTrade({
  trade,
  config,
  isPremium,
  alternatives,
}: {
  trade: BestTrade;
  config: TradeTypeConfig;
  isPremium: boolean;
  alternatives?: BestTrade[];
}) {
  const cashPositive = trade.cash_generated >= 0;
  const projPositive = trade.projection_gain >= 0;
  const sl = scoreLabel(trade.score);
  const enables = enablesLine(trade);
  const stTag = strategyTypeTag(trade);
  const confExplain = confidenceExplanation(trade);

  const cashStr = cashPositive
    ? `+${fmtPrice(trade.cash_generated)}`
    : `-${fmtPrice(Math.abs(trade.cash_generated))}`;
  const projStr = projPositive
    ? `+${trade.projection_gain.toFixed(0)} pts/rd`
    : `${trade.projection_gain.toFixed(0)} pts/rd`;

  return (
    <div className={`rounded-xl border ${config.headlineBorderCls} ${config.headlineBgCls} p-4 mb-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${sl.cls}`}>
              {sl.label} TRADE
            </span>
            {isPremium && (
              <span className={`text-[7px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${stTag.cls}`}>
                {stTag.label}
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-red-400/45 mb-0.5">Sell</p>
              <p className="text-[15px] font-extrabold text-white leading-tight truncate">{trade.out.player_name}</p>
              <p className="text-[10px] text-white/28 mt-0.5">{trade.out.team} · {trade.out.position} · {fmtPrice(trade.out.price)}</p>
            </div>
            <div className="flex items-center justify-center pt-5 shrink-0 px-1">
              <ArrowRight className="h-4 w-4 text-white/12" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${config.accentCls}`}>Buy</p>
              <p className="text-[15px] font-extrabold text-white leading-tight truncate">{trade.in.player_name}</p>
              <p className="text-[10px] text-white/28 mt-0.5">{trade.in.team} · {trade.in.position} · {fmtPrice(trade.in.price)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <div className={`rounded-lg px-2.5 py-1.5 text-center min-w-[72px] ${cashPositive ? "bg-green-400/[0.07] border border-green-400/18" : "bg-white/[0.02] border border-white/6"}`}>
            <p className={`text-[13px] font-extrabold tabular-nums ${cashPositive ? "text-green-400" : "text-white/28"}`}>{cashStr}</p>
            <p className="text-[8px] text-white/20 mt-0.5">cash delta</p>
          </div>
          <div className={`rounded-lg px-2.5 py-1.5 text-center min-w-[72px] ${projPositive ? "bg-sky-400/[0.07] border border-sky-400/18" : "bg-white/[0.02] border border-white/6"}`}>
            <p className={`text-[13px] font-extrabold tabular-nums ${projPositive ? "text-sky-300" : "text-white/28"}`}>{projStr}</p>
            <p className="text-[8px] text-white/20 mt-0.5">proj gain</p>
          </div>
        </div>
      </div>

      {trade.why && (
        <p className="text-[11px] text-white/35 mt-3 leading-snug border-t border-white/[0.03] pt-2.5">{trade.why}</p>
      )}

      <div className="mt-2 flex items-start gap-1.5">
        <Zap className="h-2.5 w-2.5 text-[#F5C84C]/30 shrink-0 mt-0.5" />
        <p className="text-[10px] text-white/20 leading-snug">{enables}</p>
      </div>

      {isPremium && (
        <div className="mt-2 flex items-start gap-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 text-green-400/30 shrink-0 mt-0.5" />
          <p className="text-[10px] text-white/20 leading-snug">{confExplain}</p>
        </div>
      )}

      {isPremium && alternatives && alternatives.length > 0 && (
        <div className="mt-3 border-t border-white/[0.03] pt-3">
          <p className="text-[8px] font-extrabold uppercase tracking-wider text-white/25 mb-2 flex items-center gap-1">
            <Layers className="h-2.5 w-2.5" /> Alternative Options
          </p>
          <div className="flex flex-col gap-1.5">
            {alternatives.slice(0, 2).map((alt) => (
              <div key={tradeKey(alt)} className="flex items-center gap-2 text-[10px] text-white/30 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                <span className="truncate">{alt.out.player_name}</span>
                <ArrowRight className="h-2.5 w-2.5 text-white/15 shrink-0" />
                <span className="truncate">{alt.in.player_name}</span>
                <span className={`ml-auto shrink-0 tabular-nums ${alt.cash_generated >= 0 ? "text-green-400/55" : "text-red-400/45"}`}>
                  {alt.cash_generated >= 0 ? `+${fmtPrice(alt.cash_generated)}` : `-${fmtPrice(Math.abs(alt.cash_generated))}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact Trade Row ─────────────────────────────────────────────────────────

function TradeRow({ trade, rank }: { trade: BestTrade; rank: number }) {
  const cashPositive = trade.cash_generated >= 0;
  const projPositive = trade.projection_gain >= 0;
  const sl = scoreLabel(trade.score);

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[9px] font-bold text-white/15 w-3 shrink-0 tabular-nums text-right">{rank}</span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white/50 truncate">{trade.out.player_name}</p>
          <p className="text-[9px] text-red-400/35 mt-0.5 truncate">{trade.out.team} · {fmtPrice(trade.out.price)}</p>
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0 px-1">
          <ArrowRight className="h-2.5 w-2.5 text-white/10" />
          <span className={`text-[8px] font-semibold tabular-nums ${cashPositive ? "text-green-400/60" : "text-white/15"}`}>
            {cashPositive ? `+${fmtPrice(trade.cash_generated)}` : `-${fmtPrice(Math.abs(trade.cash_generated))}`}
          </span>
          {projPositive && (
            <span className="text-[8px] font-semibold text-sky-300/35 tabular-nums">+{trade.projection_gain.toFixed(0)}pts</span>
          )}
        </div>

        <div className="min-w-0 flex-1 text-right">
          <p className="text-[11px] font-semibold text-white truncate">{trade.in.player_name}</p>
          <p className="text-[9px] text-white/20 mt-0.5 truncate">{trade.in.team} · {fmtPrice(trade.in.price)}</p>
        </div>

        <div className="shrink-0 pl-2">
          <span className={`text-[7px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wide ${sl.cls}`}>
            {sl.label}
          </span>
        </div>
      </div>

      {trade.why && (
        <p className="text-[9px] text-white/15 mt-2 pl-5 leading-snug">{trade.why}</p>
      )}
    </div>
  );
}

// ─── Trade Type Group ──────────────────────────────────────────────────────────

function TradeTypeGroup({
  config,
  trades,
  isPremium,
}: {
  config: TradeTypeConfig;
  trades: BestTrade[];
  isPremium: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (trades.length === 0) return null;

  const headline = trades[0];
  const supporting = trades.slice(1, 3);
  const alternatives = trades.slice(1, 4);
  const extraTrades = trades.slice(3);
  const hasMore = extraTrades.length > 0;

  return (
    <div className={`rounded-2xl border ${config.borderCls} ${config.bgCls} p-4 mb-4`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={config.headerCls}>{config.icon}</span>
        <h3 className={`text-[12px] font-extrabold uppercase tracking-[0.1em] ${config.headerCls}`}>{config.label}</h3>
        <span className="text-[9px] text-white/15 font-mono">{trades.length}</span>
      </div>
      <p className="text-[10px] text-white/20 mb-4 ml-6">{config.subtext}</p>

      <HeadlineTrade
        trade={headline}
        config={config}
        isPremium={isPremium}
        alternatives={isPremium ? alternatives : undefined}
      />

      {supporting.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1.5">
          {supporting.map((t, i) => (
            <TradeRow key={tradeKey(t)} trade={t} rank={i + 2} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-2">
          {expanded && (
            <div className="flex flex-col gap-1.5 mb-2">
              {extraTrades.map((t, i) => (
                <TradeRow key={tradeKey(t)} trade={t} rank={i + 4} />
              ))}
            </div>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] text-white/20 hover:text-white/40 transition-colors py-2 rounded-lg border border-white/[0.03] hover:border-white/6 mt-1"
          >
            <ChevronsUpDown className="h-3 w-3" />
            {expanded ? "Show less" : `View ${extraTrades.length} more trade${extraTrades.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Top Trades Section ────────────────────────────────────────────────────────

type TradeFilterKey = "ALL" | "CASH_GENERATION" | "AGGRESSIVE_UPGRADE" | "BALANCED";

function TopTradesSection({ trades, isPremium }: { trades: BestTrade[]; isPremium: boolean }) {
  const [activeFilter, setActiveFilter] = useState<TradeFilterKey>("ALL");
  const [sortMode, setSortMode] = useState<"score" | "cash" | "pts">("score");

  if (trades.length === 0) return null;

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      if (sortMode === "cash") return b.cash_generated - a.cash_generated;
      if (sortMode === "pts")  return b.projection_gain - a.projection_gain;
      return b.score - a.score;
    });
  }, [trades, sortMode]);

  const filtered = activeFilter === "ALL" ? sorted : sorted.filter(t => t.trade_type === activeFilter);

  const cashTrades     = filtered.filter(t => t.trade_type === "CASH_GENERATION");
  const upgradeTrades  = filtered.filter(t => t.trade_type === "AGGRESSIVE_UPGRADE");
  const balancedTrades = filtered.filter(t => t.trade_type === "BALANCED");

  const filterBtns: { key: TradeFilterKey; label: string; activeCls: string }[] = [
    { key: "ALL",                label: "All",      activeCls: "text-white border-white/18 bg-white/[0.05]" },
    { key: "CASH_GENERATION",    label: "Cash",     activeCls: "text-[#F5C84C] border-[#F5C84C]/22 bg-[#F5C84C]/[0.05]" },
    { key: "AGGRESSIVE_UPGRADE", label: "Upgrade",  activeCls: "text-sky-300 border-sky-400/22 bg-sky-400/[0.05]" },
    { key: "BALANCED",           label: "Balanced", activeCls: "text-white/45 border-white/10 bg-white/[0.025]" },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-[#F5C84C]" />
            <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-white">Best Trades This Round</h2>
            <span className="text-[10px] text-white/18 font-mono">{trades.length}</span>
          </div>
          <p className="text-[11px] text-white/22 ml-6">Optimised moves based on price change + projected scoring</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.05] p-0.5">
            {filterBtns.map(btn => (
              <button
                key={btn.key}
                onClick={() => setActiveFilter(btn.key)}
                className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
                  activeFilter === btn.key
                    ? `border ${btn.activeCls}`
                    : "text-white/20 hover:text-white/38 border border-transparent"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.05] p-0.5">
            {(["score", "cash", "pts"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`text-[9px] font-bold px-2 py-1 rounded transition-colors capitalize ${
                  sortMode === mode
                    ? "text-white border border-white/12 bg-white/[0.04]"
                    : "text-white/20 hover:text-white/38 border border-transparent"
                }`}
              >
                {mode === "score" ? "Score" : mode === "cash" ? "Cash" : "Pts"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {cashTrades.length === 0 && upgradeTrades.length === 0 && balancedTrades.length === 0 ? (
        <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] py-8 text-center">
          <p className="text-[11px] text-white/22">No strong trades this week — hold strategy</p>
        </div>
      ) : (
        <>
          <TradeTypeGroup config={TRADE_TYPE_CONFIGS[0]} trades={cashTrades} isPremium={isPremium} />
          <TradeTypeGroup config={TRADE_TYPE_CONFIGS[1]} trades={upgradeTrades} isPremium={isPremium} />
          <TradeTypeGroup config={TRADE_TYPE_CONFIGS[2]} trades={balancedTrades} isPremium={isPremium} />
        </>
      )}
    </div>
  );
}

// ─── This Week's Plan ──────────────────────────────────────────────────────────

function ThisWeeksPlan({
  sells, upgrades, buyBeforeRise, cashCows,
}: {
  sells: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  buyBeforeRise: DerivedPlayer[];
  cashCows: DerivedPlayer[];
}) {
  const mustSell = sells.slice(0, 4);
  const upgradeTargets = upgrades.slice(0, 4);
  const priceRise = buyBeforeRise.slice(0, 4);
  const cashGen = cashCows.slice(0, 4);
  const strategyLine = weeklyStrategyLine(sells, upgrades, cashCows, buyBeforeRise);

  const PlanColumn = ({
    title, dot, labelColor, icon, players, emptyMsg, tradeLabel, tradeTagCls,
  }: {
    title: string;
    dot: string;
    labelColor: string;
    icon: React.ReactNode;
    players: DerivedPlayer[];
    emptyMsg: string;
    tradeLabel: string;
    tradeTagCls: string;
  }) => (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`${labelColor} opacity-55`}>{icon}</span>
        <span className={`text-[11px] font-extrabold uppercase tracking-[0.1em] ${labelColor}`}>{title}</span>
        <span className="text-[9px] text-white/18 font-mono">{players.length}</span>
      </div>
      {players.length === 0 ? (
        <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-5 text-center">
          <p className="text-[10px] text-white/18">{emptyMsg}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {players.map(p => {
            const expChange = Number(p.expected_price_change ?? 0);
            return (
              <div key={p.player_id} className="rounded-xl border border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.03] transition-colors px-3.5 py-2.5 cursor-default">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-white leading-tight truncate">{p.player_name}</p>
                    <p className="text-[9px] text-white/28 mt-0.5">{p.team} · {p.position}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-bold text-white/45">{fmtPrice(p.price)}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 tabular-nums ${expChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtPriceChange(expChange)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${tradeTagCls}`}>
                    {tradeLabel}
                  </span>
                  <span className="text-[9px] text-white/15">Proj {p.projection?.toFixed(0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="h-4 w-4 text-[#F5C84C]" />
        <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-white">This Week's Plan</h2>
      </div>
      <p className="text-[12px] text-white/35 mb-5 ml-6 leading-snug">{strategyLine}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PlanColumn
          title="Must Sell"
          dot="bg-red-400"
          labelColor="text-red-400"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          players={mustSell}
          emptyMsg="No urgent sell signals this round"
          tradeLabel="Sell Now"
          tradeTagCls="text-red-300 border-red-400/22 bg-red-400/7"
        />
        <PlanColumn
          title="Score Upgrades"
          dot="bg-sky-400"
          labelColor="text-sky-400"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          players={upgradeTargets}
          emptyMsg="No upgrades this round — hold strategy"
          tradeLabel="Upgrade"
          tradeTagCls="text-sky-300 border-sky-400/22 bg-sky-400/7"
        />
        <PlanColumn
          title="Early Value Plays"
          dot="bg-green-400"
          labelColor="text-green-400"
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          players={priceRise}
          emptyMsg="No early value targets this round"
          tradeLabel="Value Play"
          tradeTagCls="text-green-300 border-green-400/22 bg-green-400/7"
        />
        <PlanColumn
          title="Cash Generation"
          dot="bg-[#F5C84C]"
          labelColor="text-[#F5C84C]"
          icon={<DollarSign className="h-3.5 w-3.5" />}
          players={cashGen}
          emptyMsg="No cash cows this round — hold strategy"
          tradeLabel="Cash Cow"
          tradeTagCls="text-[#F5C84C] border-[#F5C84C]/22 bg-[#F5C84C]/7"
        />
      </div>
    </div>
  );
}

// ─── Final CTA Block (single CTA for free view) ────────────────────────────────

function FinalCTABlock({
  hiddenSells,
  hiddenBuys,
  hiddenUpgrades,
  hiddenCows,
  onUnlock,
  lastUpdated,
}: {
  hiddenSells: number;
  hiddenBuys: number;
  hiddenUpgrades: number;
  hiddenCows: number;
  onUnlock: () => void;
  lastUpdated: Date | null;
}) {
  const hoursLeft = useMemo(() => {
    if (!lastUpdated) return null;
    const nextUpdate = new Date(lastUpdated);
    nextUpdate.setHours(nextUpdate.getHours() + 24);
    return Math.max(0, (nextUpdate.getTime() - Date.now()) / (1000 * 60 * 60));
  }, [lastUpdated]);

  const isUrgent = hoursLeft !== null && hoursLeft <= 6;

  const hiddenLines = [
    hiddenSells > 0    && `${hiddenSells} sell signal${hiddenSells !== 1 ? "s" : ""} — act before price falls`,
    hiddenBuys > 0     && `${hiddenBuys} buy-before-rise — entry window closes soon`,
    hiddenUpgrades > 0 && `${hiddenUpgrades} upgrade target${hiddenUpgrades !== 1 ? "s" : ""} — premium scorers at fair price`,
    hiddenCows > 0     && `${hiddenCows} cash cow${hiddenCows !== 1 ? "s" : ""} — fastest price growth this round`,
  ].filter(Boolean) as string[];

  if (hiddenLines.length === 0) {
    hiddenLines.push(
      "Full sell signals before value drops",
      "Buy before rise — window is open now",
      "Upgrade targets — elite scorers at fair entry",
    );
  }

  return (
    <div
      className="mb-10 rounded-2xl border border-[#F5C84C]/20 overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgba(245,200,76,0.06) 0%, rgba(10,10,10,0) 70%)" }}
    >
      <div className="p-6 sm:p-8 text-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.08] mx-auto mb-4">
          <Crown size={18} className="text-[#F5C84C]" />
        </div>

        <p className="text-[9px] uppercase tracking-widest text-white/18 mb-1.5">Neeko Plus</p>
        <h3 className="text-[19px] font-extrabold text-white mb-1.5 leading-snug">
          See Every Trade Before Prices Move
        </h3>
        <p className="text-[12px] text-white/35 mb-5">
          Know exactly what top players will do before lockout
        </p>

        {/* Feature bullets */}
        <div className="flex flex-col items-start gap-2 mb-5 w-full max-w-xs mx-auto">
          {[
            "Full weekly trade strategy — every signal ranked",
            "AI-powered explanations for every move",
            "Confidence ratings so you size correctly",
          ].map(b => (
            <div key={b} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-[#F5C84C]/45 shrink-0" />
              <span className="text-[11px] text-white/40">{b}</span>
            </div>
          ))}
        </div>

        {/* Hidden signal lines */}
        <div className="mb-5 space-y-1 text-left max-w-xs mx-auto">
          {hiddenLines.map(line => (
            <div key={line} className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-[#F5C84C]/28 shrink-0" />
              <p className="text-[11px] text-white/30">{line}</p>
            </div>
          ))}
        </div>

        {isUrgent && (
          <div className="mb-4 flex items-center justify-center gap-1.5 text-[10px] font-bold text-orange-400/70">
            <Flame className="h-3 w-3" />
            Prices updating soon — act now before the window closes
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/neeko-plus"
            className="inline-flex items-center gap-2 bg-[#F5C84C] text-black font-extrabold text-[13px] px-7 py-3 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-[#F5C84C]/12"
          >
            <Crown size={13} />
            Unlock My Trade Plan
          </a>
          <button
            onClick={onUnlock}
            className="text-[11px] text-white/28 hover:text-white/50 transition-colors px-4 py-3 rounded-xl border border-white/6 hover:border-white/12"
          >
            Preview how it works
          </button>
        </div>

        <p className="mt-3 text-[10px] text-white/15">$10/month · Less than $2.50 per week · Cancel anytime</p>
      </div>
    </div>
  );
}

// ─── Free User View ────────────────────────────────────────────────────────────

function FreeUserView({
  sells, buyBeforeRise, cashCows, upgrades, traps, cascade, summary, lastUpdated, onUnlock,
}: {
  sells: DerivedPlayer[];
  buyBeforeRise: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  traps: DerivedPlayer[];
  cascade: TradeCascade;
  summary: MWSummary | null;
  lastUpdated: Date | null;
  onUnlock: () => void;
}) {
  const totalSell    = sells.length;
  const totalBuy     = buyBeforeRise.length;
  const totalUpgrade = upgrades.length;
  const totalCow     = cashCows.length;
  const totalTrap    = traps.length;

  const hiddenSells    = Math.max(totalSell - FREE_SECTION_VISIBLE, 0);
  const hiddenBuys     = Math.max(totalBuy - FREE_SECTION_VISIBLE, 0);
  const hiddenUpgrades = Math.max(totalUpgrade - FREE_SECTION_VISIBLE, 0);
  const hiddenCows     = Math.max(totalCow - FREE_SECTION_VISIBLE, 0);

  const hoursLeft = useMemo(() => {
    if (!lastUpdated) return null;
    const nextUpdate = new Date(lastUpdated);
    nextUpdate.setHours(nextUpdate.getHours() + 24);
    return Math.max(0, (nextUpdate.getTime() - Date.now()) / (1000 * 60 * 60));
  }, [lastUpdated]);

  const showUrgency = hoursLeft !== null && hoursLeft <= 24;
  const isHot = hoursLeft !== null && hoursLeft <= 6;

  const freeSections: {
    players: DerivedPlayer[];
    label: string;
    dot: string;
    labelColor: string;
    desc: string;
    isSell: boolean;
  }[] = [
    {
      players: sells,
      label: "Must Sell",
      dot: "bg-red-400",
      labelColor: "text-red-400",
      desc: "Sell before price falls — act this week",
      isSell: true,
    },
    {
      players: buyBeforeRise,
      label: "Early Value Plays",
      dot: "bg-green-400",
      labelColor: "text-green-400",
      desc: "Cheap players about to spike in price",
      isSell: false,
    },
    {
      players: upgrades,
      label: "Score Upgrade",
      dot: "bg-sky-400",
      labelColor: "text-sky-400",
      desc: "Scoring lift — worth the entry price",
      isSell: false,
    },
    {
      players: cashCows,
      label: "Cash Cow",
      dot: "bg-[#F5C84C]",
      labelColor: "text-[#F5C84C]",
      desc: "Budget pick building fast cash",
      isSell: false,
    },
    {
      players: traps,
      label: "Traps",
      dot: "bg-orange-400",
      labelColor: "text-orange-400",
      desc: "Premium players not worth the price",
      isSell: false,
    },
  ];

  const lockedPlayers = [
    ...sells.slice(FREE_SECTION_VISIBLE, FREE_SECTION_VISIBLE + 2),
    ...upgrades.slice(FREE_SECTION_VISIBLE, FREE_SECTION_VISIBLE + 1),
    ...buyBeforeRise.slice(FREE_SECTION_VISIBLE, FREE_SECTION_VISIBLE + 1),
    ...cashCows.slice(FREE_SECTION_VISIBLE, FREE_SECTION_VISIBLE + 1),
    ...traps.slice(FREE_SECTION_VISIBLE, FREE_SECTION_VISIBLE + 1),
  ];

  return (
    <div>
      {/* ── 1. Header trust line ───────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-white/22 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-white/20 inline-block" />
          Based on AFL Fantasy pricing + AI projections
        </p>
        {lastUpdated && (
          <p className="text-[10px] text-white/15">
            Updated {lastUpdated.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* ── 2. Urgency banner (if prices updating soon) ─────────────────────── */}
      {showUrgency && (
        <div className="mb-4 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-amber-400/18 bg-amber-400/[0.04]">
          {isHot
            ? <Flame className="h-3.5 w-3.5 text-orange-400/65 shrink-0" />
            : <Timer className="h-3.5 w-3.5 text-amber-400/55 shrink-0" />
          }
          <p className="text-[11px] font-semibold text-amber-300/65">
            Prices updating soon — trades will change after this round
          </p>
        </div>
      )}

      {/* ── 3. Summary strip ────────────────────────────────────────────────── */}
      <SummaryStrip
        sellCount={totalSell}
        buyCount={totalBuy}
        upgradeCount={totalUpgrade}
        cowCount={totalCow}
        trapCount={totalTrap}
      />

      {/* ── 4. Your Move (hero) ─────────────────────────────────────────────── */}
      {cascade.yourMove && (
        <YourMoveThisWeek
          trade={cascade.yourMove}
          onUnlock={onUnlock}
          isPremium={false}
          lastUpdated={lastUpdated}
        />
      )}

      {/* ── 5. Why This Trade Matters ───────────────────────────────────────── */}
      {cascade.yourMove && (
        <WhyThisTradeMatters trade={cascade.yourMove} />
      )}

      {/* ── 6. 3 Things Holding You Back ───────────────────────────────────── */}
      <ThreeThingsHoldingYouBack
        sells={sells}
        buyBeforeRise={buyBeforeRise}
        upgrades={upgrades}
      />

      {/* ── 7. This Week's Plan ─────────────────────────────────────────────── */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <DollarSign className="h-4 w-4 text-[#F5C84C]/50" />
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-white/65">This Week's Plan</h2>
        </div>
        <p className="text-[10px] text-white/22 ml-6">Top signals across 5 categories — unlock full depth with Premium</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {freeSections.map(({ players, label, dot, labelColor, desc, isSell }) => (
          <div key={label} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 pl-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <span className={`text-[11px] font-extrabold uppercase tracking-wider ${labelColor}`}>{label}</span>
            </div>
            <p className="text-[10px] text-white/20 pl-3.5 -mt-1 mb-0.5">{desc}</p>

            {isSell && sells.length === 0 ? (
              <NoSellsCard />
            ) : players.length === 0 ? (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-4 text-center">
                <p className="text-[11px] font-semibold text-white/22">No signal this week — hold</p>
                <p className="text-[10px] text-white/13 mt-0.5">No action needed in this category</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {players.slice(0, FREE_SECTION_VISIBLE).map(p => (
                  <FreePlayerCard key={p.player_id} player={p} isSell={isSell} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 8. Locked trades preview ────────────────────────────────────────── */}
      {lockedPlayers.length > 0 && (
        <div className="mb-6">
          <BlurLockedGrid
            players={lockedPlayers}
            onUnlock={onUnlock}
            sellCount={totalSell}
            buyCount={totalBuy}
            upgradeCount={totalUpgrade}
            cowCount={totalCow}
          />
        </div>
      )}

      {/* ── 9. Single final CTA ─────────────────────────────────────────────── */}
      <FinalCTABlock
        hiddenSells={hiddenSells}
        hiddenBuys={hiddenBuys}
        hiddenUpgrades={hiddenUpgrades}
        hiddenCows={hiddenCows}
        onUnlock={onUnlock}
        lastUpdated={lastUpdated}
      />
    </div>
  );
}

// ─── Category Why Block ────────────────────────────────────────────────────────

const CATEGORY_WHY: Record<string, { text: string; tipCls: string }> = {
  "upgrades": {
    text: "These players score more than they cost — trade in now before the market catches on and prices rise.",
    tipCls: "border-sky-400/12 bg-sky-400/[0.025]",
  },
  "buyBeforeRise": {
    text: "Each of these players is beating their breakeven — price rises are imminent. Every round you wait costs more to buy in.",
    tipCls: "border-green-400/12 bg-green-400/[0.025]",
  },
  "cashCows": {
    text: "Cheap players generating fast cash growth. Bank their value now to fund a future premium upgrade.",
    tipCls: "border-[#F5C84C]/12 bg-[#F5C84C]/[0.02]",
  },
  "traps": {
    text: "Premium-priced players whose scoring doesn't justify the entry cost. Avoid at current price — wait for a drop.",
    tipCls: "border-orange-400/12 bg-orange-400/[0.02]",
  },
  "sells": {
    text: "These players are below breakeven — their price is falling. If you own them, now is the window to sell.",
    tipCls: "border-red-400/12 bg-red-400/[0.02]",
  },
};

function CategoryWhyBlock({ id, count }: { id: string; count: number }) {
  const cfg = CATEGORY_WHY[id];
  if (!cfg || count === 0) return null;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 mb-4 ${cfg.tipCls}`}>
      <Info className="h-3 w-3 text-white/20 shrink-0 mt-0.5" />
      <p className="text-[10px] text-white/30 leading-relaxed">{cfg.text}</p>
    </div>
  );
}

// ─── Premium View ──────────────────────────────────────────────────────────────

function PremiumView({
  sells, buyBeforeRise, cashCows, upgrades, traps, cascade, summary, sortKey,
  showMoreBuys, showMoreUpgrades, showMoreCows, showMoreTraps,
  onSortChange, onToggleBuys, onToggleUpgrades, onToggleCows, onToggleTraps,
}: {
  sells: DerivedPlayer[];
  buyBeforeRise: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  traps: DerivedPlayer[];
  cascade: TradeCascade;
  summary: MWSummary | null;
  sortKey: MWSortKey;
  showMoreBuys: boolean;
  showMoreUpgrades: boolean;
  showMoreCows: boolean;
  showMoreTraps: boolean;
  onSortChange: (v: MWSortKey) => void;
  onToggleBuys: () => void;
  onToggleUpgrades: () => void;
  onToggleCows: () => void;
  onToggleTraps: () => void;
}) {
  return (
    <>
      {cascade.yourMove && (
        <YourMoveThisWeek trade={cascade.yourMove} onUnlock={() => {}} isPremium lastUpdated={null} />
      )}

      <SummaryStrip
        sellCount={sells.length}
        buyCount={buyBeforeRise.length}
        upgradeCount={upgrades.length}
        cowCount={cashCows.length}
        trapCount={traps.length}
      />

      {cascade.bestTrade && <BestTradeHero trade={cascade.bestTrade} isPremium />}

      <ThisWeeksPlan
        sells={sells}
        upgrades={upgrades}
        buyBeforeRise={buyBeforeRise}
        cashCows={cashCows}
      />

      <TopTradesSection trades={cascade.remaining} isPremium />

      <MustSellStrip sells={sells} isPremium />

      <div className="flex items-center justify-between gap-3 mb-4 pt-2 border-t border-white/[0.03]">
        <p className="text-[11px] text-white/22 font-semibold uppercase tracking-wider">Browse All Signals</p>
        <MarketWatchSort value={sortKey} onChange={onSortChange} />
      </div>

      {upgrades.length > 0 ? (
        <CollapsibleSection
          id="section-upgrades"
          label="Upgrade Targets"
          labelColor="text-sky-400"
          dot="bg-sky-400"
          description="Premium scorers worth paying for — held for points output, not price rise"
          count={upgrades.length}
          defaultOpen
        >
          <CategoryWhyBlock id="upgrades" count={upgrades.length} />
          <PlayerGrid players={upgrades} isPremium showMore={showMoreUpgrades} />
          {upgrades.length > SECTION_LIMIT && (
            <button onClick={onToggleUpgrades} className="mt-3 w-full text-[10px] text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1">
              <ChevronsUpDown className="h-3 w-3" />
              {showMoreUpgrades ? "Show less" : `+${upgrades.length - SECTION_LIMIT} more`}
            </button>
          )}
        </CollapsibleSection>
      ) : (
        <EmptySection
          message="No upgrade targets this round — hold strategy"
          subtext="No premium scorers at compelling value right now. Wait for pricing to shift."
        />
      )}

      {buyBeforeRise.length > 0 ? (
        <CollapsibleSection
          id="section-buy"
          label="Early Value Plays"
          labelColor="text-green-400"
          dot="bg-green-400"
          description="Cheap players about to spike in price — buy before the market moves"
          count={buyBeforeRise.length}
        >
          <CategoryWhyBlock id="buyBeforeRise" count={buyBeforeRise.length} />
          <PlayerGrid players={buyBeforeRise} isPremium showMore={showMoreBuys} />
          {buyBeforeRise.length > SECTION_LIMIT && (
            <button onClick={onToggleBuys} className="mt-3 w-full text-[10px] text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1">
              <ChevronsUpDown className="h-3 w-3" />
              {showMoreBuys ? "Show less" : `+${buyBeforeRise.length - SECTION_LIMIT} more`}
            </button>
          )}
        </CollapsibleSection>
      ) : (
        <EmptySection
          message="No early value plays this round — hold strategy"
          subtext="No confirmed upward price movers identified. Check Upgrade Targets for scoring buys."
        />
      )}

      {cashCows.length > 0 ? (
        <CollapsibleSection
          id="section-cash-cows"
          label="Cash Cows"
          labelColor="text-[#F5C84C]"
          dot="bg-[#F5C84C]"
          description="Cheap players beating breakeven — building your war chest for future upgrades"
          count={cashCows.length}
        >
          <CategoryWhyBlock id="cashCows" count={cashCows.length} />
          <PlayerGrid players={cashCows} isPremium showMore={showMoreCows} />
          {cashCows.length > SECTION_LIMIT && (
            <button onClick={onToggleCows} className="mt-3 w-full text-[10px] text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1">
              <ChevronsUpDown className="h-3 w-3" />
              {showMoreCows ? "Show less" : `+${cashCows.length - SECTION_LIMIT} more`}
            </button>
          )}
        </CollapsibleSection>
      ) : (
        <EmptySection
          message="No cash cows this round — hold strategy"
          subtext="No budget players generating strong price growth. Check Early Value Plays for cheaper entry options."
        />
      )}

      {traps.length > 0 && (
        <CollapsibleSection
          id="section-traps"
          label="Fades & Traps"
          labelColor="text-orange-400"
          dot="bg-orange-400"
          description="Overpriced at current value — do not trade in at this price"
          count={traps.length}
        >
          <CategoryWhyBlock id="traps" count={traps.length} />
          <PlayerGrid players={traps} isPremium showMore={showMoreTraps} />
          {traps.length > SECTION_LIMIT && (
            <button onClick={onToggleTraps} className="mt-3 w-full text-[10px] text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1">
              <ChevronsUpDown className="h-3 w-3" />
              {showMoreTraps ? "Show less" : `+${traps.length - SECTION_LIMIT} more`}
            </button>
          )}
        </CollapsibleSection>
      )}

      {sells.length > 3 && (
        <CollapsibleSection
          id="section-sell"
          label="All Sell Signals"
          labelColor="text-red-400"
          dot="bg-red-400"
          description="If you own them, act now — price is under sustained downward pressure"
          count={sells.length - 3}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sells.slice(3, 3 + SECTION_LIMIT).map((p, i) => (
              <PlayerTradeCard key={p.player_id} row={p} rank={i + 4} isPremium compact />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

// ─── Empty Section ─────────────────────────────────────────────────────────────

function EmptySection({ message, subtext }: { message: string; subtext: string }) {
  return (
    <div className="mb-6 rounded-xl border border-white/[0.03] bg-white/[0.008] px-5 py-5 text-center">
      <p className="text-[12px] font-semibold text-white/28 mb-1">{message}</p>
      <p className="text-[10px] text-white/15">{subtext}</p>
    </div>
  );
}

