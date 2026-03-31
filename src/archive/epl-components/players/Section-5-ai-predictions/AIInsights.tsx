import React from "react";
import { cn } from "@/lib/utils";
import { BrainCircuit, Lock, X, ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import {
  useEPLMockPlayers,
  lastN,
  average,
  stdDev,
  getSeriesForStat,
  StatKey,
} from "@/components/epl/players/data/useEPLMockData";

const IS_PREMIUM = false;

function computePrediction(series: number[]) {
  const l5 = lastN(series, 5);
  const avgL5 = average(l5);
  const season = average(series);
  const vol = stdDev(l5) || 0.15;

  const predicted = avgL5 * 0.55 + season * 0.35;
  const range = Math.max(0.1, vol * 1.6);

  const hotProb = Math.max(
    0,
    Math.min(100, ((avgL5 - season) / Math.max(season, 0.1)) * 100 + 50)
  );

  const stability = Math.max(0, Math.min(100, 100 - vol * 22));

  return {
    predicted,
    range,
    low: predicted - range,
    high: predicted + range,
    hotProb,
    coldProb: 100 - hotProb,
    stability,
  };
}

function TinySparkline() {
  return (
    <svg width="52" height="24" viewBox="0 0 52 24" className="text-yellow-300 opacity-80">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="2,18 10,12 18,14 26,9 34,11 42,7 50,10"
      />
    </svg>
  );
}

function GoldEdgeWrap() {
  return (
    <div className="absolute left-0 top-0 h-full w-[3px] rounded-l-3xl bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-300 shadow-[0_0_22px_rgba(250,204,21,0.55)]" />
  );
}

const aiLines = [
  "Projection supported by consistent involvement and stable role deployment.",
  "Volatility tightening suggests a reliable performance band.",
  "Recent matchups reinforce a steady contribution profile.",
  "Usage patterns remain stable heading into upcoming fixtures.",
  "Short-term output aligns closely with season baseline.",
  "Role continuity supports a dependable scoring floor.",
];

const tagSets = [
  ["Role stable", "Usage steady", "Low volatility"],
  ["Minutes secure", "Matchup neutral", "Baseline intact"],
  ["Consistent involvement", "Low risk profile", "Form holding"],
  ["Role clarity", "Output stable", "Trend neutral"],
];

type AIInsightRowModel = {
  id: string;
  name: string;
  team: string;
  position: string;
  projection: number;
  range: number;
  low: number;
  high: number;
  stability: number;
  aiText: string;
  tags: string[];
};

function ConfidenceBadge({ value }: { value: number }) {
  const label =
    value >= 75 ? "High confidence" : value >= 50 ? "Medium confidence" : "Low confidence";

  const colour =
    value >= 75 ? "text-yellow-300" : value >= 50 ? "text-orange-300" : "text-red-300";

  return <span className={cn("text-[11px] font-medium", colour)}>{label}</span>;
}

function AIInsightRow({ row, blurred }: { row: AIInsightRowModel; blurred?: boolean }) {
  return (
    <article
      className={cn(
        "relative min-w-[280px] snap-start rounded-3xl border border-neutral-800/90",
        "bg-gradient-to-b from-black/96 via-neutral-950 to-black",
        "px-5 py-5 text-xs text-neutral-200 shadow-[0_0_45px_rgba(0,0,0,0.8)]"
      )}
    >
      <GoldEdgeWrap />

      <div className={cn("relative", blurred && "blur-md brightness-[0.5] select-none pointer-events-none")}>
        <div className="flex justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-50">
              {row.name}{" "}
              <span className="text-xs font-normal text-neutral-400">
                {row.team} • {row.position}
              </span>
            </p>

            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Projection • Expected Range
            </p>

            <p className="mt-1 text-xl font-semibold text-neutral-50">
              {row.projection.toFixed(2)}{" "}
              <span className="text-base font-normal text-neutral-300">
                ± {row.range.toFixed(2)}
              </span>{" "}
              <span className="text-[11px] text-neutral-400">
                ({row.low.toFixed(2)}–{row.high.toFixed(2)})
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end text-[10px] text-neutral-500">
            <TinySparkline />
            <span className="mt-1">Recent trend</span>
          </div>
        </div>

        <p className="mt-4 pr-6 text-sm leading-relaxed">{row.aiText}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {row.tags.map((t, i) => (
            <span
              key={i}
              className="rounded-full bg-neutral-900/80 px-2.5 py-1 text-[10px] text-neutral-300"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-neutral-500">
            <span>Confidence</span>
            <ConfidenceBadge value={row.stability} />
          </div>

          <div className="mt-1 h-[3px] w-full rounded-full bg-neutral-900/80 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-lime-400 via-yellow-300 to-amber-400"
              style={{ width: `${row.stability}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function BlurredLockedCard() {
  return (
    <article className="relative min-w-[280px] snap-start rounded-3xl border border-yellow-500/25 bg-black/50 px-5 py-5 opacity-30">
      <Lock className="absolute right-4 top-4 h-4 w-4 text-yellow-300" />
      <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/80">
        AI Insights Locked
      </div>
      <p className="mt-2 text-sm text-neutral-300/80">Upgrade to unlock.</p>
    </article>
  );
}

export default function AIInsights({
  statConfig = EPL_STAT_CONFIG,
}: {
  statConfig?: typeof EPL_STAT_CONFIG;
}) {
  const players = useEPLMockPlayers();
  const stat: StatKey = statConfig.defaultStat;
  const unit = statConfig.units[stat];

  const freeRows: AIInsightRowModel[] = players.slice(0, 3).map((p, i) => {
    const series = getSeriesForStat(p, stat);
    const pred = computePrediction(series);

    return {
      id: `free-${i}`,
      name: p.name,
      team: p.team,
      position: p.pos,
      projection: pred.predicted,
      range: pred.range,
      low: pred.low,
      high: pred.high,
      stability: pred.stability,
      aiText: aiLines[i % aiLines.length],
      tags: tagSets[i % tagSets.length],
    };
  });

  return (
    <section className="relative mt-10 rounded-3xl border border-yellow-500/40 bg-gradient-to-b from-neutral-950 to-black px-4 py-8">
      <SectionHeader
        eyebrow="AI Insights"
        title="AI Projection • Role Forecast • Stability Signals"
        subtitle={`Predictions generated by Neeko AI using ${statConfig.labels[stat]} trends and volatility modelling.`}
        icon={BrainCircuit}
      />

      <div className="mt-6 flex gap-4 overflow-x-auto md:grid md:grid-cols-3">
        {freeRows.map((row) => (
          <AIInsightRow key={row.id} row={row} />
        ))}
        {!IS_PREMIUM && <BlurredLockedCard />}
      </div>
    </section>
  );
}
