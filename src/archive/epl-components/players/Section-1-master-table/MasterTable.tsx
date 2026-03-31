import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";

import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import PlayerInsightsOverlay from "../Section-2-player-insights/PlayerInsightsOverlay";
import MasterTableDesktop from "./MasterTableDesktop";
import MasterTableMobile from "./MasterTableMobile";

import type { EPLStatKey } from "@/lib/stats/types";

export type StatLens = EPLStatKey;

export type PlayerRow = {
  id: number;
  rank: number;
  name: string;
  team: string;
  role: string;

  stats: Record<StatLens, number[]>;
};

function buildMockPlayers(): PlayerRow[] {
  const statKeys = EPL_STAT_CONFIG.availableStats as StatLens[];
  const totalRounds = EPL_STAT_CONFIG.sportMeta.totalRounds!;

  return Array.from({ length: 80 }).map((_, i) => {
    const stats: Record<StatLens, number[]> = {} as any;

    const goals: number[] = [];
    const assists: number[] = [];
    const shots: number[] = [];
    const shotsOnTarget: number[] = [];
    const xg: number[] = [];
    const fantasy: number[] = [];

    for (let r = 0; r < totalRounds; r++) {
      const g = Math.random() < 0.25 ? 1 : 0;
      const a = Math.random() < 0.15 ? 1 : 0;
      const s = Math.round(Math.random() * 4);
      const sot = Math.round(Math.random() * 2);
      const xgVal = +(Math.random() * 0.6).toFixed(2);

      const fantasyScore = Math.round(
        g * 8 +
        a * 5 +
        s * 1 +
        sot * 2 +
        xgVal * 6
      );

      goals.push(g);
      assists.push(a);
      shots.push(s);
      shotsOnTarget.push(sot);
      xg.push(xgVal);
      fantasy.push(fantasyScore);
    }

    stats.fantasy = fantasy;
    stats.goals = goals;
    stats.assists = assists;
    stats.shots = shots;
    stats.shotsOnTarget = shotsOnTarget;
    stats.xg = xg;

    return {
      id: i + 1,
      rank: i + 1,
      name: `Player ${i + 1}`,
      team: ["ARS", "MCI", "LIV", "CHE", "TOT", "NEW"][i % 6],
      role: ["FWD", "MID", "DEF", "GK"][i % 4],
      stats,
    };
  });
}

const MOCK_PLAYERS = buildMockPlayers();

export default function MasterTable() {
  const { isPremium } = useAuth();

  const [selectedStat, setSelectedStat] = useState<StatLens>(
    EPL_STAT_CONFIG.defaultStat
  );
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const players = useMemo(() => MOCK_PLAYERS, []);

  return (
    <>
      <div className="hidden md:block">
        <MasterTableDesktop
          players={players}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectPlayer={setSelectedPlayer}
        />
      </div>

      <div className="md:hidden">
        <MasterTableMobile
          players={players}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectPlayer={setSelectedPlayer}
        />
      </div>

      {mounted &&
        selectedPlayer &&
        createPortal(
          <PlayerInsightsOverlay
            player={selectedPlayer}
            selectedStat={selectedStat}
            onClose={() => setSelectedPlayer(null)}
            onLensChange={setSelectedStat}
            isPremium={isPremium}
          />,
          document.body
        )}
    </>
  );
}
