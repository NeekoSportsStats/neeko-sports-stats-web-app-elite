import type { PlayerRow, StatLens } from "../Section-1-master-table/MasterTable";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";

export function getRoundsForLens(player: PlayerRow, lens: StatLens): number[] {
  return player.stats[lens] ?? [];
}

export function computeSummary(player: PlayerRow, lens: StatLens) {
  const rounds = getRoundsForLens(player, lens);

  if (rounds.length === 0) {
    return { min: 0, max: 0, total: 0, avg: 0, games: 0, windowMin: 0, windowMax: 0, volatilityRange: 0 };
  }

  const min = Math.min(...rounds);
  const max = Math.max(...rounds);
  const total = rounds.reduce((a, b) => a + b, 0);
  const avg = +(total / rounds.length).toFixed(1);
  const games = rounds.length;

  const lastWindow = rounds.slice(-10);
  const windowMin = lastWindow.length > 0 ? Math.min(...lastWindow) : 0;
  const windowMax = lastWindow.length > 0 ? Math.max(...lastWindow) : 0;
  const volatilityRange = windowMax - windowMin;

  return { min, max, total, avg, games, windowMin, windowMax, volatilityRange };
}

export function computeHitRates(player: PlayerRow, lens: StatLens): number[] {
  const rounds = getRoundsForLens(player, lens);
  const thresholds = NBA_STAT_CONFIG.playerThresholds[lens] ?? [];

  if (rounds.length === 0) {
    return thresholds.map(() => 0);
  }

  return thresholds.map((t) =>
    Math.round((rounds.filter((v) => v >= t).length / rounds.length) * 100)
  );
}
