import React, { useMemo } from "react";
import PlayerImpactScatterPanel from "@/components/afl/ai-insights/Section-1-hero-scatter/PlayerImpactScatterPanel";
import type { FixtureMatch } from "@/components/afl/match-center/types";

const MOCK_FIXTURES: any[] = [];

type Scope = "match" | "league";

interface PlayerImpactMapSectionProps {
  scope: Scope;
  title?: string;
}

export default function PlayerImpactMapSection({
  scope,
  title = "Player Impact Map",
}: PlayerImpactMapSectionProps) {
  const stubMatch = useMemo(() => {
    const upcoming = MOCK_FIXTURES.filter((m) => m.status === "upcoming");
    return upcoming.length > 0 ? upcoming[0] : MOCK_FIXTURES[0];
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
          {title}
        </h2>
        <p className="text-sm text-white/60">
          League view (match-scoped view returning later)
        </p>
      </div>

      <PlayerImpactScatterPanel
        match={stubMatch as FixtureMatch}
        mode="free"
        initialLens="fantasy"
      />
    </div>
  );
}
