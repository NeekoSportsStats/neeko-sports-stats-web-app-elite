import { ArrowRight, ListChecks, TrendingUp, Target } from "lucide-react";
import { MWPlayerRow } from "./types";
import { fmtPrice } from "./helpers";

interface Props {
  topSell: MWPlayerRow | null;
  topBuy: MWPlayerRow | null;
  topCow: MWPlayerRow | null;
  onScrollToSection: (section: string) => void;
}

export function TradePlanCard({ topSell, topBuy, topCow, onScrollToSection }: Props) {
  if (!topSell && !topBuy && !topCow) return null;

  const steps = [
    topSell && {
      num: 1,
      action: "SELL",
      player: topSell.player_name,
      team: topSell.team,
      price: topSell.price,
      reason: "Overpriced — sell before drop",
      color: "text-red-400",
      bg: "bg-red-400/[0.04]",
      border: "border-red-400/15",
      dot: "bg-red-400",
      section: "section-sell",
    },
    topBuy && {
      num: topSell ? 2 : 1,
      action: "BUY",
      player: topBuy.player_name,
      team: topBuy.team,
      price: topBuy.price,
      reason: "Undervalued — strong buy",
      color: "text-green-400",
      bg: "bg-green-400/[0.04]",
      border: "border-green-400/15",
      dot: "bg-green-400",
      pairedWith: topSell?.player_name ?? null,
      section: "section-buy",
    },
    topCow && {
      num: (topSell ? 1 : 0) + (topBuy ? 1 : 0) + 1,
      action: "BONUS",
      player: topCow.player_name,
      team: topCow.team,
      price: topCow.price,
      reason: "Cash cow — fastest price growth",
      color: "text-[#F5C84C]",
      bg: "bg-[#F5C84C]/[0.03]",
      border: "border-[#F5C84C]/12",
      dot: "bg-[#F5C84C]",
      section: "section-cash-cows",
    },
  ].filter(Boolean) as Array<{
    num: number;
    action: string;
    player: string;
    team: string;
    price: number;
    reason: string;
    color: string;
    bg: string;
    border: string;
    dot: string;
    pairedWith?: string | null;
    section: string;
  }>;

  return (
    <div className="mb-7 rounded-2xl border border-white/8 bg-white/[0.02]">
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F5C84C]/15 border border-[#F5C84C]/25">
            <ListChecks className="h-3.5 w-3.5 text-[#F5C84C]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Your Trade Plan This Week</p>
            <p className="text-[11px] text-white/30">Step-by-step moves based on the strongest signals</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {steps.map((step, idx) => (
          <div key={step.action} className="flex items-start gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${step.bg} ${step.border} ${step.color}`}>
                {step.num}
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px flex-1 mt-1 mb-0 min-h-[16px] bg-white/[0.06]" />
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded border ${step.bg} ${step.border} ${step.color}`}>
                  {step.action}
                </span>
                {step.action === "BONUS" && (
                  <span className="text-[9px] text-white/25 uppercase tracking-widest">Optional upgrade target</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white leading-tight">{step.player}</p>
                <span className="text-[11px] text-white/30">{step.team} · {fmtPrice(step.price)}</span>
              </div>
              <p className={`text-[11px] mt-0.5 ${step.color} opacity-70`}>{step.reason}</p>

              {step.pairedWith && (
                <div className="mt-1 flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-white/20" />
                  <span className="text-[10px] text-white/25">Best paired with selling: {step.pairedWith}</span>
                </div>
              )}

              <button
                onClick={() => onScrollToSection(step.section)}
                className={`mt-1.5 flex items-center gap-1 text-[10px] transition-colors ${
                  step.action === "SELL" ? "text-red-400/50 hover:text-red-400" :
                  step.action === "BUY" ? "text-green-400/50 hover:text-green-400" :
                  "text-[#F5C84C]/50 hover:text-[#F5C84C]"
                }`}
              >
                {step.action === "SELL" ? <TrendingUp className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                {step.action === "SELL" ? "See all sell signals" :
                 step.action === "BUY" ? "See all buy targets" :
                 "See all cash cows"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
