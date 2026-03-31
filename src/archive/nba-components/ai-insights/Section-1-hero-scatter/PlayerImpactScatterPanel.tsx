import React from "react";
import type { FixtureMatch } from "@/components/nba/match-center/types";
import type { PremiumMode } from "@/components/nba/ai-insights/data/types";

import PlayerImpactHeroScatter from "./PlayerImpactHeroScatter";
import type { LensKey } from "./usePlayerScatterData";

export default function PlayerImpactScatterPanel(props: {
  match?: FixtureMatch;
  mode: PremiumMode;
  initialLens?: LensKey;
}) {
  const { match, mode, initialLens } = props;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="mb-4 md:mb-5">
        <h2 className="text-lg font-semibold text-white">Player Impact Map</h2>
        <p className="mt-1 text-sm text-white/60">
          Momentum vs ceiling · Click a player to select, click again to open trend/projection
        </p>
      </div>

      <PlayerImpactHeroScatter match={match} mode={mode} initialLens={initialLens} />
    </section>
  );
}
