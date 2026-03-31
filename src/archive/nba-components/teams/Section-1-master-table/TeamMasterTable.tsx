// src/components/nba/teams/TeamMasterTable.tsx

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import type { NBAStatKey } from "@/lib/stats/types";

import TeamInsightsOverlay from "../Section-2-team-insights/TeamInsightsOverlay";
import TeamMasterTableDesktop from "./TeamMasterTableDesktop";
import TeamMasterTableMobile from "./TeamMasterTableMobile";

import { MOCK_TEAMS, TeamRow } from "../data/mockTeams";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type StatLens = NBAStatKey;

/* -------------------------------------------------------------------------- */
/* MASTER TABLE ORCHESTRATOR                                                   */
/* -------------------------------------------------------------------------- */

export default function TeamMasterTable() {
  const { isPremium } = useAuth();

  const [selectedStat, setSelectedStat] = useState<StatLens>("fantasy");
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [query, setQuery] = useState("");
  const [conference, setConference] = useState<"East" | "West">("East");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const teams = useMemo(() => MOCK_TEAMS, []);

  return (
    <>
      {/* ================= DESKTOP ================= */}
      <div className="hidden md:block">
        <TeamMasterTableDesktop
          teams={teams}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          conference={conference}
          setConference={setConference}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectTeam={setSelectedTeam}
        />
      </div>

      {/* ================= MOBILE ================= */}
      <div className="md:hidden">
        <TeamMasterTableMobile
          teams={teams}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          conference={conference}
          setConference={setConference}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectTeam={setSelectedTeam}
        />
      </div>

      {/* ================= INSIGHTS OVERLAY ================= */}
      {mounted &&
        selectedTeam &&
        createPortal(
          <TeamInsightsOverlay
            team={selectedTeam}
            selectedStat={selectedStat}
            onClose={() => setSelectedTeam(null)}
            onLensChange={setSelectedStat}
          />,
          document.body
        )}
    </>
  );
}
