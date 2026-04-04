import { X, TrendingUp, TrendingDown, Target, TriangleAlert as AlertTriangle, DollarSign, Activity, ChartBar as BarChart3, Shield } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";
import { formatActionLabel } from "@/utils/marketLabels";

interface PlayerAIModalProps {
  player: DerivedPlayer | null;
  onClose: () => void;
}

export function PlayerAIModal({ player, onClose }: PlayerAIModalProps) {
  if (!player) return null;

  const priceChange = player.expected_price_change ?? 0;
  const valueScore = player.value_score ?? 0;
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const ceiling = player.ceiling ?? 0;
  const floor = player.floor_val ?? 0;
  const consistency = player.consistency_score ?? null;
  const neekoRating = player.neeko_rating ?? null;
  const confidence = player.projection_confidence ?? null;

  const categoryConfig = {
    sell_before_drop: {
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-400/10",
      border: "border-red-400/20",
      label: "Sell Risk",
      gradient: "from-red-500/5 to-transparent"
    },
    buy_before_rise: {
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-400/10",
      border: "border-green-400/20",
      label: "Buy Opportunity",
      gradient: "from-green-500/5 to-transparent"
    },
    cash_cow: {
      icon: DollarSign,
      color: "text-[#F5C84C]",
      bg: "bg-[#F5C84C]/10",
      border: "border-[#F5C84C]/20",
      label: "Best Value",
      gradient: "from-[#F5C84C]/5 to-transparent"
    },
    upgrade_target: {
      icon: BarChart3,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      border: "border-blue-400/20",
      label: "Premium Upgrade",
      gradient: "from-blue-500/5 to-transparent"
    },
    fade_trap: {
      icon: AlertTriangle,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      border: "border-orange-400/20",
      label: "Trap Risk",
      gradient: "from-orange-500/5 to-transparent"
    },
  };

  const category = player._category || "BUY";
  const categoryKey = category === "BUY" ? "buy_before_rise" : category === "SELL" ? "sell_before_drop" : "cash_cow";
  const config = categoryConfig[categoryKey as keyof typeof categoryConfig] || categoryConfig.cash_cow;
  const Icon = config.icon;

  const hasInjuryRisk = player.is_injured || player.status === 'injured';
  const hasByeRisk = player.is_bye || player.status === 'bye';

  // ONLY use summary_long - no fallbacks per spec
  const aiSummary = validateAIText(player.summary_long) ? player.summary_long : null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`bg-gradient-to-br ${config.gradient} bg-[#0D0D0D] rounded-2xl border border-white/10 p-6 max-w-2xl w-full relative shadow-2xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`${config.bg} ${config.border} border p-3 rounded-xl`}>
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`inline-block ${config.bg} ${config.border} border px-3 py-1 rounded-full mb-2`}>
              <span className={`text-xs font-bold ${config.color} uppercase tracking-wide`}>
                {config.label}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {player.player_name}
            </h2>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="font-semibold">{player.position}</span>
              <span className="text-white/20">•</span>
              <span>{player.team}</span>
              {(hasInjuryRisk || hasByeRisk) && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="text-orange-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {hasInjuryRisk ? 'Injured' : 'Bye'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            label="Price"
            value={fmtPrice(player.price ?? 0)}
            subValue={priceChange !== 0 ? `${priceChange >= 0 ? '+' : ''}${fmtPrice(Math.round(priceChange))}` : undefined}
            subValueColor={priceChange >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <MetricCard
            label="Breakeven"
            value={`${breakeven.toFixed(0)} pts`}
            subValue={breakeven > 0 ? 'to hold price' : undefined}
            subValueColor="text-gray-500"
          />
          <MetricCard
            label="Projection"
            value={`${projection.toFixed(0)} pts`}
            subValue={projection > breakeven ? `+${(projection - breakeven).toFixed(0)} vs BE` : undefined}
            subValueColor={projection > breakeven ? 'text-green-400' : 'text-red-400'}
          />
          <MetricCard
            label="Value Score"
            value={valueScore !== null ? (valueScore > 0 ? `+${valueScore.toFixed(1)}` : valueScore.toFixed(1)) : '—'}
            subValue={valueScore !== null ? getValueLabel(valueScore) : undefined}
            subValueColor={valueScore > 3 ? 'text-green-400' : valueScore < -3 ? 'text-red-400' : 'text-gray-500'}
          />
        </div>

        {/* Range & Confidence */}
        {(ceiling > 0 || floor > 0 || consistency !== null || confidence !== null || neekoRating !== null) && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {ceiling > 0 && (
              <MetricCard
                label="Ceiling"
                value={`${ceiling.toFixed(0)} pts`}
                icon={TrendingUp}
                iconColor="text-green-400/60"
              />
            )}
            {floor > 0 && (
              <MetricCard
                label="Floor"
                value={`${floor.toFixed(0)} pts`}
                icon={Shield}
                iconColor="text-blue-400/60"
              />
            )}
            {consistency !== null && (
              <MetricCard
                label="Consistency"
                value={`${consistency.toFixed(0)}%`}
                icon={Activity}
                iconColor={consistency > 65 ? "text-green-400/60" : consistency < 40 ? "text-red-400/60" : "text-gray-400/60"}
              />
            )}
            {confidence !== null && (
              <MetricCard
                label="Confidence"
                value={`${confidence.toFixed(0)}%`}
                icon={BarChart3}
                iconColor="text-blue-400/60"
              />
            )}
            {neekoRating !== null && (
              <MetricCard
                label="Neeko Rating"
                value={neekoRating.toFixed(1)}
                icon={Target}
                iconColor="text-[#F5C84C]/60"
              />
            )}
          </div>
        )}

        {/* AI Analysis - summary_long ONLY */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-1 h-5 ${config.bg} rounded-full`} />
              <h3 className={`${config.color} text-sm font-bold uppercase tracking-wider`}>
                AI Analysis
              </h3>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              {aiSummary ? (
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {aiSummary}
                </p>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  AI analysis pending - check back after next data refresh
                </p>
              )}
            </div>
          </div>

          {/* Recommendation Badge */}
          {player.ai_recommendation && (
            <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <span className="text-sm text-gray-400">AI Recommendation</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                player.ai_recommendation === 'BUY' || player.ai_recommendation === 'STRONG_BUY'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : player.ai_recommendation === 'SELL' || player.ai_recommendation === 'AVOID' || player.ai_recommendation === 'STRONG_SELL'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
              }`}>
                {formatActionLabel(player.ai_recommendation)}
              </span>
            </div>
          )}

          {/* Matchup Context */}
          {player.matchup_label && (
            <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/10 rounded-xl">
              <span className="text-sm text-gray-400">Next Matchup</span>
              <span className="text-sm font-medium text-white">
                {player.matchup_label}
              </span>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-white transition-all hover:scale-105"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  subValueColor?: string;
  icon?: any;
  iconColor?: string;
}

function MetricCard({ label, value, subValue, subValueColor, icon: Icon, iconColor }: MetricCardProps) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-white/40 uppercase tracking-wide">{label}</div>
        {Icon && <Icon className={`w-3.5 h-3.5 ${iconColor || 'text-white/20'}`} />}
      </div>
      <div className="text-base font-bold text-white">
        {value}
      </div>
      {subValue && (
        <div className={`text-xs mt-0.5 font-medium ${subValueColor || 'text-gray-500'}`}>
          {subValue}
        </div>
      )}
    </div>
  );
}

function getValueLabel(score: number): string {
  if (score >= 6) return 'Elite value';
  if (score >= 3) return 'Strong value';
  if (score >= 0) return 'Fair value';
  if (score >= -3) return 'Slight premium';
  return 'Overpriced';
}

// Validation helper - ensures text is real AI content, not placeholder/debug
function validateAIText(text: string | null | undefined): boolean {
  if (!text || text.length < 15) return false;

  const lower = text.toLowerCase().trim();

  // Reject debug/placeholder patterns
  if (lower.includes('player_id')) return false;
  if (lower.includes('value_score')) return false;
  if (lower.includes('undefined')) return false;
  if (lower.includes('null')) return false;
  if (lower.includes('{{')) return false;
  if (lower.includes('bye round') && text.length < 30) return false;

  return true;
}
