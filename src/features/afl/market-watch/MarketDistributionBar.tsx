import { memo, useMemo, useState } from "react";

interface MarketDistributionBarProps {
  targetCount: number;
  watchCount: number;
  avoidCount: number;
}

export const MarketDistributionBar = memo(function MarketDistributionBar({ targetCount, watchCount, avoidCount }: MarketDistributionBarProps) {
  const total = targetCount + watchCount + avoidCount;
  const [tooltip, setTooltip] = useState(false);

  if (total === 0) return null;

  const { targetPct, watchPct, avoidPct } = useMemo(() => ({
    targetPct: (targetCount / total) * 100,
    watchPct: (watchCount / total) * 100,
    avoidPct: (avoidCount / total) * 100,
  }), [targetCount, watchCount, avoidCount, total]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Market Distribution</span>
        <div className="relative">
          <button
            onMouseEnter={() => setTooltip(true)}
            onMouseLeave={() => setTooltip(false)}
            className="text-[10px] text-white/25 hover:text-white/40 transition-colors"
          >
            {total} players
          </button>
          {tooltip && (
            <div className="absolute bottom-full right-0 mb-2 z-40 w-60 bg-[#161616] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl text-xs text-white/60 leading-relaxed pointer-events-none">
              Distribution of players by current market value classification across the full player pool.
            </div>
          )}
        </div>
      </div>

      {/* Visual bar with on-bar labels */}
      <div className="flex h-5 rounded-lg overflow-hidden bg-white/[0.04] gap-px">
        {targetCount > 0 && (
          <div
            className="bg-green-500/70 flex items-center justify-center transition-all duration-500 relative overflow-hidden"
            style={{ width: `${targetPct}%` }}
          >
            {targetPct >= 12 && (
              <span className="text-[9px] font-bold text-green-100 whitespace-nowrap">
                Target {targetPct.toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {watchCount > 0 && (
          <div
            className="bg-[#F5C84C]/60 flex items-center justify-center transition-all duration-500"
            style={{ width: `${watchPct}%` }}
          >
            {watchPct >= 12 && (
              <span className="text-[9px] font-bold text-yellow-900 whitespace-nowrap">
                Watch {watchPct.toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {avoidCount > 0 && (
          <div
            className="bg-orange-500/50 flex items-center justify-center transition-all duration-500"
            style={{ width: `${avoidPct}%` }}
          >
            {avoidPct >= 12 && (
              <span className="text-[9px] font-bold text-orange-100 whitespace-nowrap">
                Avoid {avoidPct.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Legend row */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-green-500/70 rounded-sm" />
          <span className="text-white/40">Target</span>
          <span className="text-green-400 font-bold tabular-nums">{targetCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-[#F5C84C]/60 rounded-sm" />
          <span className="text-white/40">Watch</span>
          <span className="text-[#F5C84C] font-bold tabular-nums">{watchCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-orange-500/50 rounded-sm" />
          <span className="text-white/40">Avoid</span>
          <span className="text-orange-400 font-bold tabular-nums">{avoidCount}</span>
        </div>
      </div>
    </div>
  );
});
