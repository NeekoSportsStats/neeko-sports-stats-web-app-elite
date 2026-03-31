import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import type { StatConfig, StatKey } from "@/lib/stats/types";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";
import PlayerInsightsOverlay from "../Section-2-player-insights/PlayerInsightsOverlay";
import MasterTableDesktop from "./MasterTableDesktop";
import MasterTableMobile from "./MasterTableMobile";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type StatLens = StatKey;

export type PlayerRow = {
  id: number;
  rank: number;
  name: string;
  team: string;
  role: string;
  stats: Record<StatLens, number[]>;
};

/* -------------------------------------------------------------------------- */
/* MOCK DATA                                                                  */
/* -------------------------------------------------------------------------- */

function buildMockPlayers(): PlayerRow[] {
  const list: PlayerRow[] = [];
  const totalGames = NBA_STAT_CONFIG.sportMeta.totalRounds ?? 82;

  for (let i = 1; i <= 60; i++) {
    const role = ["PG","SG","SF","PF","C"][i % 5];
    const pts: number[] = [];
    const reb: number[] = [];
    const ast: number[] = [];
    const threes: number[] = [];
    const fantasy: number[] = [];

    for (let g = 0; g < totalGames; g++) {
      const p = 10 + Math.round(Math.random() * 30);
      const r = 2 + Math.round(Math.random() * 14);
      const a = 1 + Math.round(Math.random() * 12);
      const t = Math.round(Math.random() * 5);

      // NBA Fantasy formula: pts + (reb * 1.2) + (ast * 1.5) + (3pm * 3)
      const f = p + (r * 1.2) + (a * 1.5) + (t * 3);

      pts.push(p);
      reb.push(r);
      ast.push(a);
      threes.push(t);
      fantasy.push(Math.round(f));
    }

    list.push({
      id: i,
      rank: i,
      name: `Player ${i}`,
      team: ["LAL","GSW","BOS","MIA","DEN","PHX"][i % 6],
      role,
      stats: {
        fantasy,
        points: pts,
        rebounds: reb,
        assists: ast,
        threes,
      } as Record<StatLens, number[]>,
    });
  }

  return list;
}

const MOCK_PLAYERS = buildMockPlayers();

/* -------------------------------------------------------------------------- */
/* MASTER TABLE ORCHESTRATOR                                                   */
/* -------------------------------------------------------------------------- */

export default function MasterTable({ statConfig }: { statConfig: StatConfig }) {
  const { isPremium } = useAuth();

  const [selectedStat, setSelectedStat] = useState<StatLens>(statConfig.defaultStat);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const players = useMemo(() => MOCK_PLAYERS, []);

  return (
    <>
      {/* ================= DESKTOP ================= */}
      <div className="hidden md:block">
        <MasterTableDesktop
          players={players}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectPlayer={setSelectedPlayer}
          statConfig={statConfig}
        />
      </div>

      {/* ================= MOBILE ================= */}
      <div className="md:hidden">
        <MasterTableMobile
          players={players}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectPlayer={setSelectedPlayer}
          statConfig={statConfig}
        />
      </div>

      {/* ================= INSIGHTS OVERLAY ================= */}
      {mounted &&
        selectedPlayer &&
        createPortal(
          <PlayerInsightsOverlay
            player={selectedPlayer}
            selectedStat={selectedStat}
            onClose={() => setSelectedPlayer(null)}
            onLensChange={setSelectedStat}
          />,
          document.body
        )}
    </>
  );
}
