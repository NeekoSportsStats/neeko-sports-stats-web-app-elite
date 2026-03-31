import React from "react";
import { StatLens, STAT_LABEL, cx } from "../data/utils";

export default function ControlsBar(props: {
  stat: StatLens;
  onChange: (s: StatLens) => void;
  right?: React.ReactNode;
}) {
  const { stat, onChange, right } = props;

  const btn = (s: StatLens) => {
    const active = s === stat;
    return (
      <button
        key={s}
        type="button"
        onClick={() => onChange(s)}
        className={cx(
          "rounded-full px-3 py-1 text-sm transition",
          active
            ? "border border-amber-400/40 bg-amber-500/15 text-amber-100"
            : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
        )}
      >
        {STAT_LABEL[s]}
      </button>
    );
  };

  const stats: StatLens[] = ["fantasy", "points", "rebounds", "assists", "threes"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {stats.map((s) => btn(s))}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
