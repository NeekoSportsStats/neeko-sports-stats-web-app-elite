import React from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { clamp } from "../data/utils";

export default function RoundOverview(props: {
  roundLabel: string;
  matchCount: number;
  avgConfidence01: number;
  avgVolatility01: number;
  updatedText: string;
}) {
  const vol = clamp(props.avgVolatility01, 0, 1);
  const conf = clamp(props.avgConfidence01, 0, 1);

  const volLabel = vol >= 0.72 ? "High" : vol >= 0.52 ? "Moderate" : "Low";
  const confLabel = conf >= 0.72 ? "High" : conf >= 0.52 ? "Moderate" : "Low";

  const warn = vol >= 0.72;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10">
              <Sparkles className="h-5 w-5 text-amber-200" />
            </div>
            <div>
              <div className="text-sm text-white/60">{props.updatedText}</div>
              <div className="text-lg font-semibold text-white">
                {props.roundLabel} — Upcoming Matches
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">
              Matches: <span className="text-white">{props.matchCount}</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">
              Avg confidence: <span className="text-white">{confLabel}</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/75">
              Round volatility: <span className="text-white">{volLabel}</span>
            </span>
            {warn ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                Upset risk elevated
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
