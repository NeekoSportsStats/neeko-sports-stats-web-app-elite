import React from "react";
import TrendSparklineMini from "../Section-3-stability-analysis/TrendSparklineMini";

interface Props {
  value: string;
  onChange: (v: string) => void;
  avgSeries: number[];
  isPremium: boolean;
}

export default function PlayerStatLensHeader({
  value,
  onChange,
  avgSeries,
  isPremium,
}: Props) {
  return (
    <div className="mt-6 space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/90 p-4">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Global Stat Lens
      </h3>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "fantasy", label: "Fantasy" },
          { key: "disposals", label: "Disposals" },
          { key: "goals", label: "Goals" },
        ].map((s) => (
          <button
            key={s.key}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              value === s.key
                ? "bg-yellow-400 text-black border-yellow-300"
                : "bg-neutral-900 text-neutral-300 border-neutral-700"
            }`}
            onClick={() => onChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2">
        <TrendSparklineMini values={avgSeries} />
        <p className="mt-1 text-[11px] text-neutral-400">
          Mock league-wide average for each round — swap this to real stats when
          your pipeline is live.
        </p>
      </div>

      {!isPremium && (
        <p className="text-[11px] text-yellow-300">
          Neeko+ will add extra lenses (CBA load, role, ceiling scores, etc.).
        </p>
      )}
    </div>
  );
}
