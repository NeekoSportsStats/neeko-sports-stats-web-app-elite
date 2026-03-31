import { TrendingDown, TrendingUp, Target } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface MarketWatchHeroProps {
  topSell: DerivedPlayer | null;
  topBuy: DerivedPlayer | null;
  topValue: DerivedPlayer | null;
}

// Get AI explanation for hero card
function getWhy(player: any): string {
  // Use existing AI summary if available and meaningful
  if (player.summary_short && player.summary_short.length > 20) {
    const text = player.summary_short;
    // Validate: no banned words
    const lower = text.toLowerCase();
    if (lower.includes('buy') || lower.includes('sell') || lower.includes('hold') ||
        lower.includes('bye round') || lower.includes('player_id') ||
        lower.includes('value_score')) {
      // Fall through to fallback
    } else {
      return truncate(text);
    }
  }

  // Fallback logic based on model signals
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

// Truncate text to max length
function truncate(text: string, maxLen: number = 90): string {
  if (!text) return "";
  const cleaned = text.trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

export function MarketWatchHero({ topSell, topBuy, topValue }: MarketWatchHeroProps) {
  return (
    <div className="grid md:grid-cols-3 gap-4 md:gap-6">
      {topSell && (
        <HeroCard
          player={topSell}
          type="sell"
          rank={1}
          label="MUST SELL"
          icon={<TrendingDown className="w-6 h-6" />}
        />
      )}
      {topBuy && (
        <HeroCard
          player={topBuy}
          type="buy"
          rank={1}
          label="BUY NOW"
          icon={<TrendingUp className="w-6 h-6" />}
        />
      )}
      {topValue && (
        <HeroCard
          player={topValue}
          type="value"
          rank={1}
          label="BEST VALUE"
          icon={<Target className="w-6 h-6" />}
        />
      )}
    </div>
  );
}

interface HeroCardProps {
  player: DerivedPlayer;
  type: "sell" | "buy" | "value";
  rank: number;
  label: string;
  icon: React.ReactNode;
}

function HeroCard({ player, type, rank, label, icon }: HeroCardProps) {
  const priceChange = player.expected_price_change ?? 0;
  const valueScore = player.value_score ?? 0;

  const config = {
    sell: {
      bg: "bg-gradient-to-br from-red-500/5 to-red-600/10",
      border: "border-red-500/20",
      glow: "shadow-[0_0_30px_rgba(239,68,68,0.15)]",
      iconColor: "text-red-400",
      accentColor: "text-red-400",
      rankBg: "bg-red-500/20",
      hoverGlow: "hover:shadow-[0_0_40px_rgba(239,68,68,0.25)]",
    },
    buy: {
      bg: "bg-gradient-to-br from-green-500/5 to-green-600/10",
      border: "border-green-500/20",
      glow: "shadow-[0_0_30px_rgba(34,197,94,0.15)]",
      iconColor: "text-green-400",
      accentColor: "text-green-400",
      rankBg: "bg-green-500/20",
      hoverGlow: "hover:shadow-[0_0_40px_rgba(34,197,94,0.25)]",
    },
    value: {
      bg: "bg-gradient-to-br from-[#F5C84C]/5 to-[#F5C84C]/10",
      border: "border-[#F5C84C]/20",
      glow: "shadow-[0_0_30px_rgba(245,200,76,0.15)]",
      iconColor: "text-[#F5C84C]",
      accentColor: "text-[#F5C84C]",
      rankBg: "bg-[#F5C84C]/20",
      hoverGlow: "hover:shadow-[0_0_40px_rgba(245,200,76,0.25)]",
    },
  }[type];

  return (
    <div
      className={`
        ${config.bg} ${config.border} ${config.glow} ${config.hoverGlow}
        border rounded-xl p-6
        transition-all duration-300
        hover:scale-[1.02] hover:border-opacity-40
        group relative overflow-hidden
      `}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-white/5 to-transparent rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`${config.iconColor}`}>
            {icon}
          </div>
          <div>
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-0.5">
              {label}
            </div>
            <div className={`text-xs font-semibold ${config.accentColor}`}>
              #{rank} Signal
            </div>
          </div>
        </div>
        <div className={`${config.rankBg} px-3 py-1 rounded-full`}>
          <span className="text-xs font-bold text-white">#{rank}</span>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-2xl font-bold text-white mb-1 truncate">
          {player.player_name}
        </h3>
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="font-medium">{player.position}</span>
          <span className="text-white/30">•</span>
          <span>{player.team}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-white/40 mb-1">Price</div>
          <div className="text-lg font-bold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-1">Projection</div>
          <div className="text-lg font-bold text-white">
            {player.projection?.toFixed(0) ?? "—"} pts
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/50">Price Change</span>
          <span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>
            {priceChange >= 0 ? "+" : ""}{fmtPrice(Math.round(priceChange))}
          </span>
        </div>
        {valueScore !== 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Value Score</span>
            <span className={valueScore > 0 ? "text-green-400" : "text-red-400"}>
              {valueScore > 0 ? "+" : ""}{valueScore.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-white/5">
        <p className="text-sm text-gray-400 leading-snug line-clamp-2">
          <span className={`${config.accentColor} font-semibold mr-1.5`}>WHY:</span>
          {getWhy(player)}
        </p>
      </div>
    </div>
  );
}
