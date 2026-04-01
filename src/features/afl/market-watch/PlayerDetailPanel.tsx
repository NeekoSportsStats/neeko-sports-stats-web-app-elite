import { useEffect, useState } from "react";
import { X, ChevronDown, ChevronUp, Info } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { cleanAiText } from "@/utils/cleanAiText";
import { useAuth } from "@/lib/auth";
import {
  calculateValueRank,
  getTrendIndicator,
  getConfidenceTooltip,
  getUrgencyMessage,
  generateSmartWhy,
  getConfidenceDriver,
  getFormSnapshot,
  getConsistencySignal
} from "./helpers";

interface PlayerDetailPanelProps {
  player: DerivedPlayer | null;
  onClose: () => void;
  allPlayers: DerivedPlayer[];
}

export function PlayerDetailPanel({ player, onClose, allPlayers }: PlayerDetailPanelProps) {
  const { isPremium } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (player) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [player]);

  if (!player) return null;

  const delta = (player.projection || 0) - (player.breakeven || 0);
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-white/60";

  const signalConfig = getSignalConfig(player);
  const verdict = getVerdict(player, delta);
  const confidence = getConfidence(player);
  const confidenceTooltip = getConfidenceTooltip();

  const { rank, percentile } = calculateValueRank(allPlayers, player);
  const trendIndicator = getTrendIndicator(player);
  const urgencyMsg = getUrgencyMessage(player, delta);
  const confidenceDriver = getConfidenceDriver(player);
  const formSnapshot = getFormSnapshot(player);
  const consistencySignal = getConsistencySignal(player);

  const whyText = generateSmartWhy(player);

  const extendedText = player.summary_long
    ? cleanAiText(player.summary_long)
    : player.ai_recommendation
    ? cleanAiText(player.ai_recommendation)
    : null;

  const formattedExtended = extendedText ? formatExtendedAnalysis(extendedText) : null;

  const upside = calculateUpside(player);
  const risk = calculateRisk(player);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-[#0D0D0D] border-l border-white/10 z-50 overflow-y-auto animate-in slide-in-from-right duration-300">

        {/* HEADER - UPGRADED */}
        <div className={`sticky top-0 bg-gradient-to-b from-[#0D0D0D] to-[#0D0D0D]/95 border-b ${signalConfig.border} p-6 backdrop-blur-sm ${signalConfig.glow}`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-white">{player.player_name}</h2>
                {(player.manual_status === "OUT" || (!player.manual_status && player.status === "OUT")) ? (
                  <span className="rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">OUT</span>
                ) : (player.manual_status === "INJURED" || (!player.manual_status && player.status === "INJURED")) ? (
                  <span className="rounded-sm bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">INJ</span>
                ) : player.is_bye ? (
                  <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/40 uppercase tracking-wide border border-white/15">BYE</span>
                ) : null}
              </div>
              <p className="text-sm text-white/60">{player.team} · {player.position}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded ${signalConfig.bg} ${signalConfig.text} ${signalConfig.border}`}>
              <span className="text-base">{signalConfig.icon}</span>
              <span>{signalConfig.label}</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded text-xs text-white/80 cursor-help group relative">
                <span>{confidence}</span>
                <Info className="w-3 h-3 text-white/40 group-hover:text-white/60 transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black border border-white/20 rounded text-[10px] text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-56 text-center">
                  {confidenceTooltip}
                </div>
              </div>
              <div className="text-[10px] text-white/40 px-3">
                {confidenceDriver}
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded text-xs ${trendIndicator.color}`}>
              <span>{trendIndicator.icon}</span>
              <span>{trendIndicator.label}</span>
            </div>
          </div>

          {/* VALUE GAP + RANK */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Value Gap</div>
              <div className={`text-4xl font-bold ${deltaColor}`}>
                {delta > 0 ? '+' : ''}{Math.round(delta)}
              </div>
            </div>
            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Value Rank</div>
              <div className="text-2xl font-bold text-white">#{rank}</div>
              <div className={`text-xs mt-1 ${percentile >= 75 ? 'text-green-400' : percentile >= 50 ? 'text-white/60' : 'text-red-400'}`}>
                Top {Math.round(100 - percentile)}%
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-6 space-y-6">

          {/* QUICK DECISION BLOCK + URGENCY */}
          <div className={`p-4 border-l-4 ${signalConfig.borderLeft} bg-white/[0.02] rounded-r-lg`}>
            <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              📊 Verdict
            </div>
            <p className="text-sm font-medium text-white leading-relaxed mb-2">
              {verdict}
            </p>
            {urgencyMsg && (
              <p className="text-xs text-[#F5C84C] font-medium">
                {urgencyMsg}
              </p>
            )}
          </div>

          {/* KEY STATS - RESTRUCTURED 2x2 */}
          <div>
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Key Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Projection"
                value={Math.round(player.projection || 0).toString()}
                color={deltaColor}
              />
              <StatCard
                label="Breakeven"
                value={Math.round(player.breakeven || 0).toString()}
                color="text-white/80"
              />
              <StatCard
                label="Price"
                value={formatPrice(player.price || 0)}
                color="text-white/80"
              />
              <StatCard
                label="Value Gap"
                value={`${delta > 0 ? '+' : ''}${Math.round(delta)}`}
                color={delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}
              />
            </div>

            {/* FORM SNAPSHOT + CONSISTENCY */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {formSnapshot && (
                <div className="text-xs text-white/60 px-3 py-1.5 bg-white/5 border border-white/10 rounded">
                  {formSnapshot}
                </div>
              )}
              {consistencySignal && (
                <div className={`text-xs font-medium px-3 py-1.5 bg-white/5 border border-white/10 rounded ${consistencySignal.color}`}>
                  {consistencySignal.label}
                </div>
              )}
            </div>
          </div>

          {/* WHY THIS PICK - HIGHLIGHTED */}
          <div>
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
              Why This Pick
            </h3>
            <div className="p-4 bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 rounded-lg">
              <p className="text-sm text-white leading-relaxed">
                {formatWhyText(whyText)}
              </p>
            </div>
          </div>

          {/* RISK VS REWARD VISUAL - NEW */}
          <div>
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
              Risk vs Reward
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-white/60">Upside Potential</span>
                  <span className="text-xs font-bold text-green-400">{upside}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                    style={{ width: `${upside}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-white/60">Downside Risk</span>
                  <span className="text-xs font-bold text-red-400">{risk}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                    style={{ width: `${risk}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* EXTENDED ANALYSIS - IMPROVED READABILITY */}
          {formattedExtended && (
            <div>
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
                Extended Analysis
              </h3>
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg space-y-3">
                {formattedExtended.map((paragraph, i) => (
                  <p key={i} className="text-sm text-white/70 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ADVANCED METRICS - COLLAPSIBLE */}
          {(player.value_score || player.ceiling || player.risk_pct || player.volatility_level) && (
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-xs font-bold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors"
              >
                <span>Advanced Metrics</span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                  {player.value_score && <MetricRow label="Value Score" value={Math.round(player.value_score)} />}
                  {player.ceiling && <MetricRow label="Ceiling" value={Math.round(player.ceiling)} />}
                  {player.risk_pct && <MetricRow label="Risk %" value={`${Math.round(player.risk_pct)}%`} />}
                  {player.volatility_level && <MetricRow label="Volatility" value={player.volatility_level} />}
                </div>
              )}
            </div>
          )}

          {/* TRUST MICRO COPY */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-white/40 text-center leading-relaxed">
              Model-driven insight based on projections, pricing and role data
            </p>
          </div>

          {/* CONVERSION CTA - FREE USERS ONLY */}
          {!isPremium && (
            <div className="mt-6 p-6 border border-[#F5C84C]/20 rounded-lg bg-gradient-to-b from-[#F5C84C]/5 to-transparent">
              <h4 className="text-sm font-bold text-white mb-3">
                Want more players like this?
              </h4>
              <ul className="space-y-2 mb-4 text-xs text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>More targets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Weekly trade insights</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Full rankings access</span>
                </li>
              </ul>
              <a
                href="/neeko-plus"
                className="block w-full px-6 py-2.5 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 transition-all text-center text-sm"
              >
                Upgrade to Neeko+
              </a>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  color: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  value: string | number;
}

function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/10 rounded">
      <span className="text-xs text-white/60">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function getSignalConfig(player: DerivedPlayer) {
  const category = player.category?.toUpperCase() || "WATCH";
  const aiReco = player.ai_recommendation?.toLowerCase() || "";

  if (category === "TARGET" || category === "BUY") {
    if (aiReco.includes("strong buy") || aiReco.includes("elite")) {
      return {
        icon: "🔥",
        label: "Strong Target",
        bg: "bg-green-500/20",
        text: "text-green-400",
        border: "border-green-500/40",
        borderLeft: "border-green-500",
        glow: "shadow-[0_0_40px_rgba(34,197,94,0.25)]",
      };
    }
    return {
      icon: "👍",
      label: "Target",
      bg: "bg-green-500/10",
      text: "text-green-400",
      border: "border-green-500/30",
      borderLeft: "border-green-500/70",
      glow: "shadow-[0_0_30px_rgba(34,197,94,0.2)]",
    };
  }

  if (category === "AVOID" || category === "SELL") {
    if (aiReco.includes("strong sell") || aiReco.includes("high risk")) {
      return {
        icon: "❌",
        label: "Avoid",
        bg: "bg-red-500/20",
        text: "text-red-400",
        border: "border-red-500/40",
        borderLeft: "border-red-500",
        glow: "shadow-[0_0_40px_rgba(239,68,68,0.25)]",
      };
    }
    return {
      icon: "⚠️",
      label: "Risk",
      bg: "bg-red-500/10",
      text: "text-red-400",
      border: "border-red-500/30",
      borderLeft: "border-red-500/70",
      glow: "shadow-[0_0_30px_rgba(239,68,68,0.2)]",
    };
  }

  return {
    icon: "⚖️",
    label: "Neutral",
    bg: "bg-[#F5C84C]/10",
    text: "text-[#F5C84C]",
    border: "border-[#F5C84C]/30",
    borderLeft: "border-[#F5C84C]/70",
    glow: "shadow-[0_0_30px_rgba(245,200,76,0.2)]",
  };
}

function getVerdict(player: DerivedPlayer, delta: number): string {
  const category = player.category?.toUpperCase() || "WATCH";

  if (category === "TARGET" || category === "BUY") {
    if (delta > 15) return "Buy — elite value with significant upside";
    if (delta > 8) return "Buy — strong value with upside";
    return "Buy — solid value opportunity";
  }

  if (category === "AVOID" || category === "SELL") {
    if (delta < -15) return "Sell — severely overpriced, exit immediately";
    if (delta < -8) return "Sell — poor value, recommend exit";
    return "Avoid — limited value, consider alternatives";
  }

  return "Hold — neutral value, monitor for changes";
}

function getConfidence(player: DerivedPlayer): string {
  const consistency = player.consistency_score || 0;
  const projectionConfidence = player.projection_confidence || 0;

  const avgConfidence = (consistency + projectionConfidence) / 2;

  if (avgConfidence > 75) return "High Confidence";
  if (avgConfidence > 50) return "Medium Confidence";
  return "Lower Confidence";
}

function calculateUpside(player: DerivedPlayer): number {
  const delta = (player.projection || 0) - (player.breakeven || 0);
  const ceiling = player.ceiling || player.projection || 0;
  const projection = player.projection || 0;

  if (projection === 0) return 0;

  const ceilingUpside = ((ceiling - projection) / projection) * 100;
  const valueUpside = delta > 0 ? (delta / projection) * 100 : 0;

  const totalUpside = Math.min(100, Math.max(0, (ceilingUpside + valueUpside) / 2));

  return Math.round(totalUpside);
}

function calculateRisk(player: DerivedPlayer): number {
  const riskPct = player.risk_pct || 0;
  const volatility = player.volatility_score || 0;
  const delta = (player.projection || 0) - (player.breakeven || 0);

  let risk = riskPct;

  if (delta < 0) {
    risk += Math.abs(delta) * 2;
  }

  if (volatility > 50) {
    risk += 10;
  }

  return Math.min(100, Math.max(0, Math.round(risk)));
}

function formatWhyText(text: string): React.ReactNode {
  const numberRegex = /(\+?\-?\d+)/g;
  const parts = text.split(numberRegex);

  return parts.map((part, i) => {
    if (numberRegex.test(part)) {
      return <strong key={i} className="font-bold text-white">{part}</strong>;
    }
    return part;
  });
}

function formatExtendedAnalysis(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);

  const paragraphs: string[] = [];
  let current = '';

  for (let i = 0; i < sentences.length; i++) {
    current += sentences[i] + ' ';

    if ((i + 1) % 2 === 0 || i === sentences.length - 1) {
      if (current.trim()) {
        paragraphs.push(current.trim());
      }
      current = '';
    }
  }

  return paragraphs.slice(0, 3);
}
