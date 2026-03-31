import React from "react";
import { Player } from "../data/useEPLMockData";
import TrendSparklineMini from "../Section-3-stability-analysis/TrendSparklineMini";
import MiniTrendChips from "../Section-4-trend-insights/MiniTrendChips";

interface Props {
  player: Player;
  statSeries: number[];
  avg: number;
  vol: number;
  consistency: number;
  highlight?: "hot" | "cold" | "neutral";
}

export default function PlayerGridCard({
  player,
  statSeries,
  avg,
  vol,
  consistency,
  highlight = "neutral",
}: Props) {
  const border =
    highlight === "hot"
      ? "border-emerald-400/40 shadow-[0_0_16px_rgba(16,185,129,0.4)]"
      : highlight === "cold"
      ? "border-red-400/40 shadow-[0_0_16px_rgba(248,113,113,0.4)]"
      : "border-neutral-800";

  return (
    <div
      className={`rounded-xl border ${border} bg-neutral-950/90 p-3 flex flex-col gap-3 hover:scale-[1.015] transition-all`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-100">
          {player.name}
        </h3>
        <span className="text-[10px] text-neutral-500">
          {player.pos} • {player.team}
        </span>
      </div>

      <TrendSparklineMini values={statSeries} />

      <MiniTrendChips avg={avg} vol={vol} consistency={consistency} />

      <a
        href={`/sports/afl/player/${player.id}`}
        className="mt-auto text-[11px] text-yellow-300 underline underline-offset-2"
      >
        View player profile →
      </a>
    </div>
  );
}
