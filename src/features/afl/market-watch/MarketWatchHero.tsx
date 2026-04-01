import { Target, Eye, ShieldAlert } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface MarketWatchHeroProps {
  topBuy: DerivedPlayer | null;
  topHold: DerivedPlayer | null;
  topSell: DerivedPlayer | null;
}

// Get AI explanation for hero card - REAL AI ONLY
function getWhy(player: any): string {
  // ONLY use real AI summary_short or recommendation_short
  if (player.summary_short && player.summary_short.length > 20) {
    const text = player.summary_short.trim();
    const lower = text.toLowerCase();

    // Validate it's real AI (not debug/placeholder)
    if (!lower.includes('player_id') &&
        !lower.includes('value_score') &&
        !lower.includes('undefined') &&
        !lower.includes('null')) {
      return truncate(text, 120);
    }
  }

  if (player.recommendation_short && player.recommendation_short.length > 15) {
    const text = player.recommendation_short.trim();
    const lower = text.toLowerCase();

    // Validate it's real AI (not debug/placeholder)
    if (!lower.includes('player_id') &&
        !lower.includes('value_score') &&
        !lower.includes('undefined') &&
        !lower.includes('null')) {
      return truncate(text, 120);
    }
  }

  // If no AI available, return empty string (no fallback text)
  return '';
}

// Truncate text to max length
function truncate(text: string, maxLen: number = 120): string {
  if (!text) return "";
  const cleaned = text.trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

export function MarketWatchHero({ topBuy, topHold, topSell }: MarketWatchHeroProps) {
  // Show at least one hero card
  if (!topBuy && !topHold && !topSell) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
      {topBuy && (
        <HeroCard
          player={topBuy}
          type="buy"
          label="TOP TARGET"
          icon={<Target className="w-5 h-5" />}
        />
      )}
      {topHold && (
        <HeroCard
          player={topHold}
          type="hold"
          label="TOP VALUE"
          icon={<Eye className="w-5 h-5" />}
        />
      )}
      {topSell && (
        <HeroCard
          player={topSell}
          type="sell"
          label="TOP AVOID"
          icon={<ShieldAlert className="w-5 h-5" />}
        />
      )}
    </div>
  );
}

interface HeroCardProps {
  player: DerivedPlayer;
  type: "buy" | "hold" | "sell";
  label: string;
  icon: React.ReactNode;
}

function HeroCard({ player, type, label, icon }: HeroCardProps) {
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const valueLabel = player.value_label || 'Strong Value';
  const whyText = getWhy(player);

  // Color config based on type
  const config = type === "buy" ? {
    bg: "bg-gradient-to-br from-green-500/5 to-green-600/10",
    border: "border-green-500/20",
    glow: "shadow-[0_0_20px_rgba(34,197,94,0.1)]",
    iconColor: "text-green-400",
    accentColor: "text-green-400",
    badgeBg: "bg-green-500/15 border-green-500/30",
    badgeText: "TARGET",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(34,197,94,0.2)]",
  } : type === "sell" ? {
    bg: "bg-gradient-to-br from-red-500/5 to-red-600/10",
    border: "border-red-500/20",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.1)]",
    iconColor: "text-red-400",
    accentColor: "text-red-400",
    badgeBg: "bg-red-500/15 border-red-500/30",
    badgeText: "AVOID",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]",
  } : {
    bg: "bg-gradient-to-br from-blue-500/5 to-blue-600/10",
    border: "border-blue-500/20",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.1)]",
    iconColor: "text-blue-400",
    accentColor: "text-blue-400",
    badgeBg: "bg-blue-500/15 border-blue-500/30",
    badgeText: "WATCH",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]",
  };

  return (
    <div
      className={`
        ${config.bg} ${config.border} ${config.glow} ${config.hoverGlow}
        border rounded-xl p-6
        transition-all duration-300
        hover:scale-[1.02]
        group relative overflow-hidden
      `}
    >
      {/* TOP: Icon + Label */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`${config.iconColor}`}>
          {icon}
        </div>
        <div className="text-xs font-bold text-white/40 uppercase tracking-wider">
          {label}
        </div>
        <div className={`ml-auto px-3 py-1 rounded-md border ${config.badgeBg} ${config.iconColor}`}>
          <span className="text-xs font-bold uppercase tracking-wide">{config.badgeText}</span>
        </div>
      </div>

      {/* Player Name */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-white mb-1">
          {player.player_name}
        </h3>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span className="font-semibold">{player.position}</span>
          <span className="text-white/30">•</span>
          <span>{player.team}</span>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Projection</div>
          <div className="text-xl font-bold text-white">
            {projection.toFixed(0)} <span className="text-xs font-medium text-white/50">pts</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Breakeven</div>
          <div className="text-xl font-bold text-white">
            {breakeven.toFixed(0)} <span className="text-xs font-medium text-white/50">pts</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Price</div>
          <div className="text-lg font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 mb-1 uppercase tracking-wide">Value</div>
          <div className={`text-sm font-bold ${config.accentColor}`}>
            {valueLabel}
          </div>
        </div>
      </div>

      {/* WHY SECTION - Only show if AI content available */}
      {whyText && (
        <div className="pt-4 border-t border-white/10">
          <div className="flex items-start gap-2">
            <span className={`${config.accentColor} font-bold text-xs uppercase tracking-wide flex-shrink-0`}>WHY:</span>
            <p className="text-xs text-gray-300 leading-relaxed">
              {whyText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
