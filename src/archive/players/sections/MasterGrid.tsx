import MasterTable from "@/components/afl/players/Section-1-master-table/MasterTable";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";
import { cn } from "@/lib/utils";
import { Sparkles, TrendingUp } from "lucide-react";

export default function MasterGrid() {
  return (
    <div className="space-y-6">
      <section
        className={cn(
          "relative rounded-3xl border border-yellow-500/20",
          "bg-gradient-to-br from-black via-[#050507] to-[#14100a]",
          "px-4 py-6 md:px-8 md:py-8",
          "shadow-[0_0_120px_rgba(0,0,0,0.7)] overflow-hidden"
        )}
      >
        <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-[480px] -translate-x-1/2 bg-yellow-500/20 blur-3xl" />

        <div className="relative">
          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3.5 py-1.5 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-yellow-200">
                Master Grid
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Full Season Player Ledger
            </h2>

            <p className="mt-2 text-sm text-white/70 leading-relaxed max-w-2xl">
              Complete round-by-round performance data for all players
            </p>
          </div>

          <MasterTable statConfig={AFL_STAT_CONFIG} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <a
          href="/afl/ai-insights"
          className={cn(
            "group relative rounded-2xl border border-yellow-500/20",
            "bg-gradient-to-br from-yellow-500/10 via-black/80 to-black/80",
            "px-6 py-5 transition-all hover:border-yellow-400/40",
            "hover:shadow-[0_0_30px_rgba(250,204,21,0.3)]"
          )}
        >
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-yellow-500/20 p-3 group-hover:bg-yellow-500/30 transition-colors">
              <TrendingUp className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                Open AFL AI Insights
              </h3>
              <p className="text-sm text-white/60">
                Advanced predictive analytics and player projections
              </p>
            </div>
          </div>
        </a>

        <a
          href="https://www.neekostats.com.au/neeko-plus"
          className={cn(
            "group relative rounded-2xl border border-yellow-500/20",
            "bg-gradient-to-br from-yellow-500/10 via-black/80 to-black/80",
            "px-6 py-5 transition-all hover:border-yellow-400/40",
            "hover:shadow-[0_0_30px_rgba(250,204,21,0.3)]"
          )}
        >
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-yellow-500/20 p-3 group-hover:bg-yellow-500/30 transition-colors">
              <Sparkles className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">
                Open Neeko+
              </h3>
              <p className="text-sm text-white/60">
                Unlock premium features and advanced analytics
              </p>
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
