import { useMemo } from "react";

/* -------------------------------------------------------
   EXPANDED SUPPORTED STAT KEYS
------------------------------------------------------- */
export type StatKey =
  | "fantasy"
  | "disposals"
  | "kicks"
  | "marks"
  | "tackles"
  | "hitouts"
  | "goals";

export type Position = "MID" | "FWD" | "DEF" | "RUC";

/* -------------------------------------------------------
   PLAYER MODEL NOW SUPPORTS MULTI-STAT ROUND DATA
------------------------------------------------------- */
export interface Player {
  id: number;
  name: string;
  pos: Position;
  team: string;

  // 🔥 expanded mock stats per round:
  fantasy: number[];
  disposals: number[];
  kicks: number[];
  marks: number[];
  tackles: number[];
  hitouts: number[];
  goals: number[];
}

/* -------------------------------------------------------
   FILTER / UI OPTIONS
------------------------------------------------------- */
export const TEAM_OPTIONS = [
  "All",
  "COLL",
  "ESS",
  "SYD",
  "CARL",
  "GEEL",
  "MELB",
  "RICH",
];

export const POSITION_OPTIONS = ["All", "MID", "FWD", "DEF", "RUC"];

export const ROUND_OPTIONS = ["All", "OR", "R1", "R2", "R3", "R4", "R5"];

export const YEARS = [2025, 2024, 2023, 2022];

/* -------------------------------------------------------
   MULTI-STAT PLAYER MOCK GENERATOR
------------------------------------------------------- */
function generatePlayers(): Player[] {
  return Array.from({ length: 120 }).map((_, i) => {
    const pos = ["MID", "FWD", "DEF", "RUC"][i % 4] as Position;
    const team =
      ["COLL", "ESS", "SYD", "CARL", "GEEL", "MELB", "RICH"][i % 7];

    // Base fantasy logic
    const base = 80 + (i % 15);

    // Create variation across rounds
    const fantasy = [
      base - 10 + (i % 5),
      base - 5 + (i % 4),
      base + 3 - (i % 6),
      base + 8 - (i % 7),
      base + 1 + (i % 3),
      base + 4 - (i % 2),
    ];

    // Derived stats using reasonable AFL-style ratios
    const disposals = fantasy.map((f) => Math.round(f / 1.4));
    const kicks = disposals.map((d) => Math.round(d * 0.55));
    const marks = disposals.map((d) => Math.round((d - kicks[0]) * 0.3));
    const tackles = fantasy.map((f) => Math.round((f - 50) / 15));
    const hitouts = pos === "RUC"
      ? fantasy.map((f) => Math.round((f - 40) / 2.5))
      : fantasy.map(() => 0);

    // goals: scaled based on role
    const goals = pos === "FWD"
      ? fantasy.map((f) => Math.max(0, Math.round((f - 60) / 20)))
      : fantasy.map(() => 0);

    return {
      id: i + 1,
      name: `Player ${i + 1}`,
      pos,
      team,

      fantasy,
      disposals,
      kicks,
      marks,
      tackles,
      hitouts,
      goals,
    };
  });
}

/* -------------------------------------------------------
   UTILITY HELPERS
------------------------------------------------------- */
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

/* -------------------------------------------------------
   UNIVERSAL GET-SERIES FUNCTION
------------------------------------------------------- */
export function getSeriesForStat(player: Player, stat: StatKey): number[] {
  return player[stat];
}

/* -------------------------------------------------------
   STABILITY META (unchanged)
------------------------------------------------------- */
export function stabilityMeta(vol: number) {
  if (vol < 4)
    return {
      label: "Rock solid",
      colour: "text-emerald-400",
      reason: "Reliable scoring floor.",
    };
  if (vol < 8)
    return {
      label: "Steady",
      colour: "text-emerald-300",
      reason: "Low movement week to week.",
    };
  if (vol < 12)
    return {
      label: "Swingy",
      colour: "text-amber-300",
      reason: "Matchup dependent swings.",
    };
  return {
    label: "Rollercoaster",
    colour: "text-red-400",
    reason: "High upside, high risk.",
  };
}

/* -------------------------------------------------------
   MAIN HOOK
------------------------------------------------------- */
export function useAFLMockPlayers(): Player[] {
  return useMemo(() => generatePlayers(), []);
}
