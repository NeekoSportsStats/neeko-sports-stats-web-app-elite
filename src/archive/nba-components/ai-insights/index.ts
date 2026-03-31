// src/components/afl/ai-insights/index.ts

export * from "./shared/ControlsBar";
export * from "./shared/MetricPills";
export * from "./shared/SectionShell";

export * from "./data/types";
export * from "./data/utils";
export * from "./data/engine";

// ✅ Default export only — no props type
export { default as PlayerImpactScatterPanel } from "./Section-1-hero-scatter/PlayerImpactScatterPanel";

export * from "./Section-2-player-predictability/PredictabilityTable";
export * from "./Section-3-team-prediction/TeamPredictabilityPanel";
export * from "./Section-4-game-flow/GameFlowMomentumPanel";
