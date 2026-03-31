import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, Minus, TrendingDown, Info } from "lucide-react";
import type { StatKey } from "@/lib/stats/types";
import {
  getFormStabilityGridData,
  type FormStabilityRow,
  type FormStabilityGridData,
} from "@/features/afl/players/data/getFormStabilityGridData";

type CategoryType = "hot" | "stable" | "cold";

interface CategoryConfig {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: {
    border: string;
    glow: string;
    text: string;
    badge: string;
    iconBg: string;
  };
}

const CATEGORY_CONFIG: Record<CategoryType, CategoryConfig> = {
  hot: {
    title: "Trending Up",
    subtitle: "Players outperforming their season baseline",
    icon: TrendingUp,
    color: {
      border: "border-emerald-400/50",
      glow: "shadow-[0_0_16px_rgba(52,211,153,0.14)]",
      text: "text-emerald-400",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
      iconBg: "from-emerald-400/20 to-emerald-600/10",
    },
  },
  stable: {
    title: "Stable",
    subtitle: "Consistent output relative to season norms",
    icon: Minus,
    color: {
      border: "border-amber-400/50",
      glow: "shadow-[0_0_16px_rgba(251,191,36,0.14)]",
      text: "text-amber-400",
      badge: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      iconBg: "from-amber-400/20 to-amber-600/10",
    },
  },
  cold: {
    title: "Trending Down",
    subtitle: "Recent form below season expectations",
    icon: TrendingDown,
    color: {
      border: "border-orange-400/50",
      glow: "shadow-[0_0_16px_rgba(251,146,60,0.14)]",
      text: "text-orange-400",
      badge: "bg-orange-500/20 text-orange-300 border-orange-400/40",
      iconBg: "from-orange-400/20 to-orange-600/10",
    },
  },
};

function filterAndCategorize(rows: FormStabilityRow[]) {
  const hot = rows
    .filter((row) => row.trend_label === "Trending Up")
    .slice(0, 5);

  const stable = rows
    .filter((row) => row.trend_label === "Stable")
    .slice(0, 5);

  const cold = rows
    .filter((row) => row.trend_label === "Trending Down")
    .slice(0, 5);

  return { hot, stable, cold };
}

function PlayerCard({
  row,
  category,
  isExpanded,
  onToggle,
}: {
  row: FormStabilityRow;
  category: CategoryType;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const diffValue = row.trend_diff;
  const diffSign = diffValue >= 0 ? "+" : "";

  return (
    <div className="group relative">
      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left relative overflow-hidden rounded-xl border-l-2 border-r border-t border-b px-4 py-3.5",
          "bg-gradient-to-br from-black/60 via-black/50 to-black/40 backdrop-blur-sm",
          "transition-all duration-200 cursor-pointer",
          "hover:bg-white/[0.03]",
          config.color.border,
          `hover:${config.color.glow}`
        )}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Icon className={cn("h-4 w-4 flex-shrink-0", config.color.text)} />
              <h3 className="text-sm font-medium text-white leading-tight truncate">
                {row.player_name}
              </h3>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border flex-shrink-0",
                config.color.badge
              )}
            >
              {diffSign}
              {diffValue.toFixed(1)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">
              Score: {Math.round(row.stability_score)}
            </span>
            {!isExpanded && (
              <span className="text-[9px] text-white/30 uppercase tracking-wider">
                Tap to expand
              </span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div
            className="mt-3 pt-3 border-t border-white/10 space-y-3 animate-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">
                  Stability Score
                </span>
                <span className={cn("text-lg font-bold tabular-nums", config.color.text)}>
                  {Math.round(row.stability_score)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    config.color.text.replace("text-", "bg-")
                  )}
                  style={{ width: `${Math.min(100, row.stability_score)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-white/40 block mb-1">Recent Avg</span>
                <span className={cn("font-semibold text-base", config.color.text)}>
                  {row.recent_avg.toFixed(1)}
                </span>
              </div>
              <div>
                <span className="text-white/40 block mb-1">Season Avg</span>
                <span className="text-white/90 font-semibold text-base">
                  {row.season_avg.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Variance</span>
                <span className="text-white/90 font-medium">{row.variance.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Games Used</span>
                <span className="text-white/90 font-medium">{row.games_used} games</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/40">Confidence</span>
                <span className="text-white/90 font-medium">{row.confidence_label}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-2 border-t border-white/10">
              <Info className="h-3 w-3 text-white/30 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-white/60 leading-relaxed">
                {category === "hot" &&
                  "Outperforming season baseline by significant margin"}
                {category === "stable" &&
                  "Maintaining consistent output near season average"}
                {category === "cold" &&
                  "Recent form trending below season expectations"}
              </p>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

function CategoryColumn({
  category,
  rows,
  expandedId,
  onToggle,
}: {
  category: CategoryType;
  rows: FormStabilityRow[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-sm",
        config.color.border,
        config.color.glow
      )}
    >
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br flex-shrink-0",
            config.color.iconBg
          )}
        >
          <Icon className={cn("h-4.5 w-4.5", config.color.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn("text-base font-bold", config.color.text)}>{config.title}</h3>
          <p className="text-[10px] text-white/50 mt-0.5 leading-tight">{config.subtitle}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-xs text-white/40 leading-relaxed">
              No players available
            </p>
            <p className="text-[10px] text-white/20 mt-1.5">
              Check back after more games
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <PlayerCard
              key={row.player_name}
              row={row}
              category={category}
              isExpanded={expandedId === row.player_name}
              onToggle={() => onToggle(row.player_name)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function FormStabilityGrid() {
  const [selectedStat, setSelectedStat] = useState<StatKey>("fantasy");
  const [data, setData] = useState<FormStabilityGridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setExpandedRowId(null);
      try {
        const res = await getFormStabilityGridData({
          season: 2025,
          stat: selectedStat,
        });
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load stability data");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedStat]);

  const statLabels: Record<StatKey, string> = {
    fantasy: "Fantasy Points",
    disposals: "Disposals",
    goals: "Goals",
  };

  const categories = data ? filterAndCategorize(data.rows) : { hot: [], stable: [], cold: [] };

  return (
    <section
      className={cn(
        "relative rounded-3xl border px-5 py-7 md:px-7 md:py-9 overflow-hidden",
        "bg-gradient-to-br from-[#050507] via-black to-[#0d0d0f]",
        "border-white/10 shadow-[0_0_48px_rgba(251,191,36,0.08),0_0_96px_rgba(251,191,36,0.04)]"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10">
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/10 shadow-lg shadow-amber-400/20 flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Form Stability Analysis
              </h2>
              <p className="text-sm text-white/70 mt-2 leading-relaxed">
                Comparative view of trending performers, stable contributors, and underperforming players
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {(["fantasy", "disposals", "goals"] as StatKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStat(s)}
              className={cn(
                "rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-200",
                "backdrop-blur-sm",
                selectedStat === s
                  ? "bg-gradient-to-r from-white/90 to-white/80 text-black shadow-[0_0_24px_rgba(255,255,255,0.4)] scale-105"
                  : "border border-white/20 bg-white/5 text-white/70 hover:border-white/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_16px_rgba(255,255,255,0.2)] hover:scale-102"
              )}
            >
              {statLabels[s]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((col) => (
              <div
                key={col}
                className="rounded-2xl border border-white/10 p-5 bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                  <div className="h-9 w-9 rounded-full bg-white/5 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                    <div className="h-2 w-32 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 bg-gradient-to-br from-black/60 via-black/50 to-black/40 px-4 py-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                        <div className="h-5 w-12 bg-white/5 rounded-full animate-pulse" />
                      </div>
                      <div className="h-2 w-20 bg-white/5 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 backdrop-blur-sm">
            <p className="text-sm font-semibold text-red-400">Failed to load stability data</p>
            <p className="mt-2 text-xs text-red-300/70">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {categories.hot.length === 0 &&
            categories.stable.length === 0 &&
            categories.cold.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur-sm">
                <TrendingUp className="h-12 w-12 text-white/20 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white/70">
                  Insufficient data for analysis
                </p>
                <p className="mt-2 text-xs text-white/50">
                  Players need at least 5 games to appear in the stability analysis
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <CategoryColumn
                  category="hot"
                  rows={categories.hot}
                  expandedId={expandedRowId}
                  onToggle={(id) => setExpandedRowId(expandedRowId === id ? null : id)}
                />
                <CategoryColumn
                  category="stable"
                  rows={categories.stable}
                  expandedId={expandedRowId}
                  onToggle={(id) => setExpandedRowId(expandedRowId === id ? null : id)}
                />
                <CategoryColumn
                  category="cold"
                  rows={categories.cold}
                  expandedId={expandedRowId}
                  onToggle={(id) => setExpandedRowId(expandedRowId === id ? null : id)}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
    </section>
  );
}
