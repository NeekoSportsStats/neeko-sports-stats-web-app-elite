import React, { useEffect, useMemo, useState } from "react";
import type { FixtureMatch } from "@/components/epl/match-center/types";
import type { PremiumMode } from "@/components/epl/ai-insights/data/types";

import PlayerImpactHeroScatterDesktop from "./PlayerImpactHeroScatterDesktop";
import PlayerImpactHeroScatterMobile from "./PlayerImpactHeroScatterMobile";
import type { LensKey } from "./usePlayerScatterData";

function useIsMobile(breakpointPx = 860) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

export default function PlayerImpactHeroScatter(props: {
  match?: FixtureMatch;
  mode: PremiumMode;
  initialLens?: LensKey;
  availableLenses?: LensKey[];
  statLabels?: Record<string, string>;
}) {
  const { match, mode, initialLens, availableLenses, statLabels } = props;
  const isMobile = useIsMobile();

  const Component = useMemo(
    () => (isMobile ? PlayerImpactHeroScatterMobile : PlayerImpactHeroScatterDesktop),
    [isMobile]
  );

  return (
    <Component
      match={match}
      mode={mode}
      initialLens={initialLens}
      availableLenses={availableLenses}
      statLabels={statLabels}
    />
  );
}
