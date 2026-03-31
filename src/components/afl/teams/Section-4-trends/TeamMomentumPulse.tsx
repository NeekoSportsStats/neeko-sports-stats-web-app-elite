// TEAM MOMENTUM PULSE — T1 PRIME EDITION v4
// - Updated to match existing data model (no invalid fields)
// - Section width now perfectly aligned with TeamDashboardTiles & all other sections
// - Team Dashboard pill applied (Option A)
// - H1-A Premium Depth Hover
// - Fade-in animations preserved
// - Sparkline mobile improved
// - 6 editorial headlines

import React from "react";
import { Flame, Shield, TrendingUp, BarChart3, Zap } from "lucide-react";

const MOCK_TEAMS: any[] = [];

/* ============================================================================
   Inject Keyframes
============================================================================ */

function AnimationStyles() {
  return (
    <style>
      {`
        @keyframes sunlightDrift {
          0%   { background-position: 0% 0%; }
          50%  { background-position: 28% 12%; }
          100% { background-position: 14% 0%; }
        }

        @keyframes fadeUp {
          0%   { opacity: 0; transform: translateY(9px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeUpSoft {
          0%   { opacity: 0; transform: translateY(7px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .hover-depth {
          transition:
            transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1),
            box-shadow 0.25s cubic-bezier(0.2, 0.8, 0.3, 1),
            border-color 0.25s ease-in-out;
        }

        .hover-depth:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow:
            0 12px 34px rgba(0,0,0,0.85),
            0 0 14px rgba(255,211,105,0.25);
          border-color: rgba(255,211,105,0.75);
        }
      `}
    </style>
  );
}

/* ============================================================================
   Sparkline
============================================================================ */

function smooth(values: number[]) {
  if (!values || values.length < 3) return values ?? [];
  const out = [...values];
  for (let i = 1; i < values.length - 1; i++)
    out[i] = (values[i - 1] + values[i] + values[i + 1]) / 3;
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  const smoothed = smooth(values);

  const { points, lastX, lastY } = React.useMemo(() => {
    if (!smoothed || smoothed.length < 2)
      return { points: "0,20 100,20", lastX: 100, lastY: 20 };

    const min = Math.min(...smoothed);
    const max = Math.max(...smoothed);
    const range = max - min || 1;

    let pts = "";
    let lx = 100;
    let ly = 20;

    smoothed.forEach((v, i) => {
      const x =
        smoothed.length === 1 ? 50 : (i / (smoothed.length - 1)) * 100;
      const normalized = (v - min) / range;
      const y = 34 - normalized * 20;

      pts += `${x},${y} `;
      if (i === smoothed.length - 1) {
        lx = x;
        ly = y;
      }
    });

    return { points: pts.trim(), lastX: lx, lastY: ly };
  }, [smoothed]);

  return (
    <div className="relative h-16 sm:h-16 w-full overflow-hidden rounded-xl border border-neutral-800/70 bg-black/85">
      <svg viewBox="0 0 100 40" className="h-full w-full">
        <defs>
          <filter id="sparkline-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feBlend in="SourceGraphic" in2="blur" mode="screen" />
          </filter>
        </defs>

        {/* Soft gridlines */}
        <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.08)" />
        <line x1="0" y1="22" x2="100" y2="22" stroke="rgba(255,255,255,0.06)" />
        <line x1="0" y1="14" x2="100" y2="14" stroke="rgba(255,255,255,0.04)" />

        <polyline
          points={points}
          stroke="rgba(255,211,105,0.45)"
          strokeWidth={2.5}
          fill="none"
          filter="url(#sparkline-glow)"
        />

        <polyline points={points} stroke="white" strokeWidth={1.6} fill="none" />

        <circle cx={lastX} cy={lastY} r={1.7} fill="white" />
      </svg>
    </div>
  );
}

/* ============================================================================
   Insight Card
============================================================================ */

function InsightCard({
  title,
  team,
  metricValue,
  metricLabel,
  values,
  icon: Icon,
}: {
  title: string;
  team: string;
  metricValue: string;
  metricLabel: string;
  values: number[];
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <div
      className="hover-depth rounded-2xl bg-black/65 p-5 backdrop-blur-[1px]"
      style={{
        border: "1px solid rgba(255,211,105,0.45)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.75)",
      }}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.20em] text-[rgba(255,211,105,0.95)]">
        <Icon className="h-4 w-4" />
        {title}
      </div>

      <div className="mt-2 text-xl font-semibold text-white">{team}</div>

      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[rgba(255,211,105,0.6)] bg-black/85 px-3 py-[6px]">
        <span className="text-sm font-semibold text-white">{metricValue}</span>
        <span className="text-[11px] text-neutral-300">{metricLabel}</span>
      </div>

      <div className="mt-3">
        <Sparkline values={values} />
      </div>
    </div>
  );
}

/* ============================================================================
   Headlines Card (static)
============================================================================ */

function HeadlinesCard({ items, className }: { items: string[]; className?: string }) {
  return (
    <div
      className={`relative rounded-2xl border border-[rgba(255,211,105,0.45)] bg-black/72 px-7 py-6 shadow-[0_10px_28px_rgba(0,0,0,0.75)] backdrop-blur-[2px] ${className}`}
    >
      <div className="absolute left-4 top-5 bottom-5 w-[2px] bg-gradient-to-b from-[rgba(255,211,105,1)] via-[rgba(255,211,105,0.6)] to-transparent rounded-full" />

      <div className="pl-5 flex h-full flex-col">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(255,220,138,1)]">
          <Zap className="h-4 w-4 text-[rgba(255,220,138,1)]" />
          Key Headlines
        </div>

        <ul className="mt-3 space-y-2 text-sm text-neutral-200 leading-relaxed">
          {items.map((h, i) => (
            <li key={i}>• {h}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ============================================================================
   Main Component
============================================================================ */

export default function TeamMomentumPulse() {
  const roundIndex = 22;
  const prev = roundIndex - 1;

  const teams = MOCK_TEAMS;

  const placeholderTeam = {
    name: "—",
    attackRating: 0,
    defenceRating: 0,
    scores: [0],
    margins: [0],
    attackTrend: [0, 0, 0],
    defenceTrend: [0, 0, 0]
  };

  const fantasyTeam = teams.length > 0 ? [...teams].sort((a, b) => (b.attackRating || 0) - (a.attackRating || 0))[0] : placeholderTeam;
  const scoringTeam = teams.length > 0 ? [...teams].sort((a, b) => ((b.scores || [])[roundIndex] || 0) - ((a.scores || [])[roundIndex] || 0))[0] : placeholderTeam;
  const defenceTeam = teams.length > 0 ? [...teams].sort((a, b) => (b.defenceRating || 0) - (a.defenceRating || 0))[0] : placeholderTeam;

  const momentum = teams.length > 0
    ? teams
        .map(t => ({
          team: t,
          delta: ((t.margins || [])[roundIndex] || 0) - ((t.margins || [])[prev] || 0),
        }))
        .sort((a, b) => b.delta - a.delta)[0]
    : { team: placeholderTeam, delta: 0 };

  const headlines = [
    "Midfield usage shifted significantly this round, with several clubs testing wider rotations.",
    `${fantasyTeam.name || "—"} drove a major fantasy surge thanks to increased stoppage exposure.`,
    `${defenceTeam.name || "—"} maintained elite defensive structure for extended phases.`,
    `${momentum.team.name || "—"} produced the strongest round-to-round momentum lift in R22 → R23.`,
    "Hybrid forward–mid roles delivered spikes in contest generation and volatility.",
    "Late-match defensive tightening reduced scoring flow across multiple games.",
  ];

  return (
    <section className="w-full mt-10">
      <AnimationStyles />

      <div
        className="relative overflow-hidden rounded-3xl border border-neutral-800/70 p-6 sm:p-8 md:p-10 shadow-[0_0_60px_rgba(0,0,0,0.75)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, rgba(255,211,105,0.22), transparent 70%), linear-gradient(to bottom, #181818, #080808, #010101)",
          backgroundSize: "140% 140%",
          animation: "sunlightDrift 14s ease-in-out infinite alternate",
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_bottom,rgba(0,0,0,0.55),transparent_65%)]" />

        <div
          className="relative"
          style={{ animation: "fadeUp 650ms ease-out forwards", opacity: 0 }}
        >
          {/* TEAM DASHBOARD PILL — Option A */}
          <div
            className="
              inline-flex items-center gap-[6px]
              rounded-full
              border border-[rgba(255,211,105,0.75)]
              bg-black/80
              px-4 py-1
              text-[10px] uppercase tracking-[0.22em]
              text-[rgba(255,220,138,1)]
            "
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[rgba(255,220,138,1)]" />
            Round Momentum Pulse • R23
          </div>

          <h2 className="mt-5 text-[22px] font-semibold text-white md:text-[24px]">
            League-wide fantasy trends &amp; team momentum highlights
          </h2>

          <p className="mt-2 max-w-3xl text-[15px] leading-snug text-neutral-200">
            Round 23 fantasy trends reveal usage spikes, role changes and matchup
            edges shaping team performance league-wide.
          </p>

          <div className="mt-5 h-px w-full bg-gradient-to-r from-[rgba(255,211,105,0.4)] via-neutral-700/65 to-transparent" />

          <div
            className="mt-8 grid items-stretch gap-12 lg:grid-cols-[1.35fr_0.9fr]"
            style={{ animation: "fadeUpSoft 700ms ease-out 120ms forwards", opacity: 0 }}
          >
            {/* Metric cards */}
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.24em] text-[rgba(255,211,105,0.95)]">
                Round 23 Summary Metrics
              </h3>

              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <InsightCard
                  title="Highest Fantasy Surge"
                  team={fantasyTeam.name || "—"}
                  metricValue={`${fantasyTeam.attackRating || 0}/100`}
                  metricLabel="Usage score"
                  values={fantasyTeam.attackTrend || [0, 0, 0]}
                  icon={BarChart3}
                />

                <InsightCard
                  title="Most Dominant Scoring Team"
                  team={scoringTeam.name || "—"}
                  metricValue={`${(scoringTeam.scores || [])[roundIndex] || 0} pts`}
                  metricLabel="Score impact"
                  values={scoringTeam.scores || [0, 0, 0]}
                  icon={Flame}
                />

                <InsightCard
                  title="Strongest Defensive Wall"
                  team={defenceTeam.name || "—"}
                  metricValue={`${defenceTeam.defenceRating || 0}/100`}
                  metricLabel="Defence rating"
                  values={defenceTeam.defenceTrend || [0, 0, 0]}
                  icon={Shield}
                />

                <InsightCard
                  title="Biggest Momentum Riser"
                  team={momentum.team.name || "—"}
                  metricValue={`${momentum.delta || 0} pts`}
                  metricLabel="Momentum swing"
                  values={momentum.team.margins || [0, 0, 0]}
                  icon={TrendingUp}
                />
              </div>
            </div>

            {/* Headlines */}
            <div className="lg:pt-4 flex lg:h-full">
              <HeadlinesCard items={headlines} className="h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
