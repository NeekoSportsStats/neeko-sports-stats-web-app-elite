import { ArrowRight, Crown, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import { MWSummaryCard } from "./types";
import { fmtPrice, fmtNum, fmtPriceChange, priceChangeColor, confidenceLabel } from "./helpers";

interface Props {
  card: MWSummaryCard | null;
  loading: boolean;
  onCompare?: (outId: number, inId: number) => void;
  onUnlock: () => void;
  isPremium: boolean;
}

export function TopTradeOfWeek({ card, loading, onCompare, onUnlock, isPremium }: Props) {
  if (loading) {
    return (
      <div className="mb-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6 animate-pulse h-64" />
    );
  }

  if (!card) return null;

  const ptGain = card.metric_a;
  const priceGain = card.metric_b;
  const confidence = card.metric_c;
  const confLabel = confidence != null ? confidenceLabel(confidence) : null;

  return (
    <div
      className="mb-8 relative rounded-2xl overflow-hidden"
      style={{
        border: "1px solid rgba(74,222,128,0.3)",
        background: "linear-gradient(145deg, rgba(74,222,128,0.08) 0%, rgba(10,10,10,0) 60%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 15% 40%, rgba(74,222,128,0.10) 0%, transparent 65%)",
        }}
      />

      <div className="relative px-6 pt-6 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-green-400/70 bg-green-400/10 border border-green-400/20 px-2.5 py-1 rounded-full">
            This Week's Best Move
          </span>
          <span className="flex items-center gap-1 text-[10px] text-white/25">
            <Zap className="h-3 w-3 text-[#F5C84C]/50" />
            Powered by Neeko rankings + trade engine
          </span>
        </div>

        <p className="text-[12px] text-white/35 mb-5 mt-1">
          Best overall upgrade based on projection, value and trade score.
        </p>

        <div className="flex items-stretch gap-3 mb-5 flex-col sm:flex-row">
          <PlayerBlock name={card.label_a ?? "—"} price={card.out_price} side="out" />

          <div className="hidden sm:flex items-center justify-center px-3 shrink-0">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-400/15 border border-green-400/25 flex items-center justify-center">
                <ArrowRight className="h-4 w-4 text-green-400" />
              </div>
              <span className="text-[9px] text-white/20 uppercase tracking-wider">Trade</span>
            </div>
          </div>

          <div className="flex sm:hidden items-center justify-center py-1">
            <ArrowRight className="h-4 w-4 text-green-400/40 rotate-90" />
          </div>

          <PlayerBlock name={card.label_b ?? "—"} price={card.in_price} side="in" />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <ImpactBox
            label="Projected Pts Gain"
            value={ptGain != null ? `+${fmtNum(ptGain, 1)} pts` : "—"}
            valueClass="text-green-400"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            highlight
          />
          <ImpactBox
            label="Value Swing"
            value={priceGain != null ? fmtPriceChange(priceGain) : "—"}
            valueClass={priceGain != null ? priceChangeColor(priceGain) : "text-white/40"}
          />
          <ImpactBox
            label="Confidence"
            value={confLabel ?? (confidence != null ? `${fmtNum(confidence, 0)}%` : "—")}
            valueClass={
              (confidence ?? 0) >= 80 ? "text-green-400" :
              (confidence ?? 0) >= 60 ? "text-[#F5C84C]" :
              "text-orange-400"
            }
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isPremium && card.player_id_a != null && card.player_id_b != null && onCompare ? (
            <>
              <button
                onClick={() => onCompare(card.player_id_a!, card.player_id_b!)}
                className="flex items-center gap-2 bg-green-400 text-black font-extrabold text-sm px-6 py-3 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-green-400/25"
              >
                <ShieldCheck className="h-4 w-4" />
                Make this trade
              </button>
              <button
                onClick={() => onCompare(card.player_id_a!, card.player_id_b!)}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors px-4 py-3 rounded-xl border border-white/10 hover:border-white/20"
              >
                Open Trade Calculator
              </button>
            </>
          ) : (
            <button
              onClick={onUnlock}
              className="flex items-center gap-2 bg-[#F5C84C] text-black font-extrabold text-sm px-6 py-3 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-[#F5C84C]/20"
            >
              <Crown className="h-4 w-4" />
              Unlock your full trade plan
            </button>
          )}
          {card.description && (
            <p className="text-[11px] text-white/25 line-clamp-1 flex-1 min-w-0 italic">
              {card.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerBlock({ name, price, side }: { name: string; price: number | null; side: "in" | "out" }) {
  const isOut = side === "out";
  return (
    <div className={`flex-1 rounded-xl border px-4 py-4 ${
      isOut
        ? "border-red-400/25 bg-red-400/[0.04]"
        : "border-green-400/35 bg-green-400/[0.07]"
    }`}>
      <p className={`text-[9px] font-extrabold uppercase tracking-[0.18em] mb-2 ${isOut ? "text-red-400/70" : "text-green-400/70"}`}>
        {isOut ? "Sell" : "Buy"}
      </p>
      <p className="text-base font-bold text-white truncate leading-tight">{name}</p>
      {price != null && (
        <p className="text-[12px] text-white/40 mt-1">{fmtPrice(price)}</p>
      )}
    </div>
  );
}

function ImpactBox({ label, value, valueClass, icon, highlight }: {
  label: string;
  value: string;
  valueClass: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${
      highlight ? "border-green-400/25 bg-green-400/[0.05]" : "border-white/[0.07] bg-white/[0.025]"
    }`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className={highlight ? "text-green-400/60" : "text-white/20"}>{icon}</span>}
        <p className="text-[9px] text-white/30 uppercase tracking-wider leading-none">{label}</p>
      </div>
      <p className={`text-lg font-extrabold tabular-nums leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}
