import React, { useMemo } from "react";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";
import type { NBAStatKey } from "@/lib/stats/types";

type PlayerRow = {
  id: number;
  name: string;
  team: string;
  role: string;
  stats: Record<NBAStatKey, number[]>;
};

type Props = {
  player: PlayerRow;
  selectedStat: NBAStatKey;
};

export default function PlayerInsightsContent({
  player,
  selectedStat,
}: Props) {
  const series = player?.stats?.[selectedStat] ?? [];

  const summary = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        total: 0,
        volatility: "N/A",
      };
    }

    const total = series.reduce((a, b) => a + b, 0);
    const avg = total / series.length;

    const variance = series.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / series.length;
    const stdDev = Math.sqrt(variance);

    return {
      min: Math.min(...series),
      max: Math.max(...series),
      avg,
      total,
      volatility: stdDev > 8 ? "High" : stdDev > 4 ? "Medium" : "Low",
    };
  }, [series]);

  const gameLabel = NBA_STAT_CONFIG.sportMeta?.roundLabels?.[0]?.replace(/\d+/, "") || "G";

  return (
    <div className="space-y-6">
      {/* GAME BY GAME */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 mb-3">
          Game by Game — {NBA_STAT_CONFIG.labels[selectedStat]}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {series.slice(0, 10).map((v, i) => (
            <div
              key={i}
              className="rounded-lg bg-black/40 border border-neutral-800 py-2 text-center text-sm text-white"
            >
              <div className="text-[9px] text-neutral-500">
                {gameLabel}{i + 1}
              </div>
              {v}
            </div>
          ))}
        </div>

        {series.length > 10 && (
          <div className="mt-2 text-xs text-neutral-500 text-center">
            Showing first 10 of {series.length} games
          </div>
        )}
      </div>

      {/* SUMMARY */}
      <div className="rounded-2xl border border-neutral-800 bg-black/40 p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 mb-3">
          Season Summary — {NBA_STAT_CONFIG.labels[selectedStat]}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-neutral-400 text-xs">Average</div>
            <div className="text-yellow-300 font-semibold">
              {summary.avg.toFixed(1)}{" "}
              {NBA_STAT_CONFIG.units[selectedStat]}
            </div>
          </div>

          <div>
            <div className="text-neutral-400 text-xs">Total</div>
            <div className="text-white font-semibold">
              {summary.total}
            </div>
          </div>

          <div>
            <div className="text-neutral-400 text-xs">Min</div>
            <div className="text-white">{summary.min}</div>
          </div>

          <div>
            <div className="text-neutral-400 text-xs">Max</div>
            <div className="text-white">{summary.max}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-neutral-400">
          Volatility:{" "}
          <span className="text-yellow-300">{summary.volatility}</span>
        </div>
      </div>

      {/* AI SUMMARY */}
      <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-300 mb-2">
          AI Performance Summary
        </div>
        <p className="text-sm text-neutral-300 leading-relaxed">
          {NBA_STAT_CONFIG.labels[selectedStat]} output shows role-driven
          volatility with matchup-dependent ceiling games and a
          controlled scoring floor.
        </p>
      </div>
    </div>
  );
}
