import { useMemo } from "react";
import type { EPLStatKey } from "@/lib/stats/types";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";

export type StatKey = EPLStatKey;

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: number;
  name: string;
  pos: Position;
  team: string;

  fantasy: number[];
  goals: number[];
  assists: number[];
  shots: number[];
  shotsOnTarget: number[];
  xg: number[];
}

export const TEAM_OPTIONS = [
  "All",
  "ARS",
  "MCI",
  "LIV",
  "CHE",
  "TOT",
  "MUN",
  "NEW",
  "AVL",
  "BHA",
  "WHU",
];

export const POSITION_OPTIONS = ["All", "GK", "DEF", "MID", "FWD"];

export const ROUND_OPTIONS = [
  "All",
  ...EPL_STAT_CONFIG.sportMeta.roundLabels!,
];

export const YEARS = [
  EPL_STAT_CONFIG.seasons.current,
  EPL_STAT_CONFIG.seasons.past,
];

function generatePlayers(): Player[] {
  const totalRounds = EPL_STAT_CONFIG.sportMeta.totalRounds!;

  return Array.from({ length: 100 }).map((_, i) => {
    const pos = ["GK", "DEF", "MID", "FWD"][i % 4] as Position;
    const team = [
      "ARS",
      "MCI",
      "LIV",
      "CHE",
      "TOT",
      "MUN",
      "NEW",
      "AVL",
      "BHA",
      "WHU",
    ][i % 10];

    const fantasy: number[] = [];
    const goals: number[] = [];
    const assists: number[] = [];
    const shots: number[] = [];
    const shotsOnTarget: number[] = [];
    const xg: number[] = [];

    for (let gw = 0; gw < totalRounds; gw++) {
      const seed = i * totalRounds + gw;

      let g = 0;
      if (pos === "FWD") {
        g = seed % 3 === 0 ? (seed % 7 < 2 ? 2 : 1) : 0;
      } else if (pos === "MID") {
        g = seed % 5 === 0 ? 1 : 0;
      } else if (pos === "DEF") {
        g = seed % 30 === 0 ? 1 : 0;
      }

      let a = 0;
      if (pos !== "GK") {
        if (pos === "MID") {
          a = seed % 4 === 0 ? 1 : 0;
        } else if (pos === "FWD") {
          a = seed % 5 === 0 ? 1 : 0;
        } else if (pos === "DEF") {
          a = seed % 15 === 0 ? 1 : 0;
        }
      }

      let s = 0;
      if (pos === "FWD") {
        s = 1 + (seed % 5);
      } else if (pos === "MID") {
        s = 1 + (seed % 4);
      } else if (pos === "DEF") {
        s = seed % 3 < 2 ? 1 : 2;
      }

      const sot = s > 0 ? Math.min(3, Math.floor(s / 2) + (seed % 2)) : 0;

      let expectedGoals = 0.0;
      if (s > 0) {
        const base = s * 0.2;
        const variance = (seed % 10) * 0.05;
        expectedGoals = Math.min(1.2, Math.max(0.0, base + variance));
        expectedGoals = Math.round(expectedGoals * 100) / 100;
      }

      const fantasyScore = Math.round(
        g * 8 +
        a * 5 +
        s * 1 +
        sot * 2 +
        expectedGoals * 6
      );

      fantasy.push(fantasyScore);
      goals.push(g);
      assists.push(a);
      shots.push(s);
      shotsOnTarget.push(sot);
      xg.push(expectedGoals);
    }

    return {
      id: i + 1,
      name: `Player ${i + 1}`,
      pos,
      team,
      fantasy,
      goals,
      assists,
      shots,
      shotsOnTarget,
      xg,
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
    values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function getSeriesForStat(player: Player, stat: StatKey): number[] {
  return player[stat];
}

export function stabilityMeta(vol: number) {
  if (vol < 0.4)
    return {
      label: "Rock solid",
      colour: "text-emerald-400",
      reason: "Highly consistent output.",
    };
  if (vol < 0.8)
    return {
      label: "Steady",
      colour: "text-emerald-300",
      reason: "Low week-to-week variance.",
    };
  if (vol < 1.3)
    return {
      label: "Swingy",
      colour: "text-amber-300",
      reason: "Matchup influenced output.",
    };
  return {
    label: "Volatile",
    colour: "text-red-400",
    reason: "High upside, high risk.",
  };
}

export function useEPLMockPlayers(): Player[] {
  return useMemo(() => generatePlayers(), []);
}
