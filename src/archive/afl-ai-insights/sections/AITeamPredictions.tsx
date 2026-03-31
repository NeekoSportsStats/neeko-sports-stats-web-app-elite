import React from "react";
import TeamPredictabilityPanel from "@/components/afl/ai-insights/Section-3-team-prediction/TeamPredictabilityPanel";
import type { FixtureMatch } from "@/components/afl/match-center/types";

type Props = {
  selectedMatch?: FixtureMatch;
  pastFixtures: FixtureMatch[];
};

export default function AITeamPredictions({ selectedMatch, pastFixtures }: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Team Predictions</h2>
        <p className="mt-1 text-sm text-white/60">
          Team scoring patterns and predictability analysis
        </p>
      </div>

      <TeamPredictabilityPanel
        mode="premium"
        match={selectedMatch}
        fixtures={pastFixtures}
        showHeader={false}
      />
    </section>
  );
}
