import React, { useMemo, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

import type { FixtureMatch } from "@/components/afl/match-center/types";
import { MOCK_FIXTURES } from "@/components/afl/match-center/mockData";

import GamePreviewAI from "@/features/afl/ai-insights/sections/GamePreviewAI";
import AIPlayerPredictions from "@/features/afl/ai-insights/sections/AIPlayerPredictions";
import AITeamPredictions from "@/features/afl/ai-insights/sections/AITeamPredictions";
import MasterGrid from "@/features/afl/ai-insights/sections/MasterGrid";

import {
  filterPastFixtures,
  filterUpcomingFixtures,
  roundOrder,
} from "@/components/afl/ai-insights/data/engine";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function currentRound(fixtures: FixtureMatch[]) {
  const upcoming = filterUpcomingFixtures(fixtures);
  if (!upcoming.length) return "";
  return [...upcoming].sort(
    (a, b) =>
      roundOrder((a as any).roundLabel) -
      roundOrder((b as any).roundLabel)
  )[0].roundLabel;
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function AFLAIInsights() {
  const fixtures = MOCK_FIXTURES as unknown as FixtureMatch[];

  /* ---------------- ROUND + MATCH ---------------- */

  const pastFixtures = useMemo(
    () => filterPastFixtures(fixtures),
    [fixtures]
  );

  const roundLabel = useMemo(
    () => currentRound(fixtures),
    [fixtures]
  );

  const roundMatches = useMemo(
    () =>
      filterUpcomingFixtures(fixtures).filter(
        (m: any) => m.roundLabel === roundLabel
      ),
    [fixtures, roundLabel]
  );

  const [matchId, setMatchId] = useState<string>("");

  useEffect(() => {
    if (roundMatches.length && !matchId) {
      setMatchId(String((roundMatches[0] as any).id));
    }
  }, [roundMatches, matchId]);

  const selectedMatch = useMemo(
    () =>
      roundMatches.find(
        (m: any) => String(m.id) === String(matchId)
      ),
    [roundMatches, matchId]
  );


  /* -------------------------------------------------------------------------- */
  /* RENDER                                                                    */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-12">
        {/* HEADER */}
        <header>
          <h1 className="text-3xl font-bold">AFL AI Insights</h1>
          <p className="mt-1 text-sm text-white/60">
            Match-scoped intelligence
          </p>
        </header>

        {/* MATCH SELECTOR */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-white/70">Match this round</div>

          <div className="relative">
            <select
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              className="appearance-none rounded-full border border-white/10 bg-black/40 py-1.5 pl-3 pr-9 text-sm"
            >
              {roundMatches.map((m: any) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.homeTeam} vs {m.awayTeam}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
          </div>
        </div>

        {/* SECTION 1: GAME PREVIEW AI */}
        <GamePreviewAI
          selectedMatch={selectedMatch}
          pastFixtures={pastFixtures}
        />

        {/* SECTION 2: AI PLAYER PREDICTIONS */}
        <AIPlayerPredictions
          selectedMatch={selectedMatch}
          pastFixtures={pastFixtures}
        />

        {/* SECTION 3: AI TEAM PREDICTIONS */}
        <AITeamPredictions
          selectedMatch={selectedMatch}
          pastFixtures={pastFixtures}
        />

        {/* SECTION 4: MASTER GRID */}
        <MasterGrid />
      </div>
    </div>
  );
}
