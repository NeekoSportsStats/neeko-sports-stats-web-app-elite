import React, { useMemo } from "react";
import type { TeamRow } from "../data/mockTeams";
import type { StatLens } from "../Section-1-master-table/TeamMasterTable";
import type { StatConfig, EPLStatKey } from "@/lib/stats/types";

function getValues(team: TeamRow, stat: StatLens): number[] {
  const values = (team as any)[stat];
  return Array.isArray(values) ? values : [];
}

function calcStats(values: number[]) {
  if (!values.length) {
    return { avg: 0, min: 0, max: 0, games: 0, volatility: 0, total: 0 };
  }
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const volatility = max - min;

  return {
    avg: Math.round(avg * 10) / 10,
    min,
    max,
    games: values.length,
    volatility,
    total,
  };
}

function volatilityLabel(v: number) {
  if (v >= 400) return { label: "High", color: "text-red-400" };
  if (v >= 250) return { label: "Medium", color: "text-yellow-400" };
  return { label: "Low", color: "text-emerald-400" };
}

function hitRate(values: number[], threshold: number) {
  if (!values.length) return 0;
  const hits = values.filter((v) => v >= threshold).length;
  return Math.round((hits / values.length) * 100);
}

export default function TeamInsightsContent({
  team,
  selectedStat,
  isPremium,
  statConfig,
}: {
  team: TeamRow;
  selectedStat: StatLens;
  isPremium: boolean;
  statConfig: StatConfig<EPLStatKey>;
}) {
  const values = useMemo(
    () => getValues(team, selectedStat),
    [team, selectedStat]
  );

  const stats = useMemo(() => calcStats(values), [values]);
  const volatility = volatilityLabel(stats.volatility);
  const thresholds = statConfig.teamThresholds[selectedStat] ?? [];
  const recent = values.slice(-5);

  const aiSummary = useMemo(() => {
    if (stats.volatility >= 400) {
      return "Team output shows wide scoring swings, suggesting matchup sensitivity and variable week-to-week ceilings.";
    }
    if (stats.volatility >= 250) {
      return "Team performance is moderately stable with occasional ceiling games driven by favorable conditions.";
    }
    return "Team output is highly consistent, supported by a strong baseline and limited downside variance.";
  }, [stats.volatility]);

  return (
    <div className="px-6 pb-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          Season Average
        </div>
        <div className="mt-1 text-3xl font-semibold text-yellow-300">
          {stats.avg}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-black/60 p-3">
          <div className="text-[10px] uppercase text-neutral-400">Attack</div>
          <div className="mt-1 text-lg text-neutral-100">
            {Math.round((stats.avg / stats.max) * 100)}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-black/60 p-3">
          <div className="text-[10px] uppercase text-neutral-400">Defence</div>
          <div className="mt-1 text-lg text-neutral-100">
            {Math.round(100 - stats.volatility / 10)}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-black/60 p-3">
          <div className="text-[10px] uppercase text-neutral-400">
            Consistency
          </div>
          <div className="mt-1 text-lg text-neutral-100">
            {Math.max(0, 100 - Math.round(stats.volatility / 10))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mb-2">
          Recent Form (Last 5)
        </div>
        <div className="flex gap-2">
          {recent.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-lg border border-neutral-800 bg-black/60 py-2 text-center text-sm text-neutral-100"
            >
              {v}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black/70 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            Season Summary — {statConfig.labels[selectedStat]}
          </div>
          <div className="text-sm text-yellow-300 font-semibold">
            {stats.avg}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-neutral-400">Min</div>
          <div className="text-neutral-100 text-right">{stats.min}</div>

          <div className="text-neutral-400">Max</div>
          <div className="text-neutral-100 text-right">{stats.max}</div>

          <div className="text-neutral-400">Games</div>
          <div className="text-neutral-100 text-right">{stats.games}</div>

          <div className="text-neutral-400">Total</div>
          <div className="text-neutral-100 text-right">{stats.total}</div>

          <div className="text-neutral-400">Volatility</div>
          <div className={`text-right ${volatility.color}`}>
            {volatility.label} ({stats.volatility})
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black/60 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mb-2">
          AI Performance Summary
        </div>
        <p className="text-sm text-neutral-300 leading-relaxed">
          {aiSummary}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black/70 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 mb-3">
          Hit-Rate Ladder
        </div>

        <div className="space-y-2">
          {thresholds.map((t) => {
            const r = hitRate(values, t);
            return (
              <div key={t} className="flex items-center gap-3">
                <div className="w-10 text-[10px] text-neutral-400">
                  {t}+
                </div>
                <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-orange-400"
                    style={{ width: `${r}%` }}
                  />
                </div>
                <div className="w-10 text-right text-[10px] text-neutral-300">
                  {r}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isPremium && (
        <div className="text-[11px] text-neutral-500 text-center pt-2">
          Upgrade to Neeko+ to unlock deeper matchup-adjusted insights.
        </div>
      )}
    </div>
  );
}
