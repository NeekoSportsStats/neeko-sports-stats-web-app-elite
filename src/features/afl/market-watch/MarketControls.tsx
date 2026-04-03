import { memo, useMemo, useState } from "react";
import { Filter, Lock } from "lucide-react";
import { track } from "@/lib/analytics";

export type MarketFilter = "ALL" | "TARGET" | "WATCH" | "AVOID";

interface MarketControlsProps {
  activeFilter: MarketFilter;
  onFilterChange: (filter: MarketFilter) => void;
  targetCount: number;
  watchCount: number;
  avoidCount: number;
  isPremium: boolean;
}

export const MarketControls = memo(function MarketControls({
  activeFilter,
  onFilterChange,
  targetCount,
  watchCount,
  avoidCount,
  isPremium,
}: MarketControlsProps) {
  const [lockedToast, setLockedToast] = useState(false);

  const filters = useMemo(() => [
    { label: "All", value: "ALL" as MarketFilter, count: targetCount + watchCount + avoidCount, color: "text-white/70", locked: false },
    { label: "Target", value: "TARGET" as MarketFilter, count: targetCount, color: "text-green-400", locked: true },
    { label: "Watch", value: "WATCH" as MarketFilter, count: watchCount, color: "text-[#F5C84C]", locked: true },
    { label: "Avoid", value: "AVOID" as MarketFilter, count: avoidCount, color: "text-red-400", locked: true },
  ], [targetCount, watchCount, avoidCount]);

  function handleClick(filter: MarketFilter, isLocked: boolean) {
    if (filter === "ALL") {
      onFilterChange("ALL");
      return;
    }
    if (!isPremium && isLocked) {
      track("filter_locked_click", { filter });
      setLockedToast(true);
      setTimeout(() => setLockedToast(false), 3000);
      return;
    }
    track("filter_used", { filter });
    onFilterChange(filter);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-white/40">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Filter:</span>
        </div>

        {filters.map((filter) => {
          const isEffectivelyLocked = !isPremium && filter.locked;
          const isActive = activeFilter === filter.value;

          return (
            <button
              key={filter.value}
              onClick={() => handleClick(filter.value, filter.locked)}
              title={isEffectivelyLocked ? "Filtering is a Neeko+ feature" : undefined}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all duration-150 ${
                isEffectivelyLocked
                  ? "opacity-50 cursor-pointer text-white/30 bg-white/[0.02] border-white/[0.06] hover:opacity-70"
                  : isActive
                  ? `${filter.color} bg-white/10 border-white/20`
                  : "text-white/40 bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:text-white/60"
              }`}
            >
              {filter.label}
              <span className="opacity-60">({filter.count})</span>
              {isEffectivelyLocked && (
                <Lock className="w-3 h-3 text-white/30 ml-0.5" />
              )}
            </button>
          );
        })}

        <div className="ml-auto text-[10px] text-white/20 font-medium">
          Sorted by signal strength
        </div>
      </div>

      {/* Locked toast */}
      {lockedToast && (
        <div className="absolute top-full left-0 mt-2 z-40 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2.5 bg-[#161616] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl">
            <Lock className="w-4 h-4 text-white/40 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Filtering is a Neeko+ feature</p>
              <a
                href="/billing"
                onClick={() => track("filter_locked_upgrade_click")}
                className="text-xs text-white/50 hover:text-white underline underline-offset-2 transition-colors"
              >
                Upgrade to unlock filters
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
