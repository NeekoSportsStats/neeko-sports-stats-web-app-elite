/**
 * Stat formatting utilities.
 * Always shows ratio as hero stat. Percentage is optional secondary.
 */
import type { AFLPlayerStat } from "../types";

export function formatRatio(met: number, played: number): string {
  if (played === 0) return "—";
  return `${met}/${played}`;
}

export function formatPercent(met: number, played: number): string {
  if (played === 0) return "—";
  return `${Math.round((met / played) * 100)}%`;
}

export function formatL5Avg(avg: number): string {
  return avg.toFixed(1);
}

export function sortPlayersBySampleStrength(players: AFLPlayerStat[]): AFLPlayerStat[] {
  return [...players].sort((a, b) => {
    // 1. More games played first
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    // 2. Higher percent
    if (b.percent !== a.percent) return b.percent - a.percent;
    // 3. Higher L5 avg
    if (b.l5Avg !== a.l5Avg) return b.l5Avg - a.l5Avg;
    // 4. Higher projection
    return (b.projection ?? 0) - (a.projection ?? 0);
  });
}

export function confidenceTierLabel(tier: AFLPlayerStat["confidenceTier"]): string {
  const labels: Record<AFLPlayerStat["confidenceTier"], string> = {
    elite: "Elite sample",
    strong: "Strong sample",
    watch: "Watch",
    thin_sample: "Small sample",
  };
  return labels[tier];
}

export function confidenceTierColor(tier: AFLPlayerStat["confidenceTier"]): string {
  const colors: Record<AFLPlayerStat["confidenceTier"], string> = {
    elite: "text-emerald-400",
    strong: "text-sky-400",
    watch: "text-amber-400",
    thin_sample: "text-zinc-500",
  };
  return colors[tier];
}

export function isThinSample(player: AFLPlayerStat): boolean {
  return player.gamesPlayed <= 4;
}
