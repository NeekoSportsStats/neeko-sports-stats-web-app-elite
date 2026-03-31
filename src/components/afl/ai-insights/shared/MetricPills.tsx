import React from "react";
import { cx, labelConfidence, labelVolatility, labelConsistency, labelExplosiveness } from "../data/utils";

function meterClass(value01: number, kind: "good" | "bad") {
  // only Tailwind classes; no fixed colors beyond gold + neutrals
  const v = Math.round(value01 * 10);
  const base = "h-2 w-full overflow-hidden rounded-full bg-white/10";
  const fill = kind === "good" ? "bg-amber-400/70" : "bg-white/35";
  return { base, fill, v };
}

export function ConfidencePill({ value01 }: { value01: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/75">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
      Confidence: <span className="text-white">{labelConfidence(value01)}</span>
    </span>
  );
}

export function VolatilityPill({ value01 }: { value01: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/75">
      <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
      Volatility: <span className="text-white">{labelVolatility(value01)}</span>
    </span>
  );
}

export function CEStack(props: { consistency01: number; explosiveness01: number }) {
  const c = meterClass(props.consistency01, "good");
  const e = meterClass(props.explosiveness01, "bad");
  return (
    <div className="grid gap-2">
      <div>
        <div className="flex items-center justify-between text-[11px] text-white/70">
          <span>Consistency</span>
          <span className="text-white/85">{labelConsistency(props.consistency01)}</span>
        </div>
        <div className={c.base}>
          <div className={cx("h-full", c.fill)} style={{ width: `${c.v * 10}%` }} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-white/70">
          <span>Explosiveness</span>
          <span className="text-white/85">{labelExplosiveness(props.explosiveness01)}</span>
        </div>
        <div className={e.base}>
          <div className={cx("h-full bg-amber-400/55")} style={{ width: `${e.v * 10}%` }} />
        </div>
      </div>
    </div>
  );
}
