// src/components/afl/teams/TeamAIInsights.tsx

import React from "react";
import { MOCK_TEAMS, AFLTeam } from "../data/mockTeams";
import { Lock, X, ArrowRight } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                HELPER FUNCS                                */
/* -------------------------------------------------------------------------- */

const avg = (arr: number[]): number =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const volatility = (arr: number[]): number => {
  if (arr.length < 2) return 0;
  return Math.max(...arr) - Math.min(...arr);
};

const lastN = (arr: number[], n: number) => arr.slice(-n);

/* -------------------------------------------------------------------------- */
/*                          TEAM AI INSIGHT GENERATOR                          */
/* -------------------------------------------------------------------------- */

function buildLeagueBaselines() {
  const leagueAttack = avg(MOCK_TEAMS.map((t) => avg(lastN(t.scores, 5))));
  const leagueDefence = avg(
    MOCK_TEAMS.map((t) => {
      const against = t.scores.map((s, i) => s - t.margins[i]);
      return avg(lastN(against, 5));
    })
  );
  const leagueClearance = avg(
    MOCK_TEAMS.map((t) => avg(lastN(t.clearanceDom, 5)))
  );
  const leagueVolatility = avg(
    MOCK_TEAMS.map((t) => volatility(lastN(t.margins, 5)))
  );

  return {
    leagueAttack,
    leagueDefence,
    leagueClearance,
    leagueVolatility,
  };
}

function buildTeamInsightLines(
  team: AFLTeam,
  baselines: ReturnType<typeof buildLeagueBaselines>
): string[] {
  const last5Scores = lastN(team.scores, 5);
  const last5Margins = lastN(team.margins, 5);
  const last5Clear = lastN(team.clearanceDom, 5);

  const against = team.scores.map((s, i) => s - team.margins[i]);
  const last5Against = lastN(against, 5);

  const attackAvg = avg(last5Scores);
  const defenceAvg = avg(last5Against);
  const clearAvg = avg(last5Clear);
  const vol = volatility(last5Margins);

  const { leagueAttack, leagueDefence, leagueClearance, leagueVolatility } =
    baselines;

  const lines: string[] = [];

  // Momentum window
  if (vol < leagueVolatility * 0.8)
    lines.push(
      `${team.name} is entering a stabilising window with decreasing volatility.`
    );
  else if (vol > leagueVolatility * 1.15)
    lines.push(
      `${team.name} shows elevated round-to-round swing, indicating unstable momentum.`
    );
  else
    lines.push(
      `${team.name} momentum is tracking in line with league-wide volatility levels.`
    );

  // Attack
  if (attackAvg > leagueAttack * 1.05)
    lines.push(
      `${team.name} is trending above league attack averages over the last 5 rounds.`
    );
  else if (attackAvg < leagueAttack * 0.95)
    lines.push(
      `${team.name} attack output is currently below league-wide expectations.`
    );
  else
    lines.push(
      `${team.name} attack output is holding close to league averages recently.`
    );

  // Defence
  if (defenceAvg < leagueDefence * 0.95)
    lines.push(
      `${team.name} defensive profile has tightened relative to league averages.`
    );
  else if (defenceAvg > leagueDefence * 1.05)
    lines.push(`${team.name} defence is conceding above projected levels.`);
  else lines.push(`${team.name} defence is conceding in line with league norms.`);

  // Clearances
  if (clearAvg > leagueClearance * 1.05)
    lines.push(
      `${team.name} clearance differential is trending above league norms.`
    );
  else if (clearAvg < leagueClearance * 0.95)
    lines.push(
      `${team.name} clearance differential is trending below league norms.`
    );
  else
    lines.push(
      `${team.name} clearance differential is hovering around league averages.`
    );

  return lines;
}

/* -------------------------------------------------------------------------- */
/*                              CARD COMPONENTS                               */
/* -------------------------------------------------------------------------- */

const RealCard = ({ team, lines }: { team: AFLTeam; lines: string[] }) => (
  <article className="min-w-[260px] snap-start rounded-3xl border border-neutral-800/90 bg-gradient-to-b from-black/96 via-neutral-950 to-black px-5 py-5 text-xs text-neutral-200 shadow-[0_0_45px_rgba(0,0,0,0.8)] transition hover:brightness-110">
    <div className="mb-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/90">
          AI Team Insights
        </div>
        <div className="mt-1 text-sm font-semibold text-neutral-50">
          {team.name}
        </div>
      </div>
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border border-yellow-500/50"
        style={{
          background:
            "radial-gradient(circle at 30% 0%, rgba(250,204,21,0.35), transparent 55%)",
        }}
      >
        <span
          className="h-2 w-2 rounded-full shadow-[0_0_14px_rgba(250,204,21,0.9)]"
          style={{ backgroundColor: "#FACC15" }}
        />
      </div>
    </div>

    <ul className="space-y-1.5 leading-relaxed text-[11px]">
      {lines.map((line, idx) => (
        <li key={idx} className="flex gap-2">
          <span className="mt-[4px] h-[3px] w-[3px] rounded-full bg-neutral-500" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  </article>
);

/* -------------------------------------------------------------------------- */
/*                    BLURRED CARD WITH GOLD → AMBER STREAK                   */
/* -------------------------------------------------------------------------- */

const BlurredCard = () => (
  <article
    className="relative min-w-[260px] snap-start rounded-3xl border border-yellow-500/25
    bg-black/50 px-5 py-5 backdrop-blur-2xl opacity-30 scale-[0.98]
    select-none pointer-events-none shadow-[0_0_45px_rgba(0,0,0,0.8)] overflow-hidden"
  >

    {/* Deep blur base layer */}
    <div className="absolute inset-0 backdrop-blur-3xl bg-black/40 pointer-events-none z-0" />

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
      <div className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center
        rounded-full border border-yellow-500/50 bg-black/70
        shadow-[0_0_16px_rgba(250,204,21,0.65)]">
        <Lock className="h-3.5 w-3.5 text-yellow-300" />
      </div>

      <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/80">
        AI Insights Locked
      </div>

      <div className="mt-1 text-sm font-semibold text-neutral-200/80">
        Hidden Team
      </div>

      <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-neutral-300/75">
        <li className="flex gap-2">
          <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
          <span>Attack trend unavailable</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
          <span>Defensive model hidden</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-[5px] h-[3px] w-[3px] rounded-full bg-neutral-400/80" />
          <span>Momentum volatility locked</span>
        </li>
      </ul>
    </div>
  </article>
);

/* -------------------------------------------------------------------------- */
/*                                MAIN SECTION                                */
/* -------------------------------------------------------------------------- */

export default function TeamAIInsights() {
  const baselines = buildLeagueBaselines();
  const items = MOCK_TEAMS.map((team) => ({
    team,
    lines: buildTeamInsightLines(team, baselines),
  }));

  const VISIBLE = items.slice(0, 3);
  const LOCKED = items.slice(3, 6);

  const [showModal, setShowModal] = React.useState(false);

  return (
    <>
      <section className="mt-14 rounded-3xl border border-neutral-800/80 bg-gradient-to-b from-neutral-950/95 via-black/96 to-black px-6 py-8 shadow-[0_0_60px_rgba(0,0,0,0.9)]">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/40 bg-gradient-to-r from-yellow-500/20 via-yellow-500/5 to-transparent px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.9)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-200/90">
              AI Insights
            </span>
          </div>

          <h3 className="mt-3 text-xl font-semibold text-neutral-50 md:text-2xl">
            High-level team trends (preview)
          </h3>

          <p className="mt-2 max-w-2xl text-xs text-neutral-400">
            Your lightweight AI snapshot for momentum, attack/defence shifts and
            clearance trends. Unlock full intelligence to view all 18 clubs.
          </p>
        </div>

        {/* Row 1 */}
        <div className="mb-6 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {VISIBLE.map(({ team, lines }) => (
            <RealCard key={team.id} team={team} lines={lines} />
          ))}
        </div>

        {/* Row 2 */}
        <div className="mb-8 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible">
          {LOCKED.map((_, idx) => (
            <BlurredCard key={idx} />
          ))}
        </div>

        {/* Neeko+ CTA */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="group inline-flex w-full items-center justify-between rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-yellow-500/0 to-transparent px-6 py-4 text-left transition hover:brightness-110"
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-200/80">
              Neeko+ AI
            </div>
            <div className="mt-1 text-sm font-semibold text-yellow-100">
              Unlock full AFL AI intelligence across all 18 clubs
            </div>
            <p className="mt-1 text-xs text-neutral-300">
              Access deeper trend breakdowns, AI-driven matchup flags, volatility
              curves and premium forecasting.
            </p>
          </div>

          <div className="ml-4 flex h-9 w-9 items-center justify-center rounded-full border border-yellow-400/50 bg-black/60 shadow-[0_0_14px_rgba(250,204,21,0.6)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            <ArrowRight className="h-4 w-4 text-yellow-300" />
          </div>
        </button>
      </section>

      {/* Neeko+ Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-yellow-500/40 bg-gradient-to-b from-neutral-950 via-black to-black px-6 py-6 shadow-[0_0_80px_rgba(0,0,0,1)]">

            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700/70 bg-black/70 text-neutral-300 hover:text-white hover:border-neutral-500 transition"
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
              Unlock full AFL AI analysis
            </h3>

            <p className="mt-2 text-xs text-neutral-300">
              Neeko+ unlocks every team, every trend, volatility models,
              forecasting and AI-generated matchup insights.
            </p>

            <ul className="mt-4 space-y-2 text-xs text-neutral-200">
              <li className="flex gap-2">
                <span className="h-[4px] w-[4px] rounded-full bg-yellow-400 mt-[5px]" />
                <span>Full analysis for all 18 AFL clubs.</span>
              </li>
              <li className="flex gap-2">
                <span className="h-[4px] w-[4px] rounded-full bg-yellow-400 mt-[5px]" />
                <span>Momentum, defence/attack & clearance deep-dive.</span>
              </li>
              <li className="flex gap-2">
                <span className="h-[4px] w-[4px] rounded-full bg-yellow-400 mt-[5px]" />
                <span>Premium features across other sports as they launch.</span>
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">

              <a
                href="https://www.neekostats.com.au/neeko-plus"
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-yellow-400/70 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_30px_rgba(250,204,21,0.85)] hover:brightness-110 transition"
              >
                Upgrade to Neeko+
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>

              <button
                onClick={() => setShowModal(false)}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-neutral-700 bg-black/70 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white transition"
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
