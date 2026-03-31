// src/components/nba/players/AIInsights.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { BrainCircuit, Lock, X, ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";
import type { StatConfig, StatKey } from "@/lib/stats/types";
import {
  useNBAMockPlayers,
  lastN,
  average,
  stdDev,
  getSeriesForStat,
  StatKey as MockStatKey,
} from "@/components/nba/players/data/useNBAMockData";

/**
 * TEMP GATING FLAG
 * Replace later with: const { isPremium } = useAuth();
 */
const IS_PREMIUM = false;

/* ---------------------------------------------------------
   Predictor Logic (Mocked but premium-feeling)
--------------------------------------------------------- */

function computePrediction(series: number[]) {
  const l5 = lastN(series, 5);
  const avgL5 = average(l5);
  const season = average(series);
  const vol = stdDev(l5) || 1;

  const predicted = avgL5 * 0.5 + season * 0.3 + (avgL5 - vol) * 0.2;
  const range = vol * 2;

  const hotProb = Math.max(
    0,
    Math.min(100, ((avgL5 - season) / (season || 1)) * 100 + 50)
  );
  const coldProb = 100 - hotProb;

  const stability = Math.max(0, Math.min(100, 100 - vol * 8));

  return { predicted, range, hotProb, coldProb, stability };
}

/* ---------------------------------------------------------
   Static tiny sparkline
--------------------------------------------------------- */

function TinySparkline() {
  return (
    <svg
      width="52"
      height="24"
      viewBox="0 0 52 24"
      className="text-yellow-300 opacity-80"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="2,18 10,8 18,14 26,6 34,10 42,4 50,12"
      />
    </svg>
  );
}

/* ---------------------------------------------------------
   🔥 TEAM-STYLE GOLD EDGE WRAP
--------------------------------------------------------- */

function GoldEdgeWrap() {
  return (
    <div
      className="
        absolute left-0 top-0 h-full w-[3px]
        rounded-l-3xl
        bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-300
        shadow-[0_0_22px_rgba(250,204,21,0.55)]
      "
    />
  );
}

/* ---------------------------------------------------------
   AI Micro-Sentences (rotating) — NBA specific
--------------------------------------------------------- */

const aiLines = [
  "Projection supported by consistent shot selection and stable usage patterns.",
  "Volatility curve trending tighter, supporting an elevated scoring floor.",
  "Matchup neutrality offsets minor volatility spikes in recent games.",
  "Role continuity suggests reliable baseline output moving into next game.",
  "Usage patterns holding steady, reinforcing stable projection confidence.",
  "Short-term scoring window supported by consistent offensive involvement.",
];

/* ---------------------------------------------------------
   Tag Variations (rotating) — NBA specific
--------------------------------------------------------- */

const tagSets = [
  ["High usage", "Scoring flow", "Volatility normal"],
  ["Role stable", "Minutes steady", "Neutral matchup"],
  ["Favorable matchup", "High involvement", "Floor intact"],
  ["Primary option", "Ball handling", "Shot creation"],
  ["Matchup stable", "Usage consistent", "Low volatility"],
  ["High minutes", "Offensive load", "Balanced matchup"],
];

/* ---------------------------------------------------------
   Row Model
--------------------------------------------------------- */

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

/* ---------------------------------------------------------
   AI Confidence Badge
--------------------------------------------------------- */

function ConfidenceBadge({ value }: { value: number }) {
  const label =
    value >= 75
      ? "High confidence"
      : value >= 50
      ? "Medium confidence"
      : "Low confidence";

  const colour =
    value >= 75 ? "text-yellow-300" : value >= 50 ? "text-orange-300" : "text-red-300";

  return <span className={cn("text-[11px] font-medium", colour)}>{label}</span>;
}

/* ---------------------------------------------------------
   INDIVIDUAL ROW CARD (Team-style outer, player content)
--------------------------------------------------------- */

function AIInsightRow({
  row,
  statLabel,
  blurred,
}: {
  row: AIInsightRowModel;
  statLabel: string;
  blurred?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative min-w-[280px] snap-start rounded-3xl border border-neutral-800/90",
        "bg-gradient-to-b from-black/96 via-neutral-950 to-black",
        "px-5 py-5 md:px-6 md:py-6 text-xs text-neutral-200",
        "shadow-[0_0_45px_rgba(0,0,0,0.8)] transition hover:brightness-110"
      )}
    >
      {/* Gold vertical spine like Teams */}
      <GoldEdgeWrap />

      {/* Content wrapper */}
      <div
        className={cn(
          "relative",
          blurred &&
            "blur-md brightness-[0.5] select-none pointer-events-none"
        )}
      >
        {/* Top Row - Player + sparkline */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-50">
              {row.name}{" "}
              <span className="text-xs font-normal text-neutral-400">
                {row.team} • {row.position}
              </span>
            </p>

            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Projection • L5 Expected Range
            </p>

            <p className="mt-1 text-xl font-semibold text-neutral-50">
              {row.projection.toFixed(1)}{" "}
              <span className="text-base font-normal text-neutral-300">
                ± {row.range.toFixed(1)} {statLabel.toLowerCase()}
              </span>{" "}
              <span className="text-[11px] text-neutral-400">
                ({row.low.toFixed(0)}–{row.high.toFixed(0)} range)
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end text-[10px] text-neutral-500">
            <TinySparkline />
            <span className="mt-1">Recent scoring trend</span>
          </div>
        </div>

        {/* AI Summary */}
        <p className="mt-4 pr-8 text-sm leading-relaxed text-neutral-200">
          {row.aiText}
        </p>

        {/* Tags */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          {row.tags.map((t, i) => (
            <span
              key={`${row.id}-tag-${i}`}
              className="rounded-full bg-neutral-900/80 px-2.5 py-1 text-[10px] text-neutral-300"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Confidence */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Confidence Index
            </p>
            <div className="flex items-center gap-2">
              <ConfidenceBadge value={row.stability} />
              <span className="text-[10px] text-neutral-400">
                {row.stability.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="h-[3px] w-full overflow-hidden rounded-full bg-neutral-900/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lime-400 via-yellow-300 to-amber-400"
              style={{ width: `${row.stability}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------
   BLURRED LOCKED CARD (matches Teams blur + streak)
--------------------------------------------------------- */

function BlurredLockedCard() {
  return (
    <article
      className="relative min-w-[280px] snap-start rounded-3xl border border-yellow-500/25
      bg-black/50 px-5 py-5 backdrop-blur-2xl opacity-30 scale-[0.98]
      select-none pointer-events-none shadow-[0_0_45px_rgba(0,0,0,0.8)] overflow-hidden"
    >
      {/* Deep blur base layer */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-black/40 backdrop-blur-3xl" />

      {/* Gold shimmer */}
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-70 mix-blend-screen animate-pulse">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(250,204,21,0.22),transparent_65%),radial-gradient(circle_at_80%_100%,rgba(250,204,21,0.18),transparent_60%)]" />
      </div>

      {/* ⭐ GOLD → AMBER Luxury Diagonal Streak */}
      <div
        className="
          pointer-events-none absolute inset-0 z-[2]
          bg-gradient-to-br from-yellow-300/20 via-amber-400/20 to-transparent
          animate-[luxstreak_7s_ease-in-out_infinite]
        "
        style={{
          maskImage:
            "linear-gradient(55deg, transparent 45%, black 50%, transparent 55%)",
          WebkitMaskImage:
            "linear-gradient(55deg, transparent 45%, black 50%, transparent 55%)",
        }}
      />

      {/* Content (blurred behind) */}
      <div className="relative z-[3]">
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-yellow-500/50 bg-black/70 shadow-[0_0_16px_rgba(250,204,21,0.65)]">
          <Lock className="h-3.5 w-3.5 text-yellow-300" />
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/80">
          AI Insights Locked
        </div>

        <div className="mt-1 text-sm font-semibold text-neutral-200/80">
          Hidden Player
        </div>

        <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-neutral-300/75">
          <li className="flex gap-2">
            <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
            <span>Projection band hidden.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
            <span>Role and usage model locked.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
            <span>Volatility and matchup flags unavailable.</span>
          </li>
        </ul>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */

export default function AIInsights({ statConfig }: { statConfig: StatConfig }) {
  const players = useNBAMockPlayers();

  const statLabel = statConfig.labels[statConfig.defaultStat] || "Points";

  // Build real free rows (top 3)
  const freeRows: AIInsightRowModel[] = players.slice(0, 3).map((p, idx) => {
    const series = getSeriesForStat(p, statConfig.defaultStat as MockStatKey);
    const pred = computePrediction(series);

    const low = pred.predicted - pred.range;
    const high = pred.predicted + pred.range;

    const tags = tagSets[idx % tagSets.length];
    const aiText = aiLines[idx % aiLines.length];

    return {
      id: `free-${idx}`,
      name: p.name,
      team: p.team,
      position: (p as any).pos ?? (p as any).position ?? "",
      projection: pred.predicted,
      range: pred.range,
      low,
      high,
      stability: pred.stability,
      aiText,
      tags,
    };
  });

  // Fake premium rows (just for locked previews) - NBA positions
  const premiumRows: AIInsightRowModel[] = [
    {
      id: "premium-1",
      name: "Player 58",
      team: "LAL",
      position: "PG",
      projection: 28.1,
      range: 4.4,
      low: 23.7,
      high: 32.5,
      stability: 78,
      aiText:
        "Projection built on expanding usage rate and strong pick-and-roll efficiency.",
      tags: ["Role expansion", "Usage spike", "Favorable matchup"],
    },
    {
      id: "premium-2",
      name: "Player 42",
      team: "BOS",
      position: "SF",
      projection: 22.3,
      range: 5.2,
      low: 17.1,
      high: 27.5,
      stability: 65,
      aiText:
        "Wing production with rising three-point volume, supported by stable minutes profile.",
      tags: ["High minutes", "Perimeter volume", "Volatility moderate"],
    },
    {
      id: "premium-3",
      name: "Player 71",
      team: "MIA",
      position: "C",
      projection: 14.6,
      range: 3.0,
      low: 11.6,
      high: 17.6,
      stability: 82,
      aiText:
        "Interior presence with consistent paint touches and favorable rebounding opportunities.",
      tags: ["Paint dominance", "Board control", "Floor intact"],
    },
  ];

  const [showModal, setShowModal] = React.useState(false);

  return (
    <>
      <section
        id="ai-insights"
        className={cn(
          "relative mt-10 rounded-3xl border border-yellow-500/40",
          "bg-gradient-to-b from-neutral-950/95 via-black/96 to-black",
          "px-4 py-8 md:px-6 md:py-10",
          "shadow-[0_0_70px_rgba(0,0,0,0.85)]"
        )}
      >
        {/* Header */}
        <div className="mb-8">
          <SectionHeader
            eyebrow="AI Insights"
            title="AI Projection • Usage Forecast • Role Signals"
            subtitle="Predictions generated by Neeko AI — combining role tendencies, matchup profiles and volatility pathways."
            icon={BrainCircuit}
          />

          <p className="mt-5 max-w-xl text-[10px] leading-relaxed text-neutral-500">
            <span className="font-medium text-neutral-300">Role stable</span> =
            consistent position &amp; offensive pattern.{" "}
            <span className="font-medium text-neutral-300">Minutes steady</span> =
            playing time near baseline.{" "}
            <span className="font-medium text-neutral-300">Neutral matchup</span> =
            average opponent defensive rating.
          </p>
        </div>

        {/* Row 1 – free cards (carousel on mobile, 3-col grid on desktop) */}
        <div className="mb-6 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {freeRows.map((row) => (
            <AIInsightRow key={row.id} row={row} statLabel={statLabel} />
          ))}
        </div>

        {/* Row 2 – locked preview cards, same layout as Teams */}
        <div className="mb-8 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {premiumRows.map((row) =>
            IS_PREMIUM ? (
              <AIInsightRow key={row.id} row={row} statLabel={statLabel} />
            ) : (
              <BlurredLockedCard key={row.id} />
            )
          )}
        </div>

        {/* Neeko+ CTA – matches Teams style, opens modal */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="group inline-flex w-full items-center justify-between rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-yellow-500/0 to-transparent px-6 py-4 text-left transition hover:brightness-110"
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-200/80">
              Neeko+ AI Suite
            </div>
            <div className="mt-1 text-sm font-semibold text-yellow-100">
              Unlock full AI projections & matchup intelligence for every player
            </div>
            <p className="mt-1 text-xs text-neutral-300">
              Access deeper trend breakdowns, role-driven matchup flags,
              volatility curves and premium forecasting.
            </p>
          </div>

          <div className="ml-4 flex h-9 w-9 items-center justify-center rounded-full border border-yellow-400/50 bg-black/60 shadow-[0_0_14px_rgba(250,204,21,0.6)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
            <ArrowRight className="h-4 w-4 text-yellow-300" />
          </div>
        </button>
      </section>

      {/* Neeko+ Modal (same as Teams) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-yellow-500/40 bg-gradient-to-b from-neutral-950 via-black to-black px-6 py-6 shadow-[0_0_80px_rgba(0,0,0,1)]">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700/70 bg-black/70 text-neutral-300 transition hover:border-neutral-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/40 bg-gradient-to-r from-yellow-500/25 via-yellow-500/5 to-transparent px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-100">
                Neeko+ Upgrade
              </span>
            </div>

            <h3 className="mt-3 text-xl font-semibold text-neutral-50">
              Unlock full NBA AI analysis
            </h3>

            <p className="mt-2 text-xs text-neutral-300">
              Neeko+ unlocks every team, every trend, volatility models,
              forecasting and AI-generated matchup insights across the league.
            </p>

            <ul className="mt-4 space-y-2 text-xs text-neutral-200">
              <li className="flex gap-2">
                <span className="mt-[5px] h-[4px] w-[4px] rounded-full bg-yellow-400" />
                <span>Full analysis for all 30 NBA teams.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[5px] h-[4px] w-[4px] rounded-full bg-yellow-400" />
                <span>Deep momentum, offensive/defensive efficiency trend models.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[5px] h-[4px] w-[4px] rounded-full bg-yellow-400" />
                <span>Premium AI features across other sports as they launch.</span>
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="https://www.neekostats.com.au/neeko-plus"
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-yellow-400/70 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_30px_rgba(250,204,21,0.85)] transition hover:brightness-110"
              >
                Upgrade to Neeko+
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>

              <button
                onClick={() => setShowModal(false)}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-neutral-700 bg-black/70 px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                             KEYFRAMES: GOLD-AMBER STREAK                   */
/* -------------------------------------------------------------------------- */

const style = `
@keyframes luxstreak {
  0% {
    transform: translate(-55%, -55%) rotate(0deg);
  }
  100% {
    transform: translate(55%, 55%) rotate(0deg);
  }
}
`;

if (typeof document !== "undefined") {
  const tag = document.createElement("style");
  tag.innerHTML = style;
  document.head.appendChild(tag);
}
