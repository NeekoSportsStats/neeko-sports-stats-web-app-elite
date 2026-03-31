import React, { useMemo } from "react";
import { X, Lock, TrendingUp, TrendingDown } from "lucide-react";
import type { TeamRow } from "../data/mockTeams";
import type { StatLens } from "../Section-1-master-table/TeamMasterTable";

type Props = {
  team: TeamRow;
  stat: StatLens;
  isPremium: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const avg = (arr: number[]) => {
  if (!arr || arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
};

const lastN = (arr: number[], n: number) => arr.slice(-n);

const deltaPct = (recent: number[], full: number[]) => {
  const r = avg(recent);
  const f = avg(full);
  if (f === 0) return 0;
  return Math.round(((r - f) / f) * 100);
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function TeamInsightsPanel({
  team,
  stat,
  isPremium,
  onClose,
  onUpgrade,
}: Props) {
  const statKey = stat as keyof TeamRow;
  const rawValues = team[statKey];
  const values = Array.isArray(rawValues) ? rawValues : [];

  /* ---------------- DERIVED METRICS ---------------- */

  const seasonAvg = avg(values);
  const last5 = lastN(values, 5);
  const delta = deltaPct(last5, values);

  const consistency = clamp(
    100 - (Math.max(...values) - Math.min(...values)),
    40,
    95
  );

  const bestRound = Math.max(...values);
  const worstRound = Math.min(...values);

  const attackScore = clamp(Math.round(seasonAvg / 10), 40, 95);
  const defenceScore = clamp(100 - attackScore + 10, 40, 95);

  const trendSignals = [
    delta > 5 && "Scoring output trending upward",
    delta < -5 && "Recent output below season average",
    consistency > 75 && "High week-to-week consistency",
    consistency < 60 && "Volatile performance profile",
  ].filter(Boolean) as string[];

  /* -------------------------------------------------------------------------- */

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* PANEL */}
      <div className="relative ml-auto h-full w-full max-w-[460px] bg-black border-l border-yellow-500/30 shadow-2xl overflow-y-auto">
        {/* HEADER */}
        <div className="sticky top-0 z-10 bg-black px-6 py-5 border-b border-neutral-800">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-300">
                Team Insights
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-100">
                {team.name}
              </div>
              <div className="text-xs text-neutral-500">{team.code}</div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-neutral-800"
            >
              <X className="h-4 w-4 text-neutral-400" />
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div className="px-6 py-6 space-y-8">
          {/* SEASON PULSE */}
          <div className="rounded-2xl border border-yellow-500/30 bg-black/70 p-5">
            <div className="text-xs uppercase tracking-wide text-neutral-400">
              Season Average
            </div>
            <div className="mt-1 text-3xl font-bold text-yellow-300">
              {seasonAvg}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-neutral-300">
                {delta >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-orange-400" />
                )}
                <span>{Math.abs(delta)}% vs season</span>
              </div>

              <div className="text-neutral-500">
                Consistency {consistency}
              </div>
            </div>
          </div>

          {/* ROUND STRIP */}
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-neutral-400">
              Round Performance
            </div>
            <div className="flex gap-1">
              {values.map((v, i) => (
                <div
                  key={i}
                  className={`h-10 w-3 rounded-sm ${
                    v === bestRound
                      ? "bg-yellow-400"
                      : v === worstRound
                      ? "bg-neutral-700"
                      : "bg-neutral-600"
                  }`}
                  title={`Round ${i + 1}: ${v}`}
                />
              ))}
            </div>
          </div>

          {/* AXES */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Attack", value: attackScore },
              { label: "Defence", value: defenceScore },
              { label: "Consistency", value: consistency },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-neutral-800 bg-black/60 p-4"
              >
                <div className="text-[10px] uppercase text-neutral-400">
                  {c.label}
                </div>
                <div className="mt-1 text-xl font-semibold text-neutral-100">
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* TREND SIGNALS */}
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-neutral-400">
              Trend Signals
            </div>

            <div className="space-y-2">
              {trendSignals.map((t, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-neutral-800 bg-black/60 px-4 py-3 text-sm text-neutral-300"
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* PREMIUM LOCK */}
          {!isPremium && (
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-yellow-500/30">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent animate-[shimmer_2.2s_linear_infinite]" />
              <div className="relative bg-black/80 backdrop-blur-md px-6 py-6 text-center">
                <Lock className="mx-auto h-6 w-6 text-yellow-400" />
                <div className="mt-3 text-sm font-semibold text-yellow-200">
                  Unlock full team insights
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  Trends, form breakdowns & season analysis
                </div>

                <button
                  onClick={onUpgrade}
                  className="mt-4 rounded-full border border-yellow-500/40 px-6 py-2 text-sm text-yellow-300 hover:bg-yellow-500/10 hover:shadow-[0_0_18px_rgba(250,204,21,0.4)] transition"
                >
                  Upgrade to Neeko+
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
