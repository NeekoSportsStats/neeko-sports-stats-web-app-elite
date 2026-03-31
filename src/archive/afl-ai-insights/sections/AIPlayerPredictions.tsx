import React from "react";
import PredictabilityTable from "@/components/afl/ai-insights/Section-2-player-predictability/PredictabilityTable";
import type { FixtureMatch } from "@/components/afl/match-center/types";

type Props = {
  selectedMatch?: FixtureMatch;
  pastFixtures: FixtureMatch[];
};

export default function AIPlayerPredictions({ selectedMatch, pastFixtures }: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Player Predictions</h2>
        <p className="mt-1 text-sm text-white/60">
          Player scoring predictability and confidence intervals
        </p>
      </div>

      <PredictabilityTable
        mode="premium"
        match={selectedMatch}
        fixtures={pastFixtures}
        showHeader={false}
      />
    </section>
  );
}
