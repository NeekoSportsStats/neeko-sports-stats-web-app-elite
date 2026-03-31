import React, { useMemo } from "react";
import type { PlayerRow, StatLens } from "../Section-1-master-table/MasterTable";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function safeNum(n: any): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function mean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stdev(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v =
    vals.reduce((acc, x) => acc + (x - m) * (x - m), 0) /
    Math.max(1, vals.length - 1);
  return Math.sqrt(v);
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function roundLabels(total: number, prefix: string) {
  const out: string[] = [];
  for (let i = 1; i <= total; i++) out.push(`${prefix}${i}`);
  return out;
}

function volLabel(v: number) {
  // Tuned for low-scoring EPL outputs.
  if (v >= 1.25) return { label: "High", tone: "text-red-300" };
  if (v >= 0.65) return { label: "Medium", tone: "text-yellow-300" };
  return { label: "Low", tone: "text-emerald-300" };
}

function aiSummary(statKey: string, avg: number, v: number) {
  const stat = String(statKey).toLowerCase();
  const vol = volLabel(v).label.toLowerCase();

  if (stat.includes("fantasy")) {
    if (avg >= 45)
      return `Fantasy scoring is elite with ${vol} volatility — consistent involvement across goals, assists, and shot volume.`;
    if (avg >= 30)
      return `Fantasy output is strong with ${vol} volatility; ceiling games driven by multi-stat contributions.`;
    return `Fantasy scoring is ${vol}; expect matchup-driven swings tied to role, shot quality, and chance creation.`;
  }
  if (stat.includes("xg")) {
    return `Chance quality is ${vol}; xG stability tends to improve with consistent shot volume and central touches.`;
  }
  if (stat.includes("shotsontarget")) {
    return `Finishing accuracy looks ${vol}; watch for matchup-driven swings in on-target volume.`;
  }
  if (stat.includes("shots")) {
    return `Shot volume is ${vol}; sustained pressure usually shows up as repeatable shooting opportunities.`;
  }
  if (stat.includes("assists")) {
    return `Chance creation is ${vol}; role and set-piece involvement can drive spike weeks.`;
  }
  if (stat.includes("goals")) {
    if (avg >= 0.6)
      return `Goal output is strong with ${vol} volatility — ceiling games appear when service quality holds.`;
    return `Goal output is ${vol}; expect swings tied to shot quality, role, and opponent defensive strength.`;
  }

  return `Performance profile is ${vol}; premium unlock will later add matchup flags and role notes.`;
}

function hitRate(series: number[], threshold: number) {
  if (!series.length) return 0;
  const hits = series.filter((v) => v >= threshold).length;
  return hits / series.length;
}

/* -------------------------------------------------------------------------- */
/* EPL Player Insights Content                                                */
/* -------------------------------------------------------------------------- */

export default function PlayerInsightsContent({
  player,
  selectedStat,
  isPremium = false,
}: {
  player: PlayerRow;
  selectedStat: StatLens;
  isPremium?: boolean;
}) {
  const series: number[] = useMemo(() => {
    const anyPlayer: any = player;

    // Preferred shape: player.stats[lens] = number[]
    const byStats = anyPlayer?.stats?.[selectedStat];
    if (Array.isArray(byStats)) return byStats.map((x: any) => safeNum(x) ?? 0);

    // Fallback legacy shapes (only if they exist)
    if (
      selectedStat === ("fantasy" as any) &&
      Array.isArray(anyPlayer.roundsFantasy)
    )
      return anyPlayer.roundsFantasy;
    if (
      selectedStat === ("disposals" as any) &&
      Array.isArray(anyPlayer.roundsDisposals)
    )
      return anyPlayer.roundsDisposals;
    if (
      selectedStat === ("goals" as any) &&
      Array.isArray(anyPlayer.roundsGoals)
    )
      return anyPlayer.roundsGoals;

    return [];
  }, [player, selectedStat]);

  const cfg: any = EPL_STAT_CONFIG as any;

  const label = cfg?.labels?.[selectedStat] ?? String(selectedStat);
  const unitShort =
    cfg?.unitsShort?.[selectedStat] ?? cfg?.units?.[selectedStat] ?? "";

  const totalRounds: number = cfg?.sportMeta?.rounds ?? 38;
  const roundPrefix: string = cfg?.sportMeta?.roundLabel ?? "GW";
  const labels = useMemo(
    () => roundLabels(totalRounds, roundPrefix),
    [totalRounds, roundPrefix]
  );

  const cleaned = useMemo(
    () => series.map((v) => safeNum(v) ?? 0),
    [series]
  );

  const last = cleaned.at(-1);
  const avg = mean(cleaned);
  const total = cleaned.reduce((a, b) => a + b, 0);
  const min = cleaned.length ? Math.min(...cleaned) : 0;
  const max = cleaned.length ? Math.max(...cleaned) : 0;
  const v = stdev(cleaned);
  const vol = volLabel(v);

  const l5 = cleaned.slice(-5);
  const avgL5 = mean(l5);

  const thresholds: number[] = (cfg?.playerThresholds?.[selectedStat] ??
    cfg?.thresholds?.player?.[selectedStat] ??
    []) as number[];

  const PREVIEW_ROUNDS = 10;
  const showRounds = isPremium ? totalRounds : Math.min(totalRounds, PREVIEW_ROUNDS);

  if (!player) {
    return (
      <div className="p-4 text-sm text-neutral-400">Player not found.</div>
    );
  }

  if (!cleaned.length) {
    return (
      <div className="p-4 text-sm text-neutral-400">
        No {label} history available for this player yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top summary */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          {label} • Summary
        </div>

        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Latest
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {typeof last === "number" ? last.toFixed(1) : "—"}
              {unitShort ? (
                <span className="ml-1 text-xs font-medium text-neutral-400">
                  {unitShort}
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Season Avg
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {avg.toFixed(1)}
            </div>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Last 5 Avg
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {avgL5.toFixed(1)}
            </div>
          </div>
        </div>

        {!isPremium && (
          <div className="mt-3 text-xs text-neutral-400">
            Upgrade to Neeko+ to unlock matchup flags, volatility modelling, and role notes.
          </div>
        )}
      </div>

      {/* Round-by-round grid */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            {roundPrefix} by {roundPrefix} — {label}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-600">
            {labels[0]} → {labels[labels.length - 1]}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-2">
          {labels.slice(0, showRounds).map((r, i) => {
            const v = cleaned[i] ?? 0;
            return (
              <div
                key={r}
                className="rounded-xl border border-neutral-800 bg-black/40 p-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                  {r}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {Number.isFinite(v) ? Number(v).toFixed(0) : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {!isPremium && totalRounds > PREVIEW_ROUNDS ? (
          <div className="mt-3 text-xs text-neutral-400">
            Upgrade to Neeko+ to view all rounds.
          </div>
        ) : null}
      </div>

      {/* Season summary */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Season summary — {label}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Min
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {min.toFixed(0)}
            </div>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Max
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {max.toFixed(0)}
            </div>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Games
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {cleaned.length}
            </div>
          </div>

          <div className="rounded-xl bg-black/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Total
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {total.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-neutral-400">
          Volatility: <span className={vol.tone}>{vol.label}</span>{" "}
          <span className="text-neutral-600">({v.toFixed(2)})</span>
        </div>
      </div>

      {/* AI performance summary */}
      <div className="rounded-2xl border border-yellow-500/20 bg-neutral-950/60 p-4 shadow-[0_0_60px_rgba(250,204,21,0.15)]">
        <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/80">
          AI performance summary
        </div>
        <div className="mt-2 text-sm text-neutral-200">
          {aiSummary(String(selectedStat), avg, v)}
        </div>
      </div>

      {/* Hit-rate ladder */}
      {thresholds.length ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            Hit-rate ladder
          </div>

          <div className="mt-3 space-y-2">
            {thresholds.map((t) => {
              const hr = hitRate(cleaned, t);
              const pct = Math.round(hr * 100);
              return (
                <div key={t} className="flex items-center gap-3">
                  <div className="w-10 shrink-0 text-xs text-neutral-300">
                    {t}+
                  </div>
                  <div className="relative h-2 flex-1 rounded-full bg-black/40 border border-neutral-800 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-yellow-300"
                      style={{ width: `${clamp01(hr) * 100}%` }}
                    />
                  </div>
                  <div className="w-10 shrink-0 text-right text-xs text-neutral-300">
                    {pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Recent history chips */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          Recent history
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {cleaned.slice(-10).map((v, i) => (
            <span
              key={`${String(selectedStat)}-${i}`}
              className="rounded-full bg-black/45 px-3 py-1 text-xs text-neutral-200 border border-neutral-800"
            >
              {Number(v).toFixed(0)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
