import { Filter } from "lucide-react";

export type MarketFilter = "ALL" | "TARGET" | "WATCH" | "AVOID";

interface MarketControlsProps {
  activeFilter: MarketFilter;
  onFilterChange: (filter: MarketFilter) => void;
  targetCount: number;
  watchCount: number;
  avoidCount: number;
}

export function MarketControls({
  activeFilter,
  onFilterChange,
  targetCount,
  watchCount,
  avoidCount,
}: MarketControlsProps) {
  const filters: { label: string; value: MarketFilter; count: number; color: string }[] = [
    { label: "All", value: "ALL", count: targetCount + watchCount + avoidCount, color: "text-white/60" },
    { label: "Target", value: "TARGET", count: targetCount, color: "text-green-400" },
    { label: "Watch", value: "WATCH", count: watchCount, color: "text-[#F5C84C]" },
    { label: "Avoid", value: "AVOID", count: avoidCount, color: "text-red-400" },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-white/40">
        <Filter className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Filter:</span>
      </div>

      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
            activeFilter === filter.value
              ? `${filter.color} bg-white/10 border-white/20`
              : "text-white/40 bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
          }`}
        >
          {filter.label}
          <span className="ml-1.5 opacity-60">({filter.count})</span>
        </button>
      ))}

      <div className="ml-auto text-[10px] text-white/20 font-medium">
        Sorted by trade priority
      </div>
    </div>
  );
}
