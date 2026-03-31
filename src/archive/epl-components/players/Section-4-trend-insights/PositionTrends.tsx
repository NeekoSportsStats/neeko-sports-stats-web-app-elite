import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import {
  useEPLMockPlayers,
  getSeriesForStat,
  lastN,
  average,
  stdDev,
  StatKey,
} from "@/components/epl/players/data/useEPLMockData";

type PositionKey = "GK" | "DEF" | "MID" | "FWD";

type PositionPlayerMetrics = {
  id: number;
  name: string;
  team: string;
  pos: PositionKey;
  series: number[];
  l5: number[];
  avgL5: number;
  avgSeason: number;
  deltaVsSeason: number;
  volatility: number;
  stabilityScore: number;
  compositeScore: number;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

const POSITION_CONFIG: {
  key: PositionKey;
  label: string;
  description: string;
  toneClasses: {
    pill: string;
    glow: string;
    border: string;
    header: string;
  };
}[] = [
  {
    key: "GK",
    label: "Goalkeepers",
    description: "Shot-stopping, save volume and clean sheet stability.",
    toneClasses: {
      pill: "bg-purple-500/20 text-purple-100 border-purple-400/60",
      glow: "from-purple-500/25 via-transparent to-indigo-400/15",
      border: "border-purple-400/45",
      header: "text-purple-100",
    },
  },
  {
    key: "DEF",
    label: "Defenders",
    description: "Defensive actions, clean sheet contribution and buildup roles.",
    toneClasses: {
      pill: "bg-sky-500/18 text-sky-100 border-sky-400/60",
      glow: "from-sky-500/25 via-transparent to-cyan-400/15",
      border: "border-sky-400/45",
      header: "text-sky-100",
    },
  },
  {
    key: "MID",
    label: "Midfielders",
    description: "Ball progression, chance creation and two-way workload.",
    toneClasses: {
      pill: "bg-emerald-500/18 text-emerald-100 border-emerald-400/60",
      glow: "from-emerald-500/25 via-transparent to-emerald-400/15",
      border: "border-emerald-400/45",
      header: "text-emerald-100",
    },
  },
  {
    key: "FWD",
    label: "Forwards",
    description: "Goal threat, shot volume and finishing efficiency.",
    toneClasses: {
      pill: "bg-red-500/18 text-red-100 border-red-400/60",
      glow: "from-red-500/25 via-transparent to-orange-400/15",
      border: "border-red-400/45",
      header: "text-red-100",
    },
  },
];

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalized = data.map((v) => ((v - min) / (max - min || 1)) * 100);
  const width = Math.max(normalized.length * 18, 64);

  const peakIndex = normalized.indexOf(Math.max(...normalized));
  const peakX = (peakIndex / Math.max(normalized.length - 1, 1)) * width;
  const peakY = 100 - normalized[peakIndex];

  return (
    <div className="relative h-10 w-full">
      <svg viewBox={`0 0 ${width} 100`} className="absolute inset-0 h-full w-full">
        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={4}
        />
        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={2}
        />
        <circle
          cx={peakX}
          cy={peakY}
          r={3}
          fill="white"
          className="drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
        />
      </svg>
    </div>
  );
}

function roleDirectionLabel(delta: number) {
  if (delta > 0.15) return { label: "Role trending up", tone: "text-emerald-300" };
  if (delta > 0.05) return { label: "Subtle uptick", tone: "text-emerald-200" };
  if (delta < -0.15) return { label: "Role trending down", tone: "text-red-300" };
  if (delta < -0.05) return { label: "Softening role", tone: "text-red-200" };
  return { label: "Role holding steady", tone: "text-zinc-300" };
}

function PositionPlayerCard({
  metric,
  variant,
}: {
  metric: PositionPlayerMetrics;
  variant: "hot" | "cold";
}) {
  const { label, tone } = roleDirectionLabel(metric.deltaVsSeason);

  return (
    <div
      className={cn(
        "relative rounded-xl border border-white/10 bg-black/60 px-3.5 py-3",
        "shadow-[0_0_18px_rgba(0,0,0,0.7)] backdrop-blur-xl",
        "transition-all hover:-translate-y-[1px]",
        variant === "hot"
          ? "hover:shadow-[0_0_22px_rgba(16,185,129,0.35)]"
          : "hover:shadow-[0_0_22px_rgba(239,68,68,0.32)]"
      )}
    >
      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{metric.name}</p>
            <p className="text-[11px] text-white/55">
              {metric.team} • {metric.pos}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-white/65">
              L5 {metric.avgL5.toFixed(2)}
            </p>
            <p className="text-[11px] text-white/65">
              Season {metric.avgSeason.toFixed(2)}
            </p>
            <p className={cn("text-[11px] font-medium", tone)}>
              {metric.deltaVsSeason > 0
                ? `+${metric.deltaVsSeason.toFixed(2)}`
                : metric.deltaVsSeason.toFixed(2)}
            </p>
          </div>
        </div>

        <MiniSparkline data={metric.l5} />

        <div className="flex justify-between text-[11px] text-white/70">
          <span>{label}</span>
          <span>
            Stability{" "}
            <strong className="text-yellow-300">
              {metric.stabilityScore.toFixed(0)}%
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PositionTrends({
  statConfig = EPL_STAT_CONFIG,
}: {
  statConfig?: typeof EPL_STAT_CONFIG;
}) {
  const players = useEPLMockPlayers();
  const [selectedPos, setSelectedPos] = useState<PositionKey>("MID");
  const [selectedStat, setSelectedStat] = useState<StatKey>(
    statConfig.defaultStat
  );

  const metricsByPosition = useMemo(() => {
    const base: Record<PositionKey, PositionPlayerMetrics[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: [],
    };

    players.forEach((p) => {
      const series = getSeriesForStat(p, selectedStat);
      if (!series.length) return;

      const l5 = lastN(series, 5);
      const avgL5 = average(l5);
      const avgSeason = average(series);
      const deltaVsSeason = avgL5 - avgSeason;

      const vol = stdDev(l5);
      const baseVal = avgSeason || 0.2;
      const stability = clamp01(1 - vol / baseVal) * 100;

      const composite = deltaVsSeason * (0.35 + 0.65 * (stability / 100));

      const metric: PositionPlayerMetrics = {
        id: p.id,
        name: p.name,
        team: p.team,
        pos: p.pos,
        series,
        l5,
        avgL5,
        avgSeason,
        deltaVsSeason,
        volatility: vol,
        stabilityScore: stability,
        compositeScore: composite,
      };

      base[p.pos]?.push(metric);
    });

    return base;
  }, [players, selectedStat]);

  const config = POSITION_CONFIG.find((p) => p.key === selectedPos)!;
  const metrics = metricsByPosition[selectedPos] ?? [];

  const hot = [...metrics]
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 3);

  const cold = [...metrics]
    .sort((a, b) => a.compositeScore - b.compositeScore)
    .slice(0, 3);

  return (
    <section className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-black to-[#111010] px-4 py-6 md:px-6 md:py-8">
      <SectionHeader
        eyebrow="Position Trends"
        title="Role-driven trends by line"
        subtitle="Combines recent output and stability to surface meaningful role shifts by position."
        icon={Sparkles}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {statConfig.availableStats.map((s) => (
          <button
            key={s}
            onClick={() => setSelectedStat(s as StatKey)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs transition-all backdrop-blur-sm",
              selectedStat === s
                ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                : "bg-white/5 text-white/70 border-white/12 hover:bg-white/10"
            )}
          >
            {statConfig.labels[s]}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {POSITION_CONFIG.map((p) => (
          <button
            key={p.key}
            onClick={() => setSelectedPos(p.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs transition-all backdrop-blur-sm",
              selectedPos === p.key
                ? "bg-white text-black border-white shadow-[0_0_18px_rgba(255,255,255,0.65)]"
                : "bg-white/5 text-white/70 border-white/15 hover:bg-white/10"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "relative mt-5 rounded-2xl border bg-black/60 px-4 py-4 backdrop-blur-xl",
          config.toneClasses.border
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br opacity-60",
            config.toneClasses.glow
          )}
        />

        <div className="relative grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
              Hot movers
            </p>
            {hot.map((m) => (
              <PositionPlayerCard
                key={`hot-${m.id}`}
                metric={m}
                variant="hot"
              />
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200">
              Cooling risks
            </p>
            {cold.map((m) => (
              <PositionPlayerCard
                key={`cold-${m.id}`}
                metric={m}
                variant="cold"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
