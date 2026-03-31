// src/components/epl/teams/TeamRoundSummary.tsx

import React, { useMemo } from "react";
import { MOCK_TEAMS } from "../data/mockTeams";
import { Flame, TrendingUp, Shield, Activity, Sparkles } from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

/* -------------------------------------------------------------------------- */
/*                         SPARKLINE PLACEHOLDER (UI-ONLY)                    */
/* -------------------------------------------------------------------------- */

function Sparkline({ values }: { values: number[] }) {
  return (
    <div className="relative h-12 w-full overflow-hidden rounded-xl bg-gradient-to-b from-neutral-800/70 via-neutral-900/80 to-black shadow-[0_0_26px_rgba(0,0,0,0.8)]">
      {/* highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/8 via-white/2 to-transparent" />
      {/* midline */}
      <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-neutral-600/40 to-transparent" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          TEAM MATCHWEEK PULSE                              */
/* -------------------------------------------------------------------------- */

export default function TeamRoundSummary() {
  // Compute league-wide average sparkline
  const leagueAvgSpark = useMemo(() => {
    const rounds = 38;
    const arr: number[] = [];
    for (let r = 0; r < rounds; r++) {
      const roundScores = MOCK_TEAMS.map((t) => t.scores[r]);
      arr.push(
        Math.round(
          roundScores.reduce((a, b) => a + b, 0) / roundScores.length
        )
      );
    }
    return arr;
  }, []);

  /* ------------------------------ HEADLINES -------------------------------- */

  const highestScoring = useMemo(() => {
    const lastRound = 37;
    return [...MOCK_TEAMS].sort(
      (a, b) => b.scores[lastRound] - a.scores[lastRound]
    )[0];
  }, []);

  const strongestDefence = useMemo(() => {
    return [...MOCK_TEAMS].sort(
      (a, b) => a.defenceRating - b.defenceRating
    )[0];
  }, []);

  const biggestRiser = useMemo(() => {
    return [...MOCK_TEAMS]
      .map((t) => ({
        team: t,
        delta: t.margins[37] - t.margins[36],
      }))
      .sort((a, b) => b.delta - a.delta)[0];
  }, []);

  const predictedVolatility = useMemo(() => {
    return [...MOCK_TEAMS].sort(
      (a, b) => b.consistencyIndex - a.consistencyIndex
    )[0];
  }, []);

  /* -------------------------------------------------------------------------- */

  return (
    <section
      className="
        mt-6 md:mt-8
        w-full
        rounded-3xl
        border border-yellow-500/10
        bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.09),transparent_60%),linear-gradient(to_bottom,#020617,#020617,#000000)]
        px-4 py-5 md:px-6 md:py-7
        shadow-[0_0_46px_rgba(0,0,0,0.85)]
      "
    >
      <SectionHeader
        pillLabel="Matchweek Momentum Pulse"
        title="League-wide momentum trends & team signals"
        description="Matchweek-by-matchweek scoring flow, defensive stability, movement indicators and team-level momentum signals."
        icon={Sparkles}
      />

      {/* LEAGUE-WIDE SCORING PULSE */}
      <div className="mt-6 rounded-2xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/70 via-neutral-950/90 to-black p-5 shadow-[0_0_32px_rgba(0,0,0,0.9)]">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
          League scoring pulse
        </div>
        <div className="mt-3">
          <Sparkline values={leagueAvgSpark} />
        </div>
      </div>

      {/* HEADLINE GRID (4-up) */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Highest scoring */}
        <div className="rounded-2xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/80 via-neutral-950/90 to-black p-5 shadow-[0_0_26px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 text-yellow-300">
            <Flame className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Highest Scoring (MW38)
            </span>
          </div>
          <div className="mt-2 text-lg font-semibold text-neutral-50">
            {highestScoring.name}
          </div>
          <div className="mt-3">
            <Sparkline values={highestScoring.scores} />
          </div>
        </div>

        {/* Strongest defence */}
        <div className="rounded-2xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/80 via-neutral-950/90 to-black p-5 shadow-[0_0_26px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 text-teal-300">
            <Shield className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Strongest Defensive Wall
            </span>
          </div>
          <div className="mt-2 text-lg font-semibold text-neutral-50">
            {strongestDefence.name}
          </div>
          <div className="mt-3">
            <Sparkline values={strongestDefence.margins} />
          </div>
        </div>

        {/* Biggest riser */}
        <div className="rounded-2xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/80 via-neutral-950/90 to-black p-5 shadow-[0_0_26px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 text-lime-300">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Biggest Momentum Riser
            </span>
          </div>
          <div className="mt-2 text-lg font-semibold text-neutral-50">
            {biggestRiser.team.name}
          </div>
          <div className="mt-3">
            <Sparkline values={biggestRiser.team.margins} />
          </div>
        </div>

        {/* Predicted volatility */}
        <div className="rounded-2xl border border-neutral-800/80 bg-gradient-to-b from-neutral-900/80 via-neutral-950/90 to-black p-5 shadow-[0_0_26px_rgba(0,0,0,0.85)]">
          <div className="flex items-center gap-2 text-orange-300">
            <Activity className="h-4 w-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Predicted Volatility (AI)
            </span>
          </div>
          <div className="mt-2 text-lg font-semibold text-neutral-50">
            {predictedVolatility.name}
          </div>
          <div className="mt-3">
            <Sparkline values={predictedVolatility.scores} />
          </div>
        </div>
      </div>
    </section>
  );
}
