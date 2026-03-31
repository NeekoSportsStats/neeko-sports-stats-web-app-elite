import { ArrowRight, TrendingUp, DollarSign, TriangleAlert as AlertTriangle, Loader } from "lucide-react";
import { MWSummaryCard } from "./types";
import { fmtPrice, fmtNum, fmtPriceChange } from "./helpers";

interface Props {
  cards: MWSummaryCard[];
  loading: boolean;
  onCompareTrade?: (playerIdA: number, playerIdB: number) => void;
}

export function MarketWatchSummaryCards({ cards, loading, onCompareTrade }: Props) {
  const bestTrade  = cards.find(c => c.card_type === "best_trade");
  const bestCow    = cards.find(c => c.card_type === "best_cow");
  const biggestTrap = cards.find(c => c.card_type === "biggest_trap");

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[0,1,2].map(i => (
          <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (!bestTrade && !bestCow && !biggestTrap) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      {bestTrade && (
        <HeroCard
          icon={<TrendingUp className="h-4 w-4 text-green-400" />}
          label="Best Trade This Week"
          accentClass="border-green-400/15 bg-green-400/[0.03]"
          dotClass="bg-green-400"
        >
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <PlayerPill name={bestTrade.label_a ?? "—"} price={bestTrade.out_price} side="out" />
            <ArrowRight className="h-3.5 w-3.5 text-white/30 shrink-0" />
            <PlayerPill name={bestTrade.label_b ?? "—"} price={bestTrade.in_price} side="in" />
          </div>
          <div className="flex items-center gap-4 mt-3">
            <Stat
              label="+Pts Gain"
              value={bestTrade.metric_a != null ? `+${fmtNum(bestTrade.metric_a, 1)}` : "—"}
              valueClass="text-green-400"
            />
            <Stat
              label="+Price Gain"
              value={bestTrade.metric_b != null ? fmtPriceChange(bestTrade.metric_b) : "—"}
              valueClass="text-green-300"
            />
            <Stat
              label="Confidence"
              value={bestTrade.metric_c != null ? `${fmtNum(bestTrade.metric_c, 0)}%` : "—"}
              valueClass="text-white/60"
            />
          </div>
          {bestTrade.player_id_a != null && bestTrade.player_id_b != null && onCompareTrade && (
            <button
              onClick={() => onCompareTrade(bestTrade.player_id_a!, bestTrade.player_id_b!)}
              className="mt-3 text-[11px] text-green-400 hover:text-green-300 transition-colors"
            >
              Compare Trade →
            </button>
          )}
        </HeroCard>
      )}

      {bestCow && (
        <HeroCard
          icon={<DollarSign className="h-4 w-4 text-[#F5C84C]" />}
          label="Best Cash Cow"
          accentClass="border-[#F5C84C]/15 bg-[#F5C84C]/[0.03]"
          dotClass="bg-[#F5C84C]"
        >
          <p className="text-base font-bold text-white mt-2 truncate">{bestCow.label_a ?? "—"}</p>
          <div className="flex items-center gap-4 mt-2">
            <Stat
              label="Expected Rise"
              value={bestCow.metric_a != null ? fmtPriceChange(bestCow.metric_a) : "—"}
              valueClass="text-[#F5C84C]"
            />
            <Stat
              label="Projection"
              value={fmtNum(bestCow.metric_b, 1)}
              valueClass="text-white/70"
            />
            <Stat
              label="Price"
              value={fmtPrice(bestCow.in_price)}
              valueClass="text-white/50"
            />
          </div>
        </HeroCard>
      )}

      {biggestTrap && (
        <HeroCard
          icon={<AlertTriangle className="h-4 w-4 text-orange-400" />}
          label="Biggest Trap"
          accentClass="border-orange-400/15 bg-orange-400/[0.03]"
          dotClass="bg-orange-400"
        >
          <p className="text-base font-bold text-white mt-2 truncate">{biggestTrap.label_a ?? "—"}</p>
          <div className="flex items-center gap-4 mt-2">
            <Stat
              label="Price Edge"
              value={biggestTrap.metric_a != null ? `${fmtNum(biggestTrap.metric_a, 1)} pts` : "—"}
              valueClass="text-red-400"
            />
            <Stat
              label="Risk"
              value={biggestTrap.metric_b != null ? `${fmtNum(biggestTrap.metric_b, 0)}%` : "—"}
              valueClass="text-orange-400"
            />
            <Stat
              label="Price"
              value={fmtPrice(biggestTrap.in_price)}
              valueClass="text-white/50"
            />
          </div>
          {biggestTrap.description && (
            <p className="mt-2 text-[11px] text-white/30 line-clamp-1">{biggestTrap.description}</p>
          )}
        </HeroCard>
      )}
    </div>
  );
}

function HeroCard({
  icon, label, accentClass, dotClass, children,
}: {
  icon: React.ReactNode;
  label: string;
  accentClass: string;
  dotClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accentClass}`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[10px] uppercase tracking-widest text-white/35 font-medium">{label}</span>
        {icon}
      </div>
      {children}
    </div>
  );
}

function PlayerPill({ name, price, side }: { name: string; price: number | null; side: "in" | "out" }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 border ${
      side === "out"
        ? "border-red-400/20 bg-red-400/5 text-red-300"
        : "border-green-400/20 bg-green-400/5 text-green-300"
    }`}>
      <span className="text-[10px] font-semibold uppercase opacity-60">{side === "out" ? "OUT" : "IN"}</span>
      <span className="text-xs font-semibold truncate max-w-[90px]">{name}</span>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9px] text-white/30 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${valueClass ?? "text-white"}`}>{value}</p>
    </div>
  );
}
