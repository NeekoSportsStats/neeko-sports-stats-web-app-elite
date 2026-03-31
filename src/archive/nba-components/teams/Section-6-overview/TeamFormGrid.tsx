// TEAM FORM GRID — NBA EDITION
// A) Real midfieldTrend sparkline
// B) Enhanced Soft Glow
// C) True Center Sparkline
// D) Bottom-locked Progress Bar + Footer
// E) Fully patched BACK CARD with balanced JSX

import React, { useMemo, useState } from "react";
import { MOCK_TEAMS } from "../data/mockTeams";
import { Flame, CircleDot, Snowflake } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

const METRICS = ["momentum", "points", "rebounds", "assists"] as const;
type Metric = (typeof METRICS)[number];
type Variant = "hot" | "stable" | "cold";

interface ClassifiedTeams {
  hot: typeof MOCK_TEAMS;
  stable: typeof MOCK_TEAMS;
  cold: typeof MOCK_TEAMS;
}

/* -------------------------------------------------------------------------- */
/*                         Metric Calculation Logic                           */
/* -------------------------------------------------------------------------- */

function getBaseMomentum(team: typeof MOCK_TEAMS[number]): number {
  const last5 = team.margins.slice(-5);
  return last5.reduce((a, b) => a + b, 0) / last5.length;
}

function metricJitter(team: typeof MOCK_TEAMS[number], metric: Metric): number {
  const seed =
    team.id *
    (metric === "points"
      ? 1.7
      : metric === "rebounds"
      ? 2.3
      : metric === "assists"
      ? 3.1
      : 0.9);
  return Math.sin(seed) * 6;
}

function getMetricScore(team: typeof MOCK_TEAMS[number], metric: Metric): number {
  const base = getBaseMomentum(team);

  if (metric === "momentum") return base;
  if (metric === "points") return base * 0.7 + metricJitter(team, metric);
  if (metric === "rebounds") return base * 0.5 + metricJitter(team, metric);
  return base * 0.35 + metricJitter(team, metric);
}

function classifyTeams(metric: Metric): ClassifiedTeams {
  const sorted = [...MOCK_TEAMS].sort(
    (a, b) => getMetricScore(b, metric) - getMetricScore(a, metric)
  );

  return {
    hot: sorted.slice(0, 3),
    stable: sorted.slice(12, 15),
    cold: sorted.slice(-3),
  };
}

/* -------------------------------------------------------------------------- */
/*                            UI Helper Styling                               */
/* -------------------------------------------------------------------------- */

const metricLabels: Record<Metric, string> = {
  momentum: "Momentum · Last 5",
  points: "Points edge",
  rebounds: "Rebounds edge",
  assists: "Assists edge",
};

const metricPrefix: Record<Metric, string> = {
  momentum: "Momentum",
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
};

const badgeStyles: Record<Variant, string> = {
  hot: "bg-red-400/15 border border-red-400/30 text-red-200 shadow-[0_0_10px_rgba(255,80,80,0.25)]",
  stable: "bg-emerald-400/15 border border-emerald-400/30 text-lime-200 shadow-[0_0_10px_rgba(80,255,170,0.25)]",
  cold: "bg-sky-400/15 border border-sky-400/30 text-sky-200 shadow-[0_0_10px_rgba(0,170,255,0.25)]",
};

const variantHalo: Record<Variant, string> = {
  hot: "shadow-[0_0_32px_rgba(255,60,60,0.22)]",
  stable: "shadow-[0_0_32px_rgba(60,220,150,0.22)]",
  cold: "shadow-[0_0_32px_rgba(0,180,255,0.22)]",
};

function formatMetric(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function intensityWidth(value: number): string {
  const clamped = Math.max(-40, Math.min(40, value));
  return `${Math.max(6, Math.min(100, (Math.abs(clamped) / 40) * 100))}%`;
}

/* -------------------------------------------------------------------------- */
/*                     Enhanced Glow Real Trend Sparkline                     */
/* -------------------------------------------------------------------------- */

function RealTrendSparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 60 - ((v - min) / range) * 40;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 60"
      className="w-full h-[36px]"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.6" result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polyline
        points={points}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        fill="none"
        filter="url(#glow)"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Main TeamFormGrid Component                        */
/* -------------------------------------------------------------------------- */

export default function TeamFormGrid() {
  const [metric, setMetric] = useState<Metric>("momentum");
  const classified = useMemo(() => classifyTeams(metric), [metric]);

  return (
    <section className="mt-16">
      <div className="rounded-[32px] border border-yellow-500/10 bg-gradient-to-b from-yellow-900/5 via-black/70 to-black/95 px-4 py-8 sm:px-6 md:px-10 lg:px-12">

        {/* HEADER */}
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-400/15 px-4 py-1 shadow-[0_0_14px_rgba(250,204,21,0.3)] backdrop-blur-[2px]">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_6px_rgba(250,204,21,0.9)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-yellow-50">
            Team Form Grid
          </span>
        </div>

        <h2 className="mt-5 text-2xl font-semibold text-neutral-50 sm:text-3xl md:text-[32px] leading-tight">
          Hot, stable and cold teams by performance lens
        </h2>

        <p className="mt-3 max-w-3xl text-xs text-neutral-400 sm:text-sm">
          Switch between lenses. Tap cards for deeper analytics.
        </p>

        {/* FILTER TABS */}
        <div className="mt-6 inline-flex rounded-full bg-black/50 p-1 ring-1 ring-yellow-400/25 shadow-[0_0_26px_rgba(255,240,150,0.35)]">
          {METRICS.map((m) => {
            const active = metric === m;
            return (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`relative flex min-w-[92px] flex-1 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                  active ? "text-black" : "text-neutral-200 hover:text-neutral-50"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-full bg-yellow-300/60 shadow-[0_0_40px_rgba(255,240,150,0.75)]" />
                )}
                <span className="relative z-10 capitalize">
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3 COLUMNS */}
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <FormColumn
            variant="hot"
            title="Hot Teams"
            icon={<Flame className="h-4 w-4 text-red-300" />}
            teams={classified.hot}
            metric={metric}
          />
          <FormColumn
            variant="stable"
            title="Stable Teams"
            icon={<CircleDot className="h-4 w-4 text-lime-300" />}
            teams={classified.stable}
            metric={metric}
          />
          <FormColumn
            variant="cold"
            title="Cold Teams"
            icon={<Snowflake className="h-4 w-4 text-sky-300" />}
            teams={classified.cold}
            metric={metric}
          />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Column Component                               */
/* -------------------------------------------------------------------------- */

function FormColumn({
  variant,
  title,
  icon,
  teams,
  metric,
}: {
  variant: Variant;
  title: string;
  icon: React.ReactNode;
  teams: typeof MOCK_TEAMS;
  metric: Metric;
}) {
  const color =
    variant === "hot"
      ? "text-red-300"
      : variant === "stable"
      ? "text-lime-300"
      : "text-sky-300";

  const divider =
    variant === "hot"
      ? "from-red-500/40"
      : variant === "stable"
      ? "from-lime-500/40"
      : "from-sky-500/40";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
        {icon}
        <span className={`font-semibold ${color}`}>{title}</span>
      </div>

      <div className={`mb-4 h-px bg-gradient-to-r ${divider}`} />

      <div className="space-y-4">
        {teams.map((team) => (
          <TeamFormCard
            key={`${team.code}-${metric}`}
            variant={variant}
            team={team}
            metric={metric}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Team Card                                    */
/* -------------------------------------------------------------------------- */

function TeamFormCard({
  variant,
  team,
  metric,
}: {
  variant: Variant;
  team: typeof MOCK_TEAMS[number];
  metric: Metric;
}) {
  const [flipped, setFlipped] = useState(false);

  const score = getMetricScore(team, metric);
  const formattedScore = formatMetric(score);
  const barWidth = intensityWidth(score);

  const trend = Array.isArray(team.paceTrend) && team.paceTrend.length > 0
    ? team.paceTrend
    : team.margins.slice(-12);

  return (
    <div
      className={`relative h-[188px] cursor-pointer rounded-2xl border border-neutral-700/40 bg-black/90 backdrop-blur-[2px] transform-gpu transition duration-300 ${variantHalo[variant]}`}
      onClick={() => setFlipped(!flipped)}
    >
      <div
        className={`absolute inset-0 grid grid-rows-[auto_1fr_auto] p-4 transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* FRONT */}
        <div className="[backface-visibility:hidden] absolute inset-0 grid grid-rows-[auto_1fr_auto] p-4">
          {/* HEADER */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold text-neutral-50 leading-tight">
                {team.name}
              </div>
              <div className="mt-[2px] text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                {metricLabels[metric]}
              </div>
            </div>

            <div
              className={`${badgeStyles[variant]} inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-semibold`}
            >
              {formattedScore}
            </div>
          </div>

          {/* CENTERED SPARKLINE */}
          <div className="flex items-center justify-center">
            <RealTrendSparkline values={trend} />
          </div>

          {/* BOTTOM PROGRESS BAR + FOOTER */}
          <div>
            <div className="relative h-2 w-full rounded-full bg-neutral-800/80 overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
                  variant === "hot"
                    ? "from-red-300 to-red-500"
                    : variant === "stable"
                    ? "from-lime-300 to-emerald-400"
                    : "from-sky-300 to-cyan-400"
                }`}
                style={{ width: barWidth }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[9px] text-neutral-500 uppercase tracking-[0.14em]">
              <span>{metricLabels[metric]}</span>
              <span className="flex items-center gap-1 text-neutral-400">
                <span className="hidden sm:inline">Analytics</span>
                <span className="text-[11px]">↺</span>
              </span>
            </div>
          </div>
        </div>

        {/* BACK — FULLY PATCHED, BALANCED JSX */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl border border-white/5 bg-black/65 p-4">

          {/* HEADER */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-sm font-semibold text-neutral-50">
                {team.name}
              </div>
              <div className="mt-[2px] text-[9px] uppercase text-neutral-500 tracking-[0.16em]">
                {metricPrefix[metric]} snapshot
              </div>
            </div>

            <div
              className={`text-[11px] font-semibold ${
                variant === "hot"
                  ? "text-red-300"
                  : variant === "stable"
                  ? "text-lime-300"
                  : "text-sky-300"
              }`}
            >
              {formattedScore}
            </div>
          </div>

          {/* STATS GRID */}
          <div className="mt-3 grid grid-cols-3 gap-y-3 gap-x-4 text-[11px] text-neutral-300 leading-snug">

            {/* Attack Δ */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Attack Δ
              </div>
              <div className="font-semibold">
                {(team.scores.at(-1)! - team.scores.at(-2)!) >= 0 ? "+" : ""}
                {team.scores.at(-1)! - team.scores.at(-2)!}
              </div>
            </div>

            {/* Defence Δ */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Defence Δ
              </div>
              <div className="font-semibold">
                {(team.margins.at(-1)! - team.margins.at(-2)!) >= 0 ? "+" : ""}
                {team.margins.at(-1)! - team.margins.at(-2)!}
              </div>
            </div>

            {/* Pace */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Pace
              </div>
              <div className="font-semibold">
                {Array.isArray(team.paceRating) && team.paceRating.length > 0
                  ? team.paceRating.at(-1)!
                  : 100}
              </div>
            </div>

            {/* Consistency */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Consist.
              </div>
              <div className="font-semibold">{team.consistencyIndex}</div>
            </div>

            {/* Pressure */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Pressure
              </div>
              <div className="font-semibold">+3</div>
            </div>

            {/* Fixture Difficulty */}
            <div>
              <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
                Fixture
              </div>
              <div className="font-semibold">{team.fixtureDifficulty.score}</div>
            </div>

          </div>

          {/* OPPONENTS */}
          <div className="mt-4">
            <div className="text-[9px] uppercase text-neutral-500 tracking-[0.14em]">
              Opponents
            </div>

            <div className="mt-1 flex flex-wrap gap-1.5">
              {team.fixtureDifficulty.opponents.map((op) => (
                <code
                  key={op}
                  className="rounded bg-white/5 px-1.5 py-[1px] text-[9px] text-neutral-300"
                >
                  {op}
                </code>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
