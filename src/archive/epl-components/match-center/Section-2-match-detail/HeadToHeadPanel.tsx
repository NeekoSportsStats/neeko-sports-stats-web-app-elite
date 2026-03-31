import React from "react";

type Props = {
  homeTeam: string;
  awayTeam: string;
};

export default function HeadToHeadPanel({ homeTeam, awayTeam }: Props) {
  // Mocked historical summary
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold mb-3">
        Head-to-Head (Last 5)
      </div>

      <div className="space-y-2 text-xs text-white/60">
        <Row label={homeTeam} value="3 wins" />
        <Row label={awayTeam} value="2 wins" />
        <Row label="Avg margin" value="14 pts" />
        <Row label="Last meeting" value="Won by 22 pts" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
