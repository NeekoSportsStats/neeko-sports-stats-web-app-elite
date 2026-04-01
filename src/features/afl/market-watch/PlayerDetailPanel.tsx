import { useEffect } from "react";
import { X } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { cleanAiText } from "@/utils/cleanAiText";

interface PlayerDetailPanelProps {
  player: DerivedPlayer | null;
  onClose: () => void;
}

export function PlayerDetailPanel({ player, onClose }: PlayerDetailPanelProps) {
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

  const signalConfig = {
    TARGET: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", glow: "shadow-[0_0_30px_rgba(34,197,94,0.2)]" },
    WATCH: { bg: "bg-[#F5C84C]/10", text: "text-[#F5C84C]", border: "border-[#F5C84C]/30", glow: "shadow-[0_0_30px_rgba(245,200,76,0.2)]" },
    AVOID: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", glow: "shadow-[0_0_30px_rgba(239,68,68,0.2)]" },
  };

  const config = signalConfig[player.category as keyof typeof signalConfig] || signalConfig.WATCH;

  const shortReason = player.recommendation_short
    ? cleanAiText(player.recommendation_short)
    : player.summary_short
    ? cleanAiText(player.summary_short)
    : "No AI analysis available";

  const longReason = player.summary_long
    ? cleanAiText(player.summary_long)
    : player.ai_recommendation
    ? cleanAiText(player.ai_recommendation)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-[#0D0D0D] border-l border-white/10 z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className={`sticky top-0 bg-[#0D0D0D] border-b ${config.border} p-6 ${config.glow}`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">{player.player_name}</h2>
              <p className="text-sm text-white/60">{player.team} · {player.position}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          <div className={`inline-block px-3 py-1.5 text-xs font-bold border rounded ${config.bg} ${config.text} ${config.border}`}>
            {player.category}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-4">
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
              label="Edge"
              value={`${delta > 0 ? '+' : ''}${Math.round(delta)}`}
              color={delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}
            />
          </div>

          {/* AI Why (Short) */}
          <div>
            <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">AI Analysis</h3>
            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
              <p className="text-sm text-white/90 leading-relaxed">{shortReason}</p>
            </div>
          </div>

          {/* AI Extended (Full) */}
          {longReason && (
            <div>
              <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">Extended Analysis</h3>
              <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{longReason}</p>
              </div>
            </div>
          )}

          {/* Additional Stats */}
          {player.value_score && (
            <div>
              <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">Advanced Metrics</h3>
              <div className="space-y-2">
                <MetricRow label="Value Score" value={Math.round(player.value_score)} />
                {player.ceiling && <MetricRow label="Ceiling" value={Math.round(player.ceiling)} />}
                {player.risk_pct && <MetricRow label="Risk %" value={`${Math.round(player.risk_pct)}%`} />}
                {player.volatility_level && <MetricRow label="Volatility" value={player.volatility_level} />}
              </div>
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
      <div className="text-xs text-white/40 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
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
