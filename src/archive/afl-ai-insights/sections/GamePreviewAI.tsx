import React from "react";
import GameFlowMomentumPanel from "@/components/afl/ai-insights/Section-4-game-flow/GameFlowMomentumPanel";
import type { FixtureMatch } from "@/components/afl/match-center/types";

type Props = {
  selectedMatch?: FixtureMatch;
  pastFixtures: FixtureMatch[];
};

export default function GamePreviewAI({ selectedMatch, pastFixtures }: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">Game Preview AI</h2>
        <p className="mt-1 text-sm text-white/60">
          AI-driven game flow and momentum predictions
        </p>
      </div>

      <GameFlowMomentumPanel
        mode="premium"
        match={selectedMatch}
        fixtures={pastFixtures}
        showHeader={false}
      />
    </section>
  );
}
