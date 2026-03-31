import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Flame,
  Shield,
  Sparkles,
  Activity,
} from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import {
  useEPLMockPlayers,
  getSeriesForStat,
  average,
  StatKey,
} from "@/components/epl/players/data/useEPLMockData";

const STATS = EPL_STAT_CONFIG.availableStats;

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalized = data.map((v) => ((v - min) / (max - min || 1)) * 100);
  const width = Math.max(normalized.length * 20, 80);

  return (
    <div className="relative h-16 md:h-24 w-full">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
      >
        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgba(250, 204, 21, 0.4)"
          strokeWidth={4}
          className="drop-shadow-[0_0_10px_rgba(250,204,21,0.6)] animate-[pulse_1.8s_ease-in-out_infinite]"
        />
      </svg>

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
      >
        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgb(250, 204, 21)"
          strokeWidth={2.5}
          className="animate-[fade-in_0.8s_ease-out]"
        />
      </svg>
    </div>
  );
}

interface MiniCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  player: string;
  delay: number;
}

function MiniCard({ icon: Icon, label, value, player, delay }: MiniCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-yellow-500/20 bg-black/70",
        "px-4 py-4 md:px-5 md:py-5",
        "backdrop-blur-sm overflow-hidden",
        "transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(250,204,21,0.45)]",
        "animate-in fade-in slide-in-from-bottom-4"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pointer-events-none absolute inset-x-0 -bottom-12 h-24 bg-gradient-to-t from-yellow-500/15 to-transparent" />
      <div className="relative flex flex-col gap-2 text-left">
        <div className="flex items-center justify-between">
          <Icon className="h-5 w-5 text-yellow-400" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
            {label}
          </span>
        </div>
        <div>
          <p className="text-xl md:text-2xl font-semibold text-yellow-300">
            {value}
          </p>
          <p className="text-xs text-white/55 mt-0.5">{player}</p>
        </div>
      </div>
    </div>
  );
}

export default function RoundSummary() {
  const players = useEPLMockPlayers();
  const [selected, setSelected] = useState<StatKey>(
    EPL_STAT_CONFIG.defaultStat
  );

  const label = EPL_STAT_CONFIG.labels[selected];
  const unit = EPL_STAT_CONFIG.units[selected];
  const desc = EPL_STAT_CONFIG.descriptions[selected];

  const currentRound = EPL_STAT_CONFIG.sportMeta.currentRound!;
  const totalRounds = EPL_STAT_CONFIG.sportMeta.totalRounds!;
  const roundLabels = EPL_STAT_CONFIG.sportMeta.roundLabels!;

  const avgRounds = useMemo(() => {
    if (!players.length) return [];

    const totals = Array.from(
      { length: totalRounds },
      () => 0
    );

    players.forEach((p) => {
      getSeriesForStat(p, selected).forEach((v, i) => {
        totals[i] += v;
      });
    });

    return totals.map((t) => Number((t / players.length).toFixed(2)));
  }, [players, selected, totalRounds]);

  const topScorer = useMemo(() => {
    return players
      .map((p) => ({
        name: p.name,
        last: getSeriesForStat(p, selected).at(-1) ?? 0,
      }))
      .sort((a, b) => b.last - a.last)[0];
  }, [players, selected]);

  const biggestRiser = useMemo(() => {
    return players
      .map((p) => {
        const s = getSeriesForStat(p, selected);
        if (s.length < 2) return null;
        return {
          name: p.name,
          diff: (s.at(-1) ?? 0) - (s.at(-2) ?? 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b as any).diff - (a as any).diff)[0] as any;
  }, [players, selected]);

  const mostConsistent = useMemo(() => {
    return players
      .map((p) => {
        const s = getSeriesForStat(p, selected);
        const base = average(s) || 1;
        return {
          name: p.name,
          consistency: (s.filter((v) => v >= base).length / s.length) * 100,
        };
      })
      .sort((a, b) => b.consistency - a.consistency)[0];
  }, [players, selected]);

  const currentRoundLabel = roundLabels[currentRound - 1] || `${currentRound}`;

  return (
    <section
      className={cn(
        "relative rounded-3xl border border-yellow-500/20",
        "bg-gradient-to-br from-black via-[#050507] to-[#14100a]",
        "px-4 py-6 md:px-8 md:py-8",
        "shadow-[0_0_120px_rgba(0,0,0,0.7)] overflow-hidden",
        "animate-in fade-in slide-in-from-bottom-6"
      )}
    >
      <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-[480px] -translate-x-1/2 bg-yellow-500/20 blur-3xl" />

      <SectionHeader
        eyebrow="Matchweek Momentum"
        title="Matchweek Momentum Summary"
        subtitle={`${currentRoundLabel} • ${label} • ${desc}`}
        icon={Sparkles}
      />

      <div className="-mx-2 mb-4 mt-1 overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-500/30">
        <div className="flex min-w-max gap-2 px-2 pb-1">
          {STATS.map((s) => (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className={cn(
                "snap-start whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                "backdrop-blur-md border",
                selected === s
                  ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_22px_rgba(250,204,21,0.65)]"
                  : "bg-black/30 text-white/70 border-white/10 hover:bg-black/40 hover:text-white"
              )}
            >
              {EPL_STAT_CONFIG.labels[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="rounded-2xl border border-yellow-500/20 bg-black/70 px-4 py-4 md:px-6 md:py-5 backdrop-blur-sm">
          <h3 className="mb-2 flex items-center gap-2 text-base md:text-lg font-semibold">
            <Activity className="h-5 w-5 text-yellow-300" />
            <span>Matchweek Momentum Pulse</span>
          </h3>
          <p className="mb-4 text-sm text-white/70">{desc}</p>
          <Sparkline data={avgRounds} />
        </div>

        <div className="rounded-2xl border border-yellow-500/20 bg-black/70 px-4 py-4 md:px-6 md:py-5 backdrop-blur-sm">
          <h3 className="mb-2 flex items-center gap-2 text-base md:text-lg font-semibold">
            <Flame className="h-5 w-5 text-orange-400" />
            <span>Key Headlines</span>
          </h3>

          <ul className="space-y-2 text-sm text-white/80">
            <li>
              • <strong>{topScorer?.name}</strong> led this matchweek with{" "}
              <strong>{topScorer?.last} {unit}</strong>.
            </li>
            <li>
              • <strong>{biggestRiser?.name}</strong> climbed{" "}
              <strong>{biggestRiser?.diff.toFixed(2)} {unit}</strong>.
            </li>
            <li>
              • <strong>{mostConsistent?.name}</strong> delivered{" "}
              <strong>{mostConsistent?.consistency.toFixed(0)}%</strong> consistency.
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:mt-7 md:grid-cols-3">
        <MiniCard
          icon={Flame}
          label="Top Output"
          value={`${topScorer?.last ?? 0} ${unit}`}
          player={topScorer?.name ?? "—"}
          delay={160}
        />
        <MiniCard
          icon={TrendingUp}
          label="Biggest Rise"
          value={`${biggestRiser?.diff.toFixed(2)} ${unit}`}
          player={biggestRiser?.name ?? "—"}
          delay={220}
        />
        <MiniCard
          icon={Shield}
          label="Most Reliable"
          value={`${mostConsistent?.consistency.toFixed(0)}%`}
          player={mostConsistent?.name ?? "—"}
          delay={280}
        />
      </div>
    </section>
  );
}
