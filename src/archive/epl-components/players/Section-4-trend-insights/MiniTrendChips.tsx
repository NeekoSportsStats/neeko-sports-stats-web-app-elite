import React from "react";

export default function MiniTrendChips({
  avg,
  vol,
  consistency,
}: {
  avg: number;
  vol: number;
  consistency: number;
}) {
  const base =
    "text-xs px-2 py-1 rounded-full bg-neutral-900 border border-neutral-700";

  return (
    <div className="flex gap-2 flex-wrap mt-1">
      <span className={base}>
        Avg: <span className="text-yellow-300">{Math.round(avg)}</span>
      </span>
      <span className={base}>
        Vol: <span className="text-emerald-300">{vol.toFixed(1)}</span>
      </span>
      <span className={base}>
        Cons: <span className="text-sky-300">{Math.round(consistency)}%</span>
      </span>
    </div>
  );
}
