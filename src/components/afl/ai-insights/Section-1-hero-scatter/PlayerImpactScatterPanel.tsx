import React from "react";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import type { PremiumMode } from "@/components/afl/ai-insights/data/types";

import PlayerImpactHeroScatter from "./PlayerImpactHeroScatter";
import type { LensKey } from "./usePlayerScatterData";

export default function PlayerImpactScatterPanel(props: {
  match?: FixtureMatch;
  mode: PremiumMode;
  initialLens?: LensKey;
}) {
  const { match, mode, initialLens } = props;

  return (
    <PlayerImpactHeroScatter
      match={match}
      mode={mode}
      initialLens={initialLens}
    />
  );
}
