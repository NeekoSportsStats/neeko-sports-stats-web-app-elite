import React from "react";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import type { PremiumMode } from "@/components/afl/ai-insights/data/types";

import PlayerImpactHeroScatterDesktop from "./PlayerImpactHeroScatterDesktop";
import PlayerImpactHeroScatterMobile from "./PlayerImpactHeroScatterMobile";
import type { LensKey } from "./usePlayerScatterData";

export default function PlayerImpactHeroScatter(props: {
  match?: FixtureMatch;
  mode: PremiumMode;
  initialLens?: LensKey;
}) {
  const { match, mode, initialLens } = props;

  return (
    <>
      <div className="hidden md:block">
        <PlayerImpactHeroScatterDesktop
          match={match}
          mode={mode}
          initialLens={initialLens}
        />
      </div>
      <div className="md:hidden">
        <PlayerImpactHeroScatterMobile
          match={match}
          mode={mode}
          initialLens={initialLens}
        />
      </div>
    </>
  );
}
