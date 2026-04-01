import { Target } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface MarketWatchHeroProps {
  topBuy: DerivedPlayer | null;
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

export function MarketWatchHero({ topBuy }: MarketWatchHeroProps) {
  if (!topBuy) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <HeroCard
        player={topBuy}
        type="buy"
        label="BEST TARGET"
        icon={<Target className="w-6 h-6" />}
      />
    </div>
  );
}

interface HeroCardProps {
  player: DerivedPlayer;
  type: "buy";
  label: string;
  icon: React.ReactNode;
}

function HeroCard({ player, label, icon }: HeroCardProps) {
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const valueLabel = player.value_label || 'Strong Value';
  const whyText = getWhy(player);

  const config = {
    bg: "bg-gradient-to-br from-green-500/5 to-green-600/10",
    border: "border-green-500/20",
    glow: "shadow-[0_0_30px_rgba(34,197,94,0.15)]",
    iconColor: "text-green-400",
    accentColor: "text-green-400",
    badgeBg: "bg-green-500/15 border-green-500/30",
    hoverGlow: "hover:shadow-[0_0_40px_rgba(34,197,94,0.25)]",
  };

  return (
    <div
      className={`
        ${config.bg} ${config.border} ${config.glow} ${config.hoverGlow}
        border rounded-2xl p-8
        transition-all duration-300
        hover:scale-[1.01] hover:border-green-500/30
        group relative overflow-hidden
      `}
    >
      {/* TOP: Label + Badge */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`${config.iconColor}`}>
            {icon}
          </div>
          <div className="text-sm font-bold text-white/40 uppercase tracking-wider">
            {label}
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-lg border ${config.badgeBg} ${config.iconColor}`}>
          <span className="text-xs font-bold uppercase tracking-wide">TARGET</span>
        </div>
      </div>

      {/* MIDDLE: Player Name */}
      <div className="mb-6">
        <h3 className="text-3xl font-bold text-white mb-2">
          {player.player_name}
        </h3>
        <div className="flex items-center gap-2 text-base text-white/60">
          <span className="font-semibold">{player.position}</span>
          <span className="text-white/30">•</span>
          <span>{player.team}</span>
        </div>
      </div>

      {/* STATS GRID: Projection, Breakeven, Price, Value */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wide">Projection</div>
          <div className="text-2xl font-bold text-white">
            {projection.toFixed(0)} <span className="text-sm font-medium text-white/50">pts</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wide">Breakeven</div>
          <div className="text-2xl font-bold text-white">
            {breakeven.toFixed(0)} <span className="text-sm font-medium text-white/50">pts</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wide">Price</div>
          <div className="text-2xl font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wide">Value</div>
          <div className={`text-base font-bold ${config.accentColor}`}>
            {valueLabel}
          </div>
        </div>
      </div>

      {/* WHY SECTION - Only show if AI content available */}
      {whyText && (
        <div className="pt-5 border-t border-white/10">
          <div className="flex items-start gap-2">
            <span className={`${config.accentColor} font-bold text-sm uppercase tracking-wide flex-shrink-0`}>WHY:</span>
            <p className="text-sm text-gray-300 leading-relaxed">
              {whyText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
