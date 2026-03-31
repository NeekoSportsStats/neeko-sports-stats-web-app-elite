import React from "react";
import PlayerGridCard from "../Section-8-player-card/PlayerGridCard";
import { Player } from "../data/useAFLMockData";

export interface MoversEntry {
  player: Player;
  series: number[];
  avg: number;
  vol: number;
  consistency: number;
}

interface Props {
  risers: MoversEntry[];
  fallers: MoversEntry[];
}

export default function MoversDualColumn({ risers, fallers }: Props) {
  return (
    <div className="mt-10 grid md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-sm font-semibold text-emerald-300 mb-3">
          📈 Form Risers
        </h3>
        <div className="grid gap-3">
          {risers.map((r, i) => (
            <PlayerGridCard
              key={i}
              player={r.player}
              statSeries={r.series}
              avg={r.avg}
              vol={r.vol}
              consistency={r.consistency}
              highlight="hot"
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-red-300 mb-3">
          📉 Form Fallers
        </h3>
        <div className="grid gap-3">
          {fallers.map((f, i) => (
            <PlayerGridCard
              key={i}
              player={f.player}
              statSeries={f.series}
              avg={f.avg}
              vol={f.vol}
              consistency={f.consistency}
              highlight="cold"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
