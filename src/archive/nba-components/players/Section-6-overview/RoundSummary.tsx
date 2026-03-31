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
import type { StatConfig, StatKey } from "@/lib/stats/types";

import {
  useNBAMockPlayers,
  getSeriesForStat,
  average,
  StatKey as MockStatKey,
} from "@/components/nba/players/data/useNBAMockData";

/* ---------------------------------------------------------
   Sparkline
--------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Mini Card
--------------------------------------------------------- */

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

/* ---------------------------------------------------------
   MAIN SECTION
--------------------------------------------------------- */

export default function RoundSummary({ statConfig }: { statConfig: StatConfig }) {
  const [selected, setSelected] = useState<StatKey>(statConfig.defaultStat);
  const players = useNBAMockPlayers();

  const selectedLabel = statConfig.labels[selected] || selected;
  const unit = statConfig.units?.[selected] || selected;
  const labelLower = selectedLabel.toLowerCase();
  const currentGame = statConfig.sportMeta?.currentRound || 6;
  const description = statConfig.descriptions?.[selected] || "";

  /* sparkline data */
  const avgGames = useMemo(() => {
    if (!players || players.length === 0) return [];
    const sample = players[0];
    if (!sample) return [];
    const series = getSeriesForStat(sample, selected);
    if (!Array.isArray(series) || series.length === 0) return [];

    const totals = Array.from({ length: series.length }, () => 0);

    players.forEach((p) => {
      const pSeries = getSeriesForStat(p, selected);
      if (Array.isArray(pSeries)) {
        pSeries.forEach((v, i) => {
          if (i < totals.length) {
            totals[i] += v;
          }
        });
      }
    });

    return totals.map((t) => Math.round(t / players.length));
  }, [players, selected]);

  /* stat calcs */
  const topScorer = useMemo(() => {
    if (!players || players.length === 0) return { name: "—", last: 0 };
    const scored = players
      .map((p) => {
        const series = getSeriesForStat(p, selected);
        const last = Array.isArray(series) && series.length > 0 ? series[series.length - 1] : 0;
        return { name: p.name, last };
      })
      .sort((a, b) => b.last - a.last);
    return scored[0] || { name: "—", last: 0 };
  }, [players, selected]);

  const biggestRiser = useMemo(() => {
    if (!players || players.length === 0) return { name: "—", diff: 0 };
    const risers = players
      .map((p) => {
        const s = getSeriesForStat(p, selected);
        if (!Array.isArray(s) || s.length < 2) return null;
        const last = s[s.length - 1] || 0;
        const prev = s[s.length - 2] || 0;
        return { name: p.name, diff: last - prev };
      })
      .filter((item): item is { name: string; diff: number } => item !== null)
      .sort((a, b) => b.diff - a.diff);
    return risers[0] || { name: "—", diff: 0 };
  }, [players, selected]);

  const mostConsistent = useMemo(() => {
    if (!players || players.length === 0) return { name: "—", consistency: 0 };
    const consistent = players
      .map((p) => {
        const s = getSeriesForStat(p, selected);
        if (!Array.isArray(s) || s.length === 0) return { name: p.name, consistency: 0 };
        const base = average(s) || 1;
        const aboveBase = s.filter((v) => v >= base).length;
        return {
          name: p.name,
          consistency: (aboveBase / s.length) * 100,
        };
      })
      .sort((a, b) => b.consistency - a.consistency);
    return consistent[0] || { name: "—", consistency: 0 };
  }, [players, selected]);

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
      {/* gold glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-[480px] -translate-x-1/2 bg-yellow-500/20 blur-3xl" />

      <div className="relative">
        <SectionHeader
          eyebrow="Game Momentum"
          title="Game Momentum Summary"
          subtitle={`Game ${currentGame} • ${selectedLabel} Snapshot — track ${labelLower} trends, standout players and role shifts as this stat moves game to game.`}
          icon={Sparkles}
        />

        {/* FILTER PILLS */}
        <div className="-mx-2 mb-4 mt-1 overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-500/30">
          <div className="flex min-w-max gap-2 px-2 pb-1">
            {statConfig.availableStats.map((s) => (
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
                {statConfig.labels[s]}
              </button>
            ))}
          </div>
        </div>

        {/* GRID */}
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {/* PULSE */}
          <div
            className="rounded-2xl border border-yellow-500/20 bg-black/70 px-4 py-4 md:px-6 md:py-5 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(250,204,21,0.45)] animate-in fade-in slide-in-from-bottom-4"
          >
            <h3 className="mb-2 flex items-center gap-2 text-base md:text-lg font-semibold">
              <Activity className="h-5 w-5 text-yellow-300" />
              <span>Game Momentum Pulse</span>
            </h3>

            <p className="mb-4 text-sm text-white/70 leading-relaxed">
              {description}
            </p>

            <Sparkline data={avgGames} />
          </div>

          {/* HEADLINES */}
          <div
            className="rounded-2xl border border-yellow-500/20 bg-black/70 px-4 py-4 md:px-6 md:py-5 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(250,204,21,0.45)] animate-in fade-in slide-in-from-bottom-4"
          >
            <h3 className="mb-2 flex items-center gap-2 text-base md:text-lg font-semibold">
              <Flame className="h-5 w-5 text-orange-400" />
              <span>Key Headlines</span>
            </h3>

            <ul className="space-y-2 text-sm text-white/80">
              <li>
                • <strong>{topScorer.name}</strong> led this game with{" "}
                <strong>{topScorer.last} {unit}</strong>.
              </li>
              <li>
                • <strong>{biggestRiser.name}</strong> climbed{" "}
                <strong>{biggestRiser.diff.toFixed(1)} {unit}</strong> from previous game.
              </li>
              <li>
                • <strong>{mostConsistent.name}</strong> holds{" "}
                <strong>{mostConsistent.consistency.toFixed(0)}%</strong> above-average performances.
              </li>
              <li>
                • League-wide {labelLower} output continues to show meaningful consistency and role changes.
              </li>
            </ul>
          </div>
        </div>

        {/* MINI CARDS */}
        <div className="mt-6 grid gap-4 md:mt-7 md:grid-cols-3">
          <MiniCard
            icon={Flame}
            label="Top Score"
            value={`${topScorer.last} ${unit}`}
            player={topScorer.name}
            delay={160}
          />
          <MiniCard
            icon={TrendingUp}
            label="Biggest Riser"
            value={`${biggestRiser.diff.toFixed(1)} ${unit}`}
            player={biggestRiser.name}
            delay={220}
          />
          <MiniCard
            icon={Shield}
            label="Most Consistent"
            value={`${mostConsistent.consistency.toFixed(0)}%`}
            player={mostConsistent.name}
            delay={280}
          />
        </div>

      </div>
    </section>
  );
}
