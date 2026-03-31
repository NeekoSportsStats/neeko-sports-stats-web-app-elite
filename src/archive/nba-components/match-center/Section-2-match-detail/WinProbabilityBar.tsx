import React from "react";

export default function WinProbabilityBar({ homePct }: { homePct: number }) {
  const awayPct = 100 - homePct;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-white/60">
        <span>Home {homePct}%</span>
        <span>Away {awayPct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-amber-400" style={{ width: `${homePct}%` }} />
      </div>
    </div>
  );
}
