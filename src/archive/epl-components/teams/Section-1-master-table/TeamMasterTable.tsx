import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import type { StatConfig, EPLStatKey } from "@/lib/stats/types";

import TeamInsightsOverlay from "../Section-2-team-insights/TeamInsightsOverlay";
import TeamMasterTableDesktop from "./TeamMasterTableDesktop";
import TeamMasterTableMobile from "./TeamMasterTableMobile";

import { MOCK_TEAMS, TeamRow } from "../data/mockTeams";

export type StatLens = EPLStatKey;

export default function TeamMasterTable({ statConfig }: { statConfig: StatConfig<EPLStatKey> }) {
  const { isPremium } = useAuth();

  const [selectedStat, setSelectedStat] = useState<StatLens>(statConfig.defaultStat);
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const teams = useMemo(() => MOCK_TEAMS, []);

  return (
    <>
      <div className="hidden md:block">
        <TeamMasterTableDesktop
          teams={teams}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectTeam={setSelectedTeam}
          statConfig={statConfig}
        />
      </div>

      <div className="md:hidden">
        <TeamMasterTableMobile
          teams={teams}
          selectedStat={selectedStat}
          setSelectedStat={setSelectedStat}
          isPremium={isPremium}
          query={query}
          setQuery={setQuery}
          onSelectTeam={setSelectedTeam}
          statConfig={statConfig}
        />
      </div>

      {mounted &&
        selectedTeam &&
        createPortal(
          <TeamInsightsOverlay
            team={selectedTeam}
            selectedStat={selectedStat}
            onClose={() => setSelectedTeam(null)}
            onLensChange={setSelectedStat}
            statConfig={statConfig}
          />,
          document.body
        )}
    </>
  );
}
