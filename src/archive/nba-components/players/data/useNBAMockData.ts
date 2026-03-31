import { useMemo } from "react";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";

export type StatKey = typeof NBA_STAT_CONFIG.availableStats[number];

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export interface Player {
  id: number;
  name: string;
  pos: Position;
  team: string;

  fantasy: number[];
  points: number[];
  rebounds: number[];
  assists: number[];
  threes: number[];
}

export const TEAM_OPTIONS = [
  "All",
  "LAL",
  "GSW",
  "BOS",
  "MIA",
  "DEN",
  "PHX",
  "MIL",
  "DAL",
  "NYK",
  "LAC",
];

export const POSITION_OPTIONS = ["All", "PG", "SG", "SF", "PF", "C"];

export const ROUND_OPTIONS = [
  "All",
  ...Array.from({ length: NBA_STAT_CONFIG.sportMeta.totalRounds }, (_, i) => `G${i + 1}`),
];

export const YEARS = ["2025–2026", "2024–2025"];

function generatePlayers(): Player[] {
  const totalRounds = NBA_STAT_CONFIG.sportMeta.totalRounds;

  return Array.from({ length: 100 }).map((_, i) => {
    const pos = ["PG", "SG", "SF", "PF", "C"][i % 5] as Position;
    const team =
      [
        "LAL",
        "GSW",
        "BOS",
        "MIA",
        "DEN",
        "PHX",
        "MIL",
        "DAL",
        "NYK",
        "LAC",
      ][i % 10];

    const fantasy: number[] = [];
    const points: number[] = [];
    const rebounds: number[] = [];
    const assists: number[] = [];
    const threes: number[] = [];

    for (let game = 0; game < totalRounds; game++) {
      const seed = i * 100 + game;

      const ptsBase = pos === "C" ? 15 : pos === "PF" ? 18 : pos === "SF" ? 20 : pos === "SG" ? 22 : 18;
      const ptsVariation = (seed % 15) + ((seed * 7) % 16) - 10;
      const pts = Math.max(8, Math.min(38, ptsBase + ptsVariation));

      const rebBase = pos === "C" ? 12 : pos === "PF" ? 9 : pos === "SF" ? 6 : pos === "SG" ? 4 : 3;
      const rebVariation = (seed % 8) + ((seed * 3) % 9) - 5;
      const reb = Math.max(2, Math.min(18, rebBase + rebVariation));

      const astBase = pos === "PG" ? 8 : pos === "SG" ? 5 : pos === "SF" ? 4 : pos === "PF" ? 3 : 2;
      const astVariation = (seed % 6) + ((seed * 5) % 8) - 4;
      const ast = Math.max(1, Math.min(14, astBase + astVariation));

      const threesBase = pos === "SG" ? 3 : pos === "SF" ? 2 : pos === "PG" ? 2 : pos === "PF" ? 1 : 0;
      const threesVariation = (seed % 4) + ((seed * 11) % 3) - 2;
      const three = Math.max(0, Math.min(6, threesBase + threesVariation));

      const fantasyScore = pts + (reb * 1.2) + (ast * 1.5) + (three * 3);

      fantasy.push(Math.round(fantasyScore));
      points.push(pts);
      rebounds.push(reb);
      assists.push(ast);
      threes.push(three);
    }

    return {
      id: i + 1,
      name: `Player ${i + 1}`,
      pos,
      team,
      fantasy,
      points,
      rebounds,
      assists,
      threes,
    };
  });
}

export const lastN = (s: number[], n: number) => s.slice(-n);

export const average = (s: number[]) =>
  s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;

export function stdDev(values: number[]) {
  if (values.length <= 1) return 0;
  const avg = average(values);
  const variance =
    values.reduce((s, v) => s + (v - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function getSeriesForStat(
  player: Player,
  stat: StatKey
): number[] {
  const series = player[stat];
  if (!Array.isArray(series)) {
    return [];
  }
  return series;
}

export function stabilityMeta(vol: number) {
  if (vol < 3)
    return {
      label: "Rock solid",
      colour: "text-emerald-400",
      reason: "Highly consistent production.",
    };
  if (vol < 6)
    return {
      label: "Steady",
      colour: "text-emerald-300",
      reason: "Low game-to-game variance.",
    };
  if (vol < 10)
    return {
      label: "Streaky",
      colour: "text-amber-300",
      reason: "Matchup dependent swings.",
    };
  return {
    label: "Volatile",
    colour: "text-red-400",
    reason: "High ceiling, high variance.",
  };
}

export function useNBAMockPlayers(): Player[] {
  return useMemo(() => generatePlayers(), []);
}
