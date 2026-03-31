import React from "react";
import PlayerGridCard from "../Section-8-player-card/PlayerGridCard";
import { Player } from "../data/useAFLMockData";

export interface HotColdEntry {
  player: Player;
  series: number[];
  avg: number;
  vol: number;
  consistency: number;
}

interface Props {
  hot: HotColdEntry[];
  cold: HotColdEntry[];
}

export default function HotColdSixGrid({ hot, cold }: Props) {
  return (
    <div className="mt-8 grid md:grid-cols-2 gap-10">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-emerald-300">
          🔥 Top 6 Form Leaders
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hot.slice(0, 6).map((h, i) => (
            <PlayerGridCard
              key={i}
              player={h.player}
              statSeries={h.series}
              avg={h.avg}
              vol={h.vol}
              consistency={h.consistency}
              highlight="hot"
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-red-300">
          ❄️ Coldest 6 Players
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cold.slice(0, 6).map((c, i) => (
            <PlayerGridCard
              key={i}
              player={c.player}
              statSeries={c.series}
              avg={c.avg}
              vol={c.vol}
              consistency={c.consistency}
              highlight="cold"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
