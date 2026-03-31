import React, { useEffect, useMemo, useState } from "react";
import { Flame, TrendingUp, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoundMomentumData, type RoundMomentumData, type RoundStat } from "../data/getRoundMomentumData";

function StatLabel({ stat }: { stat: RoundStat }) {
  if (stat === "fantasy") return <>Fantasy pts</>;
  if (stat === "disposals") return <>Disposals</>;
  return <>Goals</>;
}

function formatValue(stat: RoundStat, value: number) {
  if (stat === "fantasy") return Math.round(value).toString();
  return value.toFixed(0);
}

function formatDiff(diff: number) {
  if (!Number.isFinite(diff)) return "—";
  const d = Number(diff.toFixed(1));
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d}`;
}

function SparklineBars({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);

  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 h-10">
        {values.map((v, i) => {
          const h = Math.max(4, Math.round((v / max) * 32));
          return (
            <div key={i} className="w-2 rounded-full bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.55)]" style={{ height: h }} />
          );
        })}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, subtitle }: any) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-1 text-yellow-300 text-[11px] uppercase tracking-[0.2em]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl md:text-3xl font-bold text-yellow-300">{value}</div>
      <div className="text-xs text-white/50 mt-1">{subtitle}</div>
    </div>
  );
}

export default function RoundSummary() {
  const [stat, setStat] = useState<RoundStat>("fantasy");
  const [data, setData] = useState<RoundMomentumData | null>(null);

  useEffect(() => {
    getRoundMomentumData(2025, stat).then(setData);
  }, [stat]);

  const roundLabel = useMemo(() => {
    if (!data?.currentRound) return "";
    return data.isGrandFinal ? "Grand Final" : `Round ${data.currentRound}`;
  }, [data]);

  if (!data) return null;

  const topVal = formatValue(stat, data.topScore.value);
  const hasOver = data.biggestOverperformer.playerName !== "—";
  const overDiff = hasOver ? formatDiff(data.biggestOverperformer.diff) : "—";

  return (
    <section className="rounded-3xl border border-yellow-500/20 bg-black/90 px-5 py-6 md:px-6 md:py-7 shadow-[0_0_60px_rgba(0,0,0,0.85)]">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-yellow-300/70">
            Round Momentum
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            Round Snapshot
          </h2>
          <p className="text-xs text-white/60">
            {roundLabel} • League Overview
          </p>
        </div>

        <div className="flex gap-2">
          {(["fantasy", "disposals", "goals"] as RoundStat[]).map((l) => (
            <button
              key={l}
              onClick={() => setStat(l)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-all",
                stat === l
                  ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.75)]"
                  : "bg-black/40 border-white/20 text-white/70 hover:border-yellow-400/50"
              )}
            >
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* METRICS */}
      <div className="mt-6 rounded-2xl border border-yellow-500/20 bg-black/70 px-5 py-4 grid grid-cols-3 gap-4">

        <Metric
          icon={Flame}
          label="Top Performer"
          value={topVal}
          subtitle={data.topScore.playerName}
        />

        <Metric
          icon={TrendingUp}
          label="Biggest Over"
          value={overDiff}
          subtitle={hasOver ? data.biggestOverperformer.playerName : "No season averages"}
        />

        <Metric
          icon={Activity}
          label="League Avg"
          value={data.roundAverage}
          subtitle="League average"
        />
      </div>

      {/* SPARKLINE */}
      {data.sparkline && <SparklineBars values={data.sparkline} />}

      {/* HEADLINES */}
      <div className="mt-4 space-y-1 text-xs text-white/65">
        {data.keyPoints.map((k, i) => (
          <div key={i}>{k}</div>
        ))}
      </div>
    </section>
  );
}