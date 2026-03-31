import { X, TrendingUp, TrendingDown, Target } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface PlayerAIModalProps {
  player: DerivedPlayer | null;
  onClose: () => void;
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

export function PlayerAIModal({ player, onClose }: PlayerAIModalProps) {
  if (!player) return null;

  const priceChange = player.expected_price_change ?? 0;
  const valueScore = player.value_score ?? 0;

  const categoryConfig = {
    sell: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
    buy: { icon: TrendingUp, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20" },
    value: { icon: Target, color: "text-[#F5C84C]", bg: "bg-[#F5C84C]/10", border: "border-[#F5C84C]/20" },
  };

  const category = player.market_watch_category || "value";
  const config = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.value;
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#0D0D0D] rounded-2xl border border-white/10 p-6 max-w-lg w-full relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className={`${config.bg} ${config.border} border p-2 rounded-lg`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white mb-1 truncate">
              {player.player_name}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="font-medium">{player.position}</span>
              <span className="text-white/30">•</span>
              <span>{player.team}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/40 mb-1">Price</div>
            <div className="text-lg font-bold text-white">
              {fmtPrice(player.price ?? 0)}
            </div>
            {priceChange !== 0 && (
              <div className={`text-xs mt-1 ${priceChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                {priceChange >= 0 ? "+" : ""}{fmtPrice(Math.round(priceChange))}
              </div>
            )}
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/40 mb-1">Projection</div>
            <div className="text-lg font-bold text-white">
              {player.projection?.toFixed(0) ?? "—"} pts
            </div>
            {valueScore !== 0 && (
              <div className={`text-xs mt-1 ${valueScore > 0 ? "text-green-400" : "text-red-400"}`}>
                Value: {valueScore > 0 ? "+" : ""}{valueScore.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-1 h-4 ${config.bg} rounded-full`} />
              <p className={`${config.color} text-sm font-semibold uppercase tracking-wide`}>
                Why This Signal
              </p>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg p-3">
              {getWhy(player)}
            </p>
          </div>

          {player.summary_long && player.summary_long.length > 20 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-[#F5C84C]/30 rounded-full" />
                <p className="text-[#F5C84C] text-sm font-semibold uppercase tracking-wide">
                  Full Analysis
                </p>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg p-3">
                {player.summary_long}
              </p>
            </div>
          )}

          {(!player.summary_long || player.summary_long.length <= 20) && (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500">
                Full analysis unavailable
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
