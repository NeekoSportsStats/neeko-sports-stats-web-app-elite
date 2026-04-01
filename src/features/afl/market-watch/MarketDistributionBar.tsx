import { memo, useMemo } from "react";
import { DerivedPlayer } from "./engine";

interface MarketDistributionBarProps {
  targetCount: number;
  watchCount: number;
  avoidCount: number;
}

export const MarketDistributionBar = memo(function MarketDistributionBar({ targetCount, watchCount, avoidCount }: MarketDistributionBarProps) {
  const total = targetCount + watchCount + avoidCount;

  if (total === 0) return null;

  // MEMOIZE: Percentage calculations
  const { targetPct, watchPct, avoidPct } = useMemo(() => ({
    targetPct: (targetCount / total) * 100,
    watchPct: (watchCount / total) * 100,
    avoidPct: (avoidCount / total) * 100,
  }), [targetCount, watchCount, avoidCount, total]);

  return (
    <div className="space-y-3">
      {/* Visual Bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {targetCount > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${targetPct}%` }}
          />
        )}
        {watchCount > 0 && (
          <div
            className="bg-[#F5C84C] transition-all duration-500"
            style={{ width: `${watchPct}%` }}
          />
        )}
        {avoidCount > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${avoidPct}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-white/60">
              Target <span className="text-green-400 font-bold">{targetPct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-[#F5C84C] rounded-full" />
            <span className="text-white/60">
              Watch <span className="text-[#F5C84C] font-bold">{watchPct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-white/60">
              Avoid <span className="text-red-400 font-bold">{avoidPct.toFixed(0)}%</span>
            </span>
          </div>
        </div>
        <div className="text-white/40">
          {total} total
        </div>
      </div>
    </div>
  );
});
