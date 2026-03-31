import type { PlayerRow, StatLens } from "../Section-1-master-table/MasterTable";

export function getRoundsForLens(player: PlayerRow, lens: StatLens) {
  if (lens === "fantasy") return player.roundsFantasy;
  if (lens === "disposals") return player.roundsDisposals;
  return player.roundsGoals;
}

export function computeSummary(player: PlayerRow, lens: StatLens) {
  const rounds = getRoundsForLens(player, lens);
  const min = Math.min(...rounds);
  const max = Math.max(...rounds);
  const total = rounds.reduce((a, b) => a + b, 0);
  const avg = +(total / rounds.length).toFixed(1);

  const lastWindow = rounds.slice(-8);
  const windowMin = Math.min(...lastWindow);
  const windowMax = Math.max(...lastWindow);
  const volatilityRange = windowMax - windowMin;

  return { min, max, total, avg, windowMin, windowMax, volatilityRange, games: rounds.length };
}

export function computeHitRates(player: PlayerRow, lens: StatLens, thresholds: readonly number[]) {
  const rounds = getRoundsForLens(player, lens);
  return thresholds.map((t) =>
    Math.round((rounds.filter((v) => v >= t).length / rounds.length) * 100)
  );
}