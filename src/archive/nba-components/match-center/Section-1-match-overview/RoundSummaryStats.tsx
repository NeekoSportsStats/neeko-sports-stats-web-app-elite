import React from "react";
import type { FixtureMatch } from "../data/types";

type Props = {
  matches: FixtureMatch[];
};

export default function RoundSummaryStats({ matches }: Props) {
  const finals = matches.filter((m) => m.status === "final");

  if (!finals.length) return null;

  const totalPoints = finals.reduce(
    (sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0),
    0
  );

  const margins = finals.map((m) =>
    Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0))
  );

  const avgMargin =
    margins.reduce((a, b) => a + b, 0) / margins.length;

  return (
    <div className="rounded-xl border border-white/10 bg-black/60 backdrop-blur p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <Stat label="Total points" value={totalPoints} />
        <Stat label="Avg margin" value={avgMargin.toFixed(1)} />
        <Stat label="Closest game" value={Math.min(...margins)} />
        <Stat label="Biggest win" value={Math.max(...margins)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-white/40">{label}</div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}
