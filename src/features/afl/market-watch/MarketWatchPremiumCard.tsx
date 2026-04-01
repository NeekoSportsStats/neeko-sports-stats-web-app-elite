import { useState } from "react";
import { TrendingUp, TrendingDown, TriangleAlert as AlertTriangle, DollarSign, ChartBar as BarChart3 } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface PremiumCardProps {
  player: DerivedPlayer;
  rank: number;
  type: "sell" | "buy" | "value" | "upgrade";
  onPlayerClick?: (player: DerivedPlayer) => void;
}

export function MarketWatchPremiumCard({ player, rank, type, onPlayerClick }: PremiumCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const priceChange = player.expected_price_change ?? 0;
  const valueScore = player.value_score ?? 0;
  const delta = projection - breakeven;

  const config = {
    sell: {
      border: "border-red-500/20 hover:border-red-500/40",
      glow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.15)]",
      rankBg: "bg-red-500/15 text-red-400 border border-red-500/30",
      tagBg: "bg-red-500/10 text-red-400",
      icon: TrendingDown,
      iconColor: "text-red-400",
      gradient: "from-red-500/5 via-transparent to-transparent",
    },
    buy: {
      border: "border-green-500/20 hover:border-green-500/40",
      glow: "hover:shadow-[0_0_30px_rgba(34,197,94,0.15)]",
      rankBg: "bg-green-500/15 text-green-400 border border-green-500/30",
      tagBg: "bg-green-500/10 text-green-400",
      icon: TrendingUp,
      iconColor: "text-green-400",
      gradient: "from-green-500/5 via-transparent to-transparent",
    },
    value: {
      border: "border-[#F5C84C]/20 hover:border-[#F5C84C]/40",
      glow: "hover:shadow-[0_0_30px_rgba(245,200,76,0.15)]",
      rankBg: "bg-[#F5C84C]/15 text-[#F5C84C] border border-[#F5C84C]/30",
      tagBg: "bg-[#F5C84C]/10 text-[#F5C84C]",
      icon: DollarSign,
      iconColor: "text-[#F5C84C]",
      gradient: "from-[#F5C84C]/5 via-transparent to-transparent",
    },
    upgrade: {
      border: "border-blue-500/20 hover:border-blue-500/40",
      glow: "hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]",
      rankBg: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
      tagBg: "bg-blue-500/10 text-blue-400",
      icon: BarChart3,
      iconColor: "text-blue-400",
      gradient: "from-blue-500/5 via-transparent to-transparent",
    },
  }[type];

  const Icon = config.icon;

  const intelligentReason = getIntelligentReason(player, type);
  const hoverInsight = getHoverInsight(player, type);

  return (
    <div
      className={`
        relative
        bg-gradient-to-br ${config.gradient} from-5%
        bg-[#0A0A0A]
        border ${config.border}
        rounded-xl p-5
        transition-all duration-300
        hover:translate-y-[-6px]
        hover:bg-[#0D0D0D]
        ${config.glow}
        cursor-pointer
        group
        overflow-hidden
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPlayerClick?.(player)}
    >
      {/* Hover Overlay */}
      {isHovered && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm rounded-xl p-5 flex flex-col justify-end z-10 animate-fadeIn">
          <div className="flex items-start gap-2 mb-2">
            <Icon className={`w-4 h-4 ${config.iconColor} mt-0.5 flex-shrink-0`} />
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                AI Insight
              </p>
              <p className="text-sm text-gray-100 leading-relaxed">
                {hoverInsight}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Click for full analysis →
            </p>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="text-lg font-bold text-white mb-1.5 truncate group-hover:text-white transition-colors">
            {player.player_name}
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-white/70">{player.position}</span>
            <span className="text-white/20">•</span>
            <span className="truncate text-white/50">{player.team}</span>
          </div>
        </div>
        <div className={`${config.rankBg} px-3 py-1.5 rounded-lg flex-shrink-0 font-bold text-sm`}>
          #{rank}
        </div>
      </div>

      {/* Signal Badge */}
      {intelligentReason && (
        <div className={`${config.tagBg} px-3 py-2 rounded-lg mb-4 flex items-center gap-2`}>
          <Icon className={`w-3.5 h-3.5 ${config.iconColor} flex-shrink-0`} />
          <span className="text-xs font-semibold truncate">{intelligentReason}</span>
        </div>
      )}

      {/* Core Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Price</div>
          <div className="text-base font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Projection</div>
          <div className="text-base font-bold text-white">
            {projection.toFixed(0)} pts
          </div>
        </div>
      </div>

      {/* Signal Metrics */}
      <div className="pt-4 border-t border-white/10 space-y-2.5">
        {breakeven > 0 && (
          <MetricRow
            label="vs Breakeven"
            value={delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)}
            suffix="pts"
            color={delta > 0 ? "text-green-400" : delta < -5 ? "text-red-400" : "text-gray-400"}
          />
        )}

        {priceChange !== 0 && Math.abs(priceChange) >= 5000 && (
          <MetricRow
            label="Est. Change"
            value={priceChange >= 0 ? "+" : ""}
            value2={fmtPrice(Math.round(priceChange))}
            color={priceChange >= 0 ? "text-green-400" : "text-red-400"}
          />
        )}

        {valueScore !== 0 && (
          <MetricRow
            label="Value Score"
            value={valueScore > 0 ? `+${valueScore.toFixed(1)}` : valueScore.toFixed(1)}
            color={valueScore > 3 ? "text-green-400" : valueScore < -3 ? "text-red-400" : "text-gray-400"}
          />
        )}

        {/* Status Warnings */}
        {(player.is_injured || player.is_bye) && (
          <div className="flex items-center gap-2 text-xs text-orange-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{player.is_injured ? 'Injured' : 'Bye Round'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  value2?: string;
  suffix?: string;
  color: string;
}

function MetricRow({ label, value, value2, suffix, color }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className={`font-bold ${color}`}>
        {value}{value2 || ''}{suffix ? ` ${suffix}` : ''}
      </span>
    </div>
  );
}

function getIntelligentReason(player: DerivedPlayer, type: string): string {
  const value = player.value_score ?? 0;
  const delta = (player.projection ?? 0) - (player.breakeven ?? 0);
  const priceChange = player.expected_price_change ?? 0;

  // Prioritize AI recommendation short text
  if (player.recommendation_short && player.recommendation_short.length > 10) {
    const text = player.recommendation_short.trim();
    if (!text.toLowerCase().includes('player_id') && !text.toLowerCase().includes('value_score')) {
      return text.length > 45 ? text.substring(0, 42) + '...' : text;
    }
  }

  if (type === "sell") {
    if (value < -6) return "Significantly overpriced";
    if (delta < -12) return `${Math.abs(delta).toFixed(0)} below breakeven`;
    if (priceChange < -30000) return "Major price drop risk";
    return "Sell signal detected";
  }

  if (type === "buy") {
    if (priceChange > 40000) return "Breakout spike projected";
    if (value > 7) return "Elite value opportunity";
    if (delta > 15) return "Huge upside potential";
    return "Strong buy signal";
  }

  if (type === "value") {
    if (value > 8) return "Premium value at price";
    if (value > 5) return "Strong value pick";
    return "Value opportunity";
  }

  if (type === "upgrade") {
    if (delta > 20) return "Massive upside potential";
    if (delta > 12) return "Premium upgrade target";
    return "Quality upgrade option";
  }

  return "Market signal detected";
}

function getHoverInsight(player: DerivedPlayer, type: string): string {
  const value = player.value_score ?? 0;
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const delta = projection - breakeven;
  const priceChange = player.expected_price_change ?? 0;

  // Prioritize AI summary if meaningful
  if (player.summary_short && player.summary_short.length > 30) {
    const text = player.summary_short.trim();
    const lower = text.toLowerCase();
    if (!lower.includes('player_id') && !lower.includes('value_score') &&
        !lower.includes('bye round') && text.length > 30) {
      return text;
    }
  }

  if (type === "sell") {
    if (value < -5) {
      return `Model projects ${player.player_name} as overpriced by ${Math.abs(value * 10).toFixed(0)}k+ relative to output. Value score ${value.toFixed(1)} indicates sell opportunity.`;
    }
    if (delta < -10) {
      return `${player.player_name} projects ${Math.abs(delta).toFixed(0)} points below breakeven of ${breakeven.toFixed(0)}. Price drop likely${priceChange < 0 ? ` (est. ${fmtPrice(Math.abs(Math.round(priceChange)))})` : ''}.`;
    }
    return `Market analysis suggests ${player.player_name} carries downside risk. Consider selling to preserve team value.`;
  }

  if (type === "buy") {
    if (priceChange > 30000) {
      return `${player.player_name} shows breakout projection pattern. Model estimates ${fmtPrice(Math.round(priceChange))} price rise. Strong buy window identified.`;
    }
    if (value > 6) {
      return `Elite value opportunity. ${player.player_name} projects ${projection.toFixed(0)} points with value score +${value.toFixed(1)}, indicating ${(value * 10).toFixed(0)}k+ underpriced.`;
    }
    return `${player.player_name} projects ${delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)} vs breakeven. Strong upside potential at current price.`;
  }

  if (type === "value") {
    if (value > 7) {
      return `Premium value pick. ${player.player_name} delivers ${projection.toFixed(0)} points at ${fmtPrice(player.price ?? 0)} with exceptional value score of +${value.toFixed(1)}.`;
    }
    return `${player.player_name} offers strong value at current price point. Projects ${projection.toFixed(0)} points with favorable value metrics.`;
  }

  if (type === "upgrade") {
    if (delta > 20) {
      return `Massive weekly upside. ${player.player_name} projects ${projection.toFixed(0)} points (+${delta.toFixed(0)} vs breakeven). Premium upgrade target.`;
    }
    return `Quality upgrade option. ${player.player_name} projects ${projection.toFixed(0)} points with ceiling of ${player.ceiling?.toFixed(0) ?? '—'} points.`;
  }

  return `${player.player_name} identified as ${type} opportunity based on projection models and value analysis.`;
}
