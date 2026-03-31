import React from "react";
import type { FixtureMatch } from "../data/types";
import { formatDateLong } from "../data/utils";

export default function MatchDetailHeader({ match }: { match: FixtureMatch }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">
        {match.roundLabel} · {formatDateLong(match.dateISO)} · {match.timeLocal}
      </div>
      <div className="mt-2 grid grid-cols-3 items-center">
        <div>
          <div className="font-semibold">{match.homeTeam}</div>
          <div className="text-xs text-white/50">Home</div>
        </div>
        <div className="text-center text-white/40">vs</div>
        <div className="text-right">
          <div className="font-semibold">{match.awayTeam}</div>
          <div className="text-xs text-white/50">Away</div>
        </div>
      </div>
    </div>
  );
}
