import React, { useMemo, useState, useEffect } from "react";
import { Crown, ChevronDown } from "lucide-react";

import type { FixtureMatch } from "@/components/nba/match-center/types";
import { MOCK_FIXTURES } from "@/components/nba/match-center/mockData";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";
import { LEAGUE_AVAILABILITY } from "@/config/leagueAvailability";
import ComingSoonOverlay from "@/components/ComingSoonOverlay";

import type { PremiumMode } from "@/components/nba/ai-insights/data/types";

import PredictabilityTable from "@/components/nba/ai-insights/Section-2-player-predictability/PredictabilityTable";
import TeamPredictabilityPanel from "@/components/nba/ai-insights/Section-3-team-prediction/TeamPredictabilityPanel";
import GameFlowMomentumPanel from "@/components/nba/ai-insights/Section-4-game-flow/GameFlowMomentumPanel";
import PlayerImpactScatterPanel from "@/components/nba/ai-insights/Section-1-hero-scatter/PlayerImpactScatterPanel";

import {
  filterPastFixtures,
  filterUpcomingFixtures,
  roundOrder,
} from "@/components/nba/ai-insights/data/engine";

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

export default function NBAAIInsights() {
  const isComingSoon = LEAGUE_AVAILABILITY.nba === "coming-soon";

  if (!NBA_STAT_CONFIG?.availableStats?.length) {
    console.error("NBA_STAT_CONFIG missing or invalid");
    return null;
  }

  const fixtures = MOCK_FIXTURES as unknown as FixtureMatch[];

  /* ---------------- GLOBAL STATE ---------------- */

  const [mode, setMode] = useState<PremiumMode>("free");

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
    <div className="relative min-h-screen">
      {isComingSoon && <ComingSoonOverlay league="NBA" />}

      <div className={isComingSoon ? "pointer-events-none blur-sm" : ""}>
        <div className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-12">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">NBA AI Insights</h1>
            <p className="mt-1 text-sm text-white/60">
              Match-scoped intelligence
            </p>
          </div>

          {/* NEEKO+ TOGGLE */}
          <button
            onClick={() =>
              setMode((m) => (m === "premium" ? "free" : "premium"))
            }
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-400/20"
          >
            <Crown className="h-4 w-4" />
            {mode === "premium" ? "Neeko+ ON" : "Neeko+ OFF"}
          </button>
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

        {/* PLAYER IMPACT MAP */}
        {selectedMatch && (
          <PlayerImpactScatterPanel
            match={selectedMatch}
            mode={mode}
            initialLens="fantasy"
          />
        )}

        {/* PLAYER SCORE PREDICTABILITY */}
        {selectedMatch && (
          <PredictabilityTable
            fixtures={pastFixtures}
            match={selectedMatch}
            mode={mode}
          />
        )}

        {/* TEAM SCORE PREDICTABILITY */}
        {selectedMatch && (
          <TeamPredictabilityPanel
            mode={mode}
            match={selectedMatch as any}
            fixtures={pastFixtures}
          />
        )}

        {/* GAME FLOW & MOMENTUM */}
        {selectedMatch && (
          <GameFlowMomentumPanel
            mode={mode}
            match={selectedMatch as any}
            fixtures={pastFixtures}
          />
        )}
        </div>
      </div>
      </div>
    </div>
  );
}
