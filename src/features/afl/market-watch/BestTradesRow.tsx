import { ArrowRight, ChevronRight } from "lucide-react";
import { MWBestTrade } from "./types";
import { fmtPrice, fmtNum, fmtPriceChange, confidenceBadge, positionBadge, confidenceLabel } from "./helpers";
import { track } from "@/lib/analytics";

interface Props {
  trades: MWBestTrade[];
  loading: boolean;
  onCompare: (trade: MWBestTrade) => void;
  isPremium: boolean;
  onShowUpgrade: () => void;
}

export function BestTradesRow({ trades, loading, onCompare, isPremium, onShowUpgrade }: Props) {
  if (loading) {
    return (
      <div className="mb-8">
        <SectionHeader />
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {[0,1,2,3].map(i => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 animate-pulse flex-shrink-0 w-[280px] h-[160px]" />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) return null;

  const visibleTrades = isPremium ? trades : trades.slice(0, 2);
  const lockedCount = isPremium ? 0 : Math.max(0, trades.length - 2);

  return (
    <div className="mb-10">
      <SectionHeader count={trades.length} />
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1">
        {visibleTrades.map((trade) => (
          <TradeCard
            key={trade.trade_id}
            trade={trade}
            onCompare={() => {
              track("market_watch_best_trade_click", {
                out_player: trade.out_player_name,
                in_player: trade.in_player_name,
              });
              onCompare(trade);
            }}
          />
        ))}
        {lockedCount > 0 && (
          <LockedTradeCard count={lockedCount} onUnlock={onShowUpgrade} />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count?: number }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white">Other Strong Trade Options</h2>
          {count != null && count > 0 && (
            <span className="text-[10px] text-white/25 bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">
              {count} combo{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/30 mt-0.5">
          Alternative upgrades if the top move doesn't fit your team
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-white/15 shrink-0 mt-0.5" />
    </div>
  );
}

function TradeCard({ trade, onCompare }: { trade: MWBestTrade; onCompare: () => void }) {
  const ptsGain = trade.projected_points_gain;
  const priceGain = trade.expected_price_gain;
  const riskChange = trade.risk_change;
  const confLabel = confidenceLabel(trade.confidence);

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/14 hover:-translate-y-0.5 transition-all duration-200 flex-shrink-0 w-[280px] p-4">
      <div className="flex items-start gap-2 mb-3">
        <PlayerPill
          name={trade.out_player_name}
          team={trade.out_team}
          position={trade.out_position}
          price={trade.out_price}
          side="out"
        />
        <div className="shrink-0 mt-2">
          <ArrowRight className="h-3.5 w-3.5 text-white/25" />
        </div>
        <PlayerPill
          name={trade.in_player_name}
          team={trade.in_team}
          position={trade.in_position}
          price={trade.in_price}
          side="in"
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <MetricCell
          label="Pts Gain"
          value={ptsGain >= 0 ? `+${fmtNum(ptsGain, 1)}` : fmtNum(ptsGain, 1)}
          valueClass={ptsGain >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCell
          label="Value"
          value={fmtPriceChange(priceGain)}
          valueClass={priceGain >= 0 ? "text-green-300" : "text-red-400"}
        />
        <MetricCell
          label="Risk"
          value={riskChange <= 0 ? `${fmtNum(riskChange, 0)}%` : `+${fmtNum(riskChange, 0)}%`}
          valueClass={riskChange <= 0 ? "text-green-400" : "text-orange-400"}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${confidenceBadge(trade.confidence)}`}>
          {confLabel} · {fmtNum(trade.confidence, 0)}%
        </span>
        <button
          onClick={onCompare}
          className="text-[11px] text-[#F5C84C] hover:text-[#ffd95a] transition-colors font-medium"
        >
          Compare →
        </button>
      </div>
    </div>
  );
}

function PlayerPill({
  name, team, position, price, side,
}: {
  name: string;
  team: string;
  position: string;
  price: number;
  side: "in" | "out";
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`text-[9px] font-bold uppercase px-1 py-0 rounded ${
          side === "out" ? "bg-red-400/15 text-red-400" : "bg-green-400/15 text-green-400"
        }`}>
          {side === "out" ? "OUT" : "IN"}
        </span>
        {position && (
          <span className={`text-[9px] font-semibold px-1 py-0 rounded border ${positionBadge(position)}`}>
            {position}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-white leading-tight truncate">{name}</p>
      <p className="text-[10px] text-white/35 truncate">{team} · {fmtPrice(price)}</p>
    </div>
  );
}

function MetricCell({
  label, value, valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
      <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function LockedTradeCard({ count, onUnlock }: { count: number; onUnlock: () => void }) {
  return (
    <div
      className="rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.03] flex-shrink-0 w-[200px] flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-[#F5C84C]/[0.06] transition-colors p-4"
      onClick={onUnlock}
    >
      <p className="text-sm font-bold text-white/60">+{count} more trades</p>
      <p className="text-[11px] text-[#F5C84C]">Unlock Neeko+</p>
    </div>
  );
}
