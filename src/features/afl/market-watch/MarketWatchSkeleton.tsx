import { TrendingUp } from "lucide-react";

function SkeletonRail({ label }: { label: string }) {
  return (
    <div className="mb-8">
      <div className="px-1 mb-3 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
        <div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        <div className="flex gap-3 px-4 py-4 pb-5 overflow-hidden">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-[260px] flex-shrink-0 rounded-xl border border-white/5 bg-white/[0.02] p-4 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-3 bg-white/10 rounded" />
                <div className="flex-1 h-3.5 bg-white/10 rounded" />
                <div className="w-8 h-4 bg-white/8 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="h-10 bg-white/[0.04] rounded-lg" />
                <div className="h-10 bg-white/[0.04] rounded-lg" />
                <div className="h-10 bg-white/[0.04] rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-10 bg-white/[0.04] rounded-lg" />
                <div className="h-10 bg-white/[0.04] rounded-lg" />
                <div className="h-10 bg-white/[0.04] rounded-lg" />
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                <div className="h-2.5 w-14 bg-white/8 rounded" />
                <div className="h-4 w-8 bg-white/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const RAIL_LABELS = [
  "Buy Targets",
  "Sell Now",
  "Consider Selling",
  "Cash Cows",
  "Fade / Traps",
];

export function MarketWatchSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-5 w-5 text-[#F5C84C]" />
              <h1 className="text-2xl font-bold tracking-tight text-white">Market Watch</h1>
            </div>
            <p className="text-sm text-white/45">
              Neeko Trade Intelligence — loading signals...
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.015] h-14 animate-pulse" />

        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.015] h-20 animate-pulse" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="h-20 rounded-xl border border-white/5 bg-white/[0.02] animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.015] h-32 animate-pulse" />

        {RAIL_LABELS.map((label) => (
          <SkeletonRail key={label} label={label} />
        ))}
      </div>
    </div>
  );
}
