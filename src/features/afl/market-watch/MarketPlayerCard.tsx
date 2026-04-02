import { useState } from "react";
import { Lock, Flame } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import { MarketRow } from "./types";
import { fmtPrice, fmtNum, signalColor, momentumColor, riskColor, positionBadge, isSummaryAligned } from "./helpers";
import { track } from "@/lib/analytics";

function getWhy(player: any): string {
  if (player.summary_short && player.summary_short.length > 20) {
    const text = player.summary_short;
    const lower = text.toLowerCase();
    const hasJunk = lower.includes('buy') || lower.includes('sell') || lower.includes('hold') ||
        lower.includes('bye round') || lower.includes('player_id') ||
        lower.includes('value_score');
    if (!hasJunk && isSummaryAligned(text, player.category ?? player.action ?? '')) {
      return text.trim();
    }
  }

  const value = player.value_score ?? 0;
  const projection = player.projection_final ?? player.projection ?? 0;
  const priceChange = player.price_momentum ?? 0;
  const risk = player.risk_rating ?? 50;
  const cat = (player.category ?? player.action ?? '').toUpperCase();

  if (cat === 'BUY' || cat === 'TARGET') {
    if (value >= 6) return "Underpriced relative to projection — strong value";
    if (projection >= 100) return "High ceiling projection this week";
    if (priceChange > 20) return "Breakout projection spike — price rising";
    return "Value signal — buy window open";
  }
  if (cat === 'SELL' || cat === 'AVOID') {
    if (value <= -4) return "Overpriced relative to expected output";
    if (priceChange < -20) return "Price drop incoming — sell window open";
    if (risk > 65) return "High volatility — fade this week";
    return "Sell signal — value deteriorating";
  }

  if (value >= 6) return "Strong value based on projection vs price";
  if (value <= -4) return "Overpriced relative to expected output";
  if (projection >= 100) return "High ceiling projection this week";
  if (risk > 65) return "High volatility risk detected";

  return "Model-driven signal based on current data";
}

export function MarketPlayerCard({ row, locked, onUnlock, tab, rank, onPlayerClick }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const momentum = Number(row.price_momentum ?? 0);
  const momentumStr = momentum >= 0 ? `+${fmtNum(momentum, 1)}` : fmtNum(momentum, 1);
  const isBreakout = row.breakout_flag === true;
  const volLevel = row.volatility_level ?? null;
  const volColors: Record<string, string> = {
    HIGH:   "text-red-400 bg-red-400/10 border-red-400/20",
    MEDIUM: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    LOW:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  };

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 ${
        locked
          ? "border-white/5 bg-white/[0.02] opacity-60 blur-[2px] pointer-events-none select-none"
          : isBreakout
            ? "border-orange-400/20 bg-orange-400/[0.02] hover:bg-orange-400/[0.04] hover:border-orange-400/30 cursor-pointer hover:-translate-y-1 hover:shadow-xl"
            : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/12 cursor-pointer hover:-translate-y-1 hover:shadow-xl"
      }`}
      onMouseEnter={() => !locked && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !locked && onPlayerClick?.(row)}
    >
      {isHovered && !locked && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-end z-10 animate-fadeIn">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
            AI Insight
          </p>
          <p className="text-sm text-gray-200 leading-snug line-clamp-3">
            {getWhy(row)}
          </p>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-mono text-white/25 w-5 shrink-0">#{rank}</span>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate leading-tight">{row.player_name}</p>
              <p className="text-[11px] text-white/40 truncate mt-0.5">{row.team}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {row.position && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${positionBadge(row.position)}`}>
                {row.position}
              </span>
            )}
            {row.trade_signal && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${signalColor(row.trade_signal)}`}>
                {row.trade_signal}
              </span>
            )}
            {isBreakout && (
              <span
                className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border text-orange-400 bg-orange-400/10 border-orange-400/25 cursor-pointer"
                onClick={() => track("market_breakout_click", { player_name: row.player_name, breakout_score: row.breakout_score })}
              >
                <Flame className="h-2.5 w-2.5" />
                BREAKOUT
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCell label="Price" value={fmtPrice(row.price)} />
          <StatCell label="Breakeven" value={fmtNum(row.breakeven, 1)} />
          <StatCell
            label="Projection"
            value={fmtNum(row.projection_final, 1)}
            valueClass="text-[#F5C84C]"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <StatCell
            label="Price Edge"
            value={momentumStr + " pts"}
            valueClass={momentumColor(momentum)}
          />
          <StatCell
            label="Est. Ceiling"
            value={fmtNum(row.ceiling_estimate, 0)}
          />
          <StatCell
            label="Risk"
            value={fmtNum(row.risk_rating, 0) + "%"}
            valueClass={riskColor(row.risk_rating)}
          />
        </div>

        {(isBreakout || volLevel) && (
          <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center gap-2 flex-wrap">
            {isBreakout && row.breakout_score != null && (
              <div className="flex items-center gap-1 text-[10px] text-orange-400/70">
                <Flame className="h-3 w-3 text-orange-400" />
                <span>Breakout</span>
                <span className="font-bold text-orange-400">{fmtNum(row.breakout_score, 0)}</span>
              </div>
            )}
            {volLevel && (
              <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${volColors[volLevel]}`}>
                <span className="uppercase tracking-wide">Volatility</span>
                <span className="font-bold">{volLevel}</span>
              </div>
            )}
          </div>
        )}

        {tab === "buy" || tab === "sell" ? (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-white/30">Trade Score</span>
            <span className="text-sm font-bold tabular-nums text-white">
              {fmtNum(row.trade_score, 1)}
            </span>
          </div>
        ) : null}

        {row.recommendation_why && (
          <p className="mt-2.5 text-[11px] text-white/35 leading-snug line-clamp-2">
            {cleanAiText(row.recommendation_why)}
          </p>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.025] px-2.5 py-2 text-center">
      <p className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5 truncate">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

export function LockedMarketCard({ rank, onUnlock }: { rank: number; onUnlock?: () => void }) {
  return (
    <div className="rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.03] p-4 flex items-center justify-center gap-3 min-h-[120px]">
      <Lock className="h-4 w-4 text-[#F5C84C]/60 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-white/70">#{rank} — Neeko+ Only</p>
        <button
          onClick={onUnlock}
          className="text-[11px] text-[#F5C84C] hover:text-[#ffd95a] transition-colors mt-0.5"
        >
          Unlock full list
        </button>
      </div>
    </div>
  );
}
