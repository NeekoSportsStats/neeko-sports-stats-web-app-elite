import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, ChevronDown } from "lucide-react";
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

type Tone = "hot" | "stable" | "cold";

type PlayerMetrics = {
  id: number;
  name: string;
  team: string;
  pos: string;
  series: number[];
  l5: number[];
  avgL5: number;
  avgSeason: number;
  deltaVsSeason: number;
  volatility: number;
  consistency: number;
};

function formatMainValue(value: number, stat: StatKey): string {
  const unit = EPL_STAT_CONFIG.units[stat] ?? "";
  return `${value.toFixed(2)} ${unit}`.trim();
}

function formatDelta(delta: number, stat: StatKey): string {
  const unit = EPL_STAT_CONFIG.units[stat] ?? "";
  if (Math.abs(delta) < 0.01) return `±0.00 ${unit} vs avg`;

  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(2)} ${unit} vs avg`;
}

function deltaTone(delta: number): string {
  if (delta > 0.05) return "text-emerald-300";
  if (delta < -0.05) return "text-red-300";
  return "text-zinc-400";
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function TrendSparkline({ data, tone }: { data: number[]; tone: Tone }) {
  if (!data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalized = data.map((v) => ((v - min) / (max - min || 1)) * 100);
  const width = Math.max(normalized.length * 22, 80);

  const strokeBase =
    tone === "hot"
      ? "rgba(248,113,113"
      : tone === "stable"
      ? "rgba(250,204,21"
      : "rgba(56,189,248";

  return (
    <div className="relative mt-3 h-16 w-full">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} 100`}>
        <polyline
          points={normalized
            .map(
              (v, i) =>
                `${(i / Math.max(normalized.length - 1, 1)) * width},${100 - v}`
            )
            .join(" ")}
          fill="none"
          stroke={`${strokeBase},0.32)`}
          strokeWidth={4}
          className="drop-shadow-[0_0_14px_rgba(0,0,0,0.7)]"
        />
      </svg>

      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} 100`}>
        <polyline
          points={normalized
            .map(
              (v, i) =>
                `${(i / Math.max(normalized.length - 1, 1)) * width},${100 - v}`
            )
            .join(" ")}
          fill="none"
          stroke={`${strokeBase},1)`}
          strokeWidth={2.4}
        />
      </svg>
    </div>
  );
}

const buildHotSummary = (m: PlayerMetrics, stat: StatKey) => {
  const label = EPL_STAT_CONFIG.labels[stat].toLowerCase();
  return `${m.name} is trending up, with recent ${label} output sitting ${m.deltaVsSeason.toFixed(
    2
  )} above their season average.`;
};

const buildStableSummary = (m: PlayerMetrics, stat: StatKey) => {
  const label = EPL_STAT_CONFIG.labels[stat].toLowerCase();
  return `${m.name} has delivered consistent ${label} returns, maintaining ${m.consistency.toFixed(
    0
  )}% stability across recent matchweeks.`;
};

const buildCoolingSummary = (m: PlayerMetrics, stat: StatKey) => {
  const label = EPL_STAT_CONFIG.labels[stat].toLowerCase();
  return `${m.name} has cooled off, with ${label} output dipping ${Math.abs(
    m.deltaVsSeason
  ).toFixed(2)} below their usual baseline.`;
};

function PlayerRowCard({
  tone,
  title,
  metric,
  stat,
  isOpen,
  onToggle,
  summaryBuilder,
  showConsistency,
}: {
  tone: Tone;
  title: string;
  metric: PlayerMetrics;
  stat: StatKey;
  isOpen: boolean;
  onToggle: () => void;
  summaryBuilder: (m: PlayerMetrics, stat: StatKey) => string;
  showConsistency?: boolean;
}) {
  const mainValue = formatMainValue(metric.avgL5, stat);
  const deltaLabel = formatDelta(metric.deltaVsSeason, stat);

  const glow =
    tone === "hot"
      ? "shadow-[0_0_18px_rgba(239,68,68,0.40)]"
      : tone === "stable"
      ? "shadow-[0_0_18px_rgba(250,204,21,0.38)]"
      : "shadow-[0_0_18px_rgba(56,189,248,0.40)]";

  const border =
    tone === "hot"
      ? "border-red-500/35"
      : tone === "stable"
      ? "border-yellow-400/32"
      : "border-cyan-400/35";

  const badgeBg =
    tone === "hot"
      ? "bg-red-500/25 text-red-200"
      : tone === "stable"
      ? "bg-yellow-500/25 text-yellow-100"
      : "bg-cyan-500/25 text-cyan-100";

  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative w-full rounded-xl border px-4 py-3 md:px-5 md:py-4",
        "bg-black/55 backdrop-blur-xl transition-transform duration-200",
        "hover:-translate-y-[2px]",
        glow,
        border
      )}
    >
      <div className="relative space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em]",
                badgeBg
              )}
            >
              {title}
            </span>

            <div>
              <p className="text-sm font-semibold text-white">{metric.name}</p>
              <p className="text-[11px] text-white/55">
                {metric.team} • {metric.pos}
              </p>
            </div>
          </div>

          <div className="text-right space-y-1">
            <p className="text-sm font-semibold text-white">{mainValue}</p>
            <p className={cn("text-[11px] font-medium", deltaTone(metric.deltaVsSeason))}>
              {deltaLabel}
            </p>
            {showConsistency && (
              <p className="text-[11px] text-white/60">
                Consistency{" "}
                <span className="font-semibold text-yellow-300">
                  {metric.consistency.toFixed(0)}%
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-white/65 md:text-xs">
            {tone === "hot" && "Trending up in recent output."}
            {tone === "stable" && "Steady output with controlled volatility."}
            {tone === "cold" && "Softening output vs usual baseline."}
          </p>

          <div className="flex items-center gap-1 text-[11px] text-white/60">
            <span>{isOpen ? "Hide trend" : "Show trend"}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 border-t border-white/10 pt-3 animate-in fade-in slide-in-from-top-1">
            <TrendSparkline data={metric.l5} tone={tone} />
            <p className="mt-2 text-[11px] leading-relaxed text-white/70 md:text-xs">
              {summaryBuilder(metric, stat)}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

function ColumnShell({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: Tone;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const headingColor =
    tone === "hot"
      ? "text-red-200"
      : tone === "stable"
      ? "text-yellow-200"
      : "text-cyan-100";

  return (
    <div className="relative space-y-4">
      <div className="space-y-0.5">
        <p className={cn("text-xs font-semibold uppercase tracking-[0.17em]", headingColor)}>
          {title}
        </p>
        <p className="text-[11px] text-white/65 md:text-xs">{subtitle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function FormStabilityGrid({
  statConfig = EPL_STAT_CONFIG,
}: {
  statConfig?: typeof EPL_STAT_CONFIG;
}) {
  const players = useEPLMockPlayers();
  const [selectedStat, setSelectedStat] = useState<StatKey>(
    statConfig.defaultStat
  );
  const [openKey, setOpenKey] = useState<string | null>(null);

  const metrics: PlayerMetrics[] = useMemo(() => {
    return players.map((p) => {
      const series = getSeriesForStat(p, selectedStat);
      const l5 = lastN(series, 5);
      const avgL5 = average(l5);
      const avgSeason = average(series);
      const deltaVsSeason = avgL5 - avgSeason;

      const vol = stdDev(l5);
      const base = avgSeason || 1;
      const consistency = clamp01(1 - vol / Math.max(base, 0.15)) * 100;

      return {
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
        consistency,
      };
    });
  }, [players, selectedStat]);

  const hot = [...metrics].sort((a, b) => b.deltaVsSeason - a.deltaVsSeason).slice(0, 5);
  const stable = [...metrics].sort((a, b) => b.consistency - a.consistency).slice(0, 5);
  const cooling = [...metrics].sort((a, b) => a.deltaVsSeason - b.deltaVsSeason).slice(0, 5);

  return (
    <section
      className={cn(
        "relative rounded-3xl border border-white/10 px-4 py-6 md:px-6 md:py-8",
        "bg-gradient-to-br from-[#050507] via-black to-[#111010]",
        "shadow-[0_0_80px_rgba(0,0,0,0.75)] overflow-hidden"
      )}
    >
      <div className="pointer-events-none absolute -top-32 left-1/2 h-48 w-[420px] -translate-x-1/2 rounded-full bg-yellow-500/18 blur-3xl" />

      <SectionHeader
        eyebrow="Form Stability Grid"
        title="Hot risers, rock-solid anchors & form slumps"
        subtitle={`Last 5 matchweeks of ${statConfig.labels[selectedStat].toLowerCase()} output.`}
        icon={Sparkles}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {statConfig.availableStats.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSelectedStat(s as StatKey);
              setOpenKey(null);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs border transition-all backdrop-blur-sm",
              selectedStat === s
                ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                : "bg-white/5 text-white/70 border-white/12 hover:bg-white/10"
            )}
          >
            {statConfig.labels[s]}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <ColumnShell tone="hot" title="Hot Form Surge" subtitle="Biggest L5 surges vs season baseline.">
          {hot.map((m) => (
            <PlayerRowCard
              key={`hot-${m.id}`}
              tone="hot"
              title="Hot Form"
              metric={m}
              stat={selectedStat}
              isOpen={openKey === `hot-${m.id}`}
              onToggle={() =>
                setOpenKey(openKey === `hot-${m.id}` ? null : `hot-${m.id}`)
              }
              summaryBuilder={buildHotSummary}
            />
          ))}
        </ColumnShell>

        <ColumnShell tone="stable" title="Stability Leaders" subtitle="Lowest volatility with dependable output.">
          {stable.map((m) => (
            <PlayerRowCard
              key={`stable-${m.id}`}
              tone="stable"
              title="Stability"
              metric={m}
              stat={selectedStat}
              isOpen={openKey === `stable-${m.id}`}
              onToggle={() =>
                setOpenKey(openKey === `stable-${m.id}` ? null : `stable-${m.id}`)
              }
              summaryBuilder={buildStableSummary}
              showConsistency
            />
          ))}
        </ColumnShell>

        <ColumnShell tone="cold" title="Cooling Risks" subtitle="Softening output vs usual baseline.">
          {cooling.map((m) => (
            <PlayerRowCard
              key={`cold-${m.id}`}
              tone="cold"
              title="Cooling"
              metric={m}
              stat={selectedStat}
              isOpen={openKey === `cold-${m.id}`}
              onToggle={() =>
                setOpenKey(openKey === `cold-${m.id}` ? null : `cold-${m.id}`)
              }
              summaryBuilder={buildCoolingSummary}
            />
          ))}
        </ColumnShell>
      </div>
    </section>
  );
}
