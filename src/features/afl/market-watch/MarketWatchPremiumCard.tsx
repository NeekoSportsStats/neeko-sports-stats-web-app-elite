import { useState } from "react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface PremiumCardProps {
  player: DerivedPlayer;
  rank: number;
  type: "sell" | "buy" | "value" | "upgrade";
  onPlayerClick?: (player: DerivedPlayer) => void;
}

function getWhy(player: any): string {
  if (player.summary_short && player.summary_short.length > 20) {
    const text = player.summary_short;
    const lower = text.toLowerCase();
    if (lower.includes('buy') || lower.includes('sell') || lower.includes('hold') ||
        lower.includes('bye round') || lower.includes('player_id') ||
        lower.includes('value_score')) {
      // Fall through to fallback
    } else {
      return text.trim();
    }
  }

  const value = player.value_score ?? 0;
  const projection = player.projection ?? 0;
  const priceChange = player.expected_price_change ?? 0;
  const consistency = player.consistency_score ?? 50;

  if (value >= 6) return "Strong value based on projection vs price";
  if (value <= -4) return "Overpriced relative to expected output";
  if (projection >= 100) return "High ceiling projection this week";
  if (priceChange > 20000) return "Breakout projection spike";
  if (priceChange < -20000) return "Price drop incoming";
  if (consistency < 35) return "High volatility risk detected";

  return "Model-driven signal based on current data";
}

export function MarketWatchPremiumCard({ player, rank, type, onPlayerClick }: PremiumCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const priceChange = player.expected_price_change ?? 0;
  const valueScore = player.value_score ?? 0;

  const reason = getWhyItMatters(player, type);

  const config = {
    sell: {
      border: "border-red-500/10 hover:border-red-500/30",
      glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]",
      rankBg: "bg-red-500/10 text-red-400",
      tagBg: "bg-red-500/10 text-red-400",
    },
    buy: {
      border: "border-green-500/10 hover:border-green-500/30",
      glow: "hover:shadow-[0_0_20px_rgba(34,197,94,0.1)]",
      rankBg: "bg-green-500/10 text-green-400",
      tagBg: "bg-green-500/10 text-green-400",
    },
    value: {
      border: "border-[#F5C84C]/10 hover:border-[#F5C84C]/30",
      glow: "hover:shadow-[0_0_20px_rgba(245,200,76,0.1)]",
      rankBg: "bg-[#F5C84C]/10 text-[#F5C84C]",
      tagBg: "bg-[#F5C84C]/10 text-[#F5C84C]",
    },
    upgrade: {
      border: "border-purple-500/10 hover:border-purple-500/30",
      glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]",
      rankBg: "bg-purple-500/10 text-purple-400",
      tagBg: "bg-purple-500/10 text-purple-400",
    },
  }[type];

  return (
    <div
      className={`
        bg-gradient-to-br from-white/[0.02] to-white/[0.01]
        border ${config.border} ${config.glow}
        rounded-xl p-4
        transition-all duration-300
        hover:translate-y-[-4px]
        hover:bg-white/[0.03]
        cursor-pointer
        group
        relative
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPlayerClick?.(player)}
    >
      {isHovered && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-xl p-4 flex flex-col justify-end z-10 animate-fadeIn">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
            AI Insight
          </p>
          <p className="text-sm text-gray-200 leading-snug">
            {getWhy(player)}
          </p>
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="text-lg font-bold text-white mb-1 truncate group-hover:text-white transition-colors">
            {player.player_name}
          </h3>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span className="font-medium">{player.position}</span>
            <span className="text-white/30">•</span>
            <span className="truncate">{player.team}</span>
          </div>
        </div>
        <div className={`${config.rankBg} px-3 py-1 rounded-lg flex-shrink-0`}>
          <span className="text-sm font-bold">#{rank}</span>
        </div>
      </div>

      {reason && (
        <div className={`${config.tagBg} px-3 py-1.5 rounded-lg mb-3`}>
          <span className="text-xs font-medium">{reason}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-white/40 mb-0.5">Price</div>
          <div className="text-base font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-0.5">Projection</div>
          <div className="text-base font-bold text-white">
            {player.projection?.toFixed(0) ?? "—"} pts
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-white/10 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/50">Change</span>
          <span className={priceChange >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
            {priceChange >= 0 ? "+" : ""}{fmtPrice(Math.round(priceChange))}
          </span>
        </div>
        {valueScore !== 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Value</span>
            <span className={valueScore > 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
              {valueScore > 0 ? "+" : ""}{valueScore.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function getWhyItMatters(player: DerivedPlayer, type: string): string {
  const value = player.value_score ?? 0;
  const priceChange = player.expected_price_change ?? 0;
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;

  if (type === "sell") {
    if (value < -5) return "Overpriced by model";
    if (priceChange < -20000) return "Price drop incoming";
    return "Risk signal detected";
  }

  if (type === "buy") {
    if (priceChange > 20000) return "Breakout projection spike";
    if (value > 6) return "Undervalued vs role";
    return "Buy opportunity";
  }

  if (type === "value") {
    if (value > 8) return "Elite value at price";
    if (value > 5) return "Strong value pick";
    return "Value opportunity";
  }

  if (type === "upgrade") {
    if (projection > breakeven + 15) return "Huge upside potential";
    if (projection > breakeven + 10) return "Premium upgrade target";
    return "Strong upgrade option";
  }

  return "";
}
