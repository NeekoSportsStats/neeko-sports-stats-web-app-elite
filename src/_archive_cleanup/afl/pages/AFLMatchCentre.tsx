// src/pages/sports/afl/AFLMatchCentre.tsx
import React, { useMemo, useState } from "react";

import MatchCenterHeader from "@/components/afl/match-center/MatchCenterHeader";
import MatchList from "@/components/afl/match-center/MatchList";
import LadderSnapshot, { type LadderRow } from "@/components/afl/match-center/LadderSnapshot";
import SeasonRoundSelector from "@/components/afl/match-center/SeasonRoundSelector";

import { MOCK_FIXTURES, MOCK_LADDER_TOP16 } from "@/components/afl/match-center/mockData";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";

type Season = 2025 | 2026;

/* -------------------------------------------------------------------------- */
/* NORMALISE LADDER                                                            */
/* -------------------------------------------------------------------------- */

function normaliseLadder(rows: any[]): LadderRow[] {
  if (rows.length && "pos" in rows[0] && "played" in rows[0]) {
    return rows as LadderRow[];
  }

  return rows.map((r, idx) => {
    const [wins = 0, losses = 0] =
      typeof r.record === "string" ? r.record.split("-").map(Number) : [];

    return {
      pos: r.rank ?? idx + 1,
      team: r.team,
      played: wins + losses,
      wins,
      losses,
      draws: 0,
      percentage: 100,
    };
  });
}

function toDateTimeISO(m: FixtureMatch) {
  return `${m.dateISO}T${m.timeLocal}:00`;
}

/* -------------------------------------------------------------------------- */
/* DEFAULT SEASON + ROUND                                                      */
/* -------------------------------------------------------------------------- */

function getDefaultSeasonRound(fixtures: FixtureMatch[]) {
  const now = new Date();

  const sorted = fixtures
    .slice()
    .sort((a, b) => toDateTimeISO(a).localeCompare(toDateTimeISO(b)));

  const nextUpcoming = sorted.find(
    (m) => m.status === "upcoming" && new Date(toDateTimeISO(m)) >= now
  );

  if (nextUpcoming) {
    return { season: nextUpcoming.season, roundNumber: nextUpcoming.roundNumber };
  }

  const lastFinal = [...sorted].reverse().find((m) => m.status === "final");
  if (lastFinal) {
    return { season: lastFinal.season, roundNumber: lastFinal.roundNumber };
  }

  return { season: 2026 as Season, roundNumber: 0 };
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                        */
/* -------------------------------------------------------------------------- */

export default function AFLMatchCentre() {
  const initial = useMemo(() => getDefaultSeasonRound(MOCK_FIXTURES), []);
  const [season, setSeason] = useState<Season>(initial.season);
  const [roundNumber, setRoundNumber] = useState<number>(initial.roundNumber);

  const isDefaultRound =
    season === initial.season && roundNumber === initial.roundNumber;

  const filtered = useMemo(() => {
    return MOCK_FIXTURES
      .filter((m) => m.season === season && m.roundNumber === roundNumber)
      .slice()
      .sort((a, b) => toDateTimeISO(a).localeCompare(toDateTimeISO(b)));
  }, [season, roundNumber]);

  const ladderRows = useMemo(
    () => normaliseLadder(MOCK_LADDER_TOP16 as any[]),
    []
  );

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
      <MatchCenterHeader />

      <div className="mt-6">
        <SeasonRoundSelector
          season={season}
          roundNumber={roundNumber}
          onChangeSeason={setSeason}
          onChangeRound={setRoundNumber}
          isDefaultRound={isDefaultRound}
        />
      </div>

      <div className="mt-6 space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-white mb-4">Match Overview</h2>
          <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
            <MatchList matches={filtered} statConfig={AFL_STAT_CONFIG} />

            <div className="hidden lg:block space-y-4">
              <h3 className="text-lg font-semibold text-white">Ladder</h3>
              <LadderSnapshot rows={ladderRows} />
            </div>
          </div>
        </section>

        <section className="lg:hidden">
          <h2 className="text-xl font-semibold text-white mb-4">Ladder</h2>
          <LadderSnapshot rows={ladderRows} />
        </section>
      </div>
    </div>
  );
}
