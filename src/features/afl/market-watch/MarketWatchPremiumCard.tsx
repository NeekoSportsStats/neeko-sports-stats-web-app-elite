import { useState } from "react";
import { TrendingUp, TrendingDown, TriangleAlert as AlertTriangle, DollarSign, ChartBar as BarChart3 } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface PremiumCardProps {
  player: DerivedPlayer;
  rank: number;
  type: "buy" | "hold" | "sell";
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
    hold: {
      border: "border-[#F5C84C]/20 hover:border-[#F5C84C]/40",
      glow: "hover:shadow-[0_0_30px_rgba(245,200,76,0.15)]",
      rankBg: "bg-[#F5C84C]/15 text-[#F5C84C] border border-[#F5C84C]/30",
      tagBg: "bg-[#F5C84C]/10 text-[#F5C84C]",
      icon: DollarSign,
      iconColor: "text-[#F5C84C]",
      gradient: "from-[#F5C84C]/5 via-transparent to-transparent",
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
        hover:scale-[1.02]
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

      {/* Hero Stat: Projection */}
      <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-4">
        <div className="text-xs text-white/40 mb-2 uppercase tracking-wide">Projection</div>
        <div className="flex items-baseline gap-2">
          <div className={`text-3xl font-black ${
            delta > 12 ? 'text-green-400' :
            delta < -8 ? 'text-red-400' :
            'text-white'
          }`}>
            {projection.toFixed(0)}
          </div>
          <div className="text-lg font-bold text-white/50">pts</div>
        </div>
        {breakeven > 0 && (
          <div className="mt-1.5 text-sm font-medium">
            <span className={delta > 0 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-gray-400'}>
              {delta > 0 ? '+' : ''}{delta.toFixed(0)} vs Breakeven
            </span>
          </div>
        )}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Price</div>
          <div className="text-base font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        {valueScore !== 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Value</div>
            <div className={`text-base font-bold ${
              valueScore > 3 ? 'text-green-400' :
              valueScore < -3 ? 'text-red-400' :
              'text-white'
            }`}>
              {valueScore > 0 ? '+' : ''}{valueScore.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {/* Signal Metrics */}
      <div className="pt-4 border-t border-white/10 space-y-2.5">
        {priceChange !== 0 && Math.abs(priceChange) >= 5000 && (
          <MetricRow
            label="Est. Change"
            value={priceChange >= 0 ? "+" : ""}
            value2={fmtPrice(Math.round(priceChange))}
            color={priceChange >= 0 ? "text-green-400" : "text-red-400"}
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

function getIntelligentReason(player: DerivedPlayer, type: string): string | null {
  // ONLY use real AI content - no fallbacks
  if (player.recommendation_short && player.recommendation_short.length > 10) {
    const text = player.recommendation_short.trim();
    const lower = text.toLowerCase();

    // Validate it's real AI text (not debug/placeholder)
    if (!lower.includes('player_id') &&
        !lower.includes('value_score') &&
        !lower.includes('undefined') &&
        !lower.includes('null')) {
      return text.length > 45 ? text.substring(0, 42) + '...' : text;
    }
  }

  // If no real AI content, show nothing
  return null;
}

function getHoverInsight(player: DerivedPlayer, type: string): string {
  // ONLY use real AI content if available
  if (player.summary_short && player.summary_short.length > 30) {
    const text = player.summary_short.trim();
    const lower = text.toLowerCase();

    // Validate it's real AI text
    if (!lower.includes('player_id') &&
        !lower.includes('value_score') &&
        !lower.includes('undefined') &&
        !lower.includes('null') &&
        text.length > 30) {
      return text;
    }
  }

  // Fallback to data-driven insight (not AI claims)
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const delta = projection - breakeven;
  const value = player.value_score ?? 0;

  return `Projection: ${projection.toFixed(0)} pts | Breakeven: ${breakeven.toFixed(0)} pts | Delta: ${delta > 0 ? '+' : ''}${delta.toFixed(0)} | Value: ${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
