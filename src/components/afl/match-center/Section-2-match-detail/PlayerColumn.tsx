import React from "react";
import type { MatchPlayer } from "../data/types";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type Props = {
  team: string;
  players: MatchPlayer[];
  isConfirmed: boolean;
};

/* -------------------------------------------------------------------------- */
/*                               PLAYER COLUMN                                */
/* -------------------------------------------------------------------------- */

export default function PlayerColumn({
  team,
  players,
  isConfirmed,
}: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white">
          {team}
        </div>

        <div
          className={`text-[10px] uppercase tracking-wide ${
            isConfirmed
              ? "text-emerald-400"
              : "text-amber-400"
          }`}
        >
          {isConfirmed ? "Confirmed" : "Projected"}
        </div>
      </div>

      {/* Players */}
      <ul className="space-y-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center justify-between text-sm text-white/80"
          >
            <span>{player.name}</span>

            {player.position && (
              <span className="text-xs text-white/40">
                {player.position}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
