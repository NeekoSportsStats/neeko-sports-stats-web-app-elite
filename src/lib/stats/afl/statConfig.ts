// src/lib/stats/afl/statConfig.ts
import { StatConfig } from "../types";

export const AFL_STAT_CONFIG = {
  sport: "afl",

  defaultStat: "fantasy",

  availableStats: ["fantasy", "disposals", "goals"],

  labels: {
    fantasy: "Fantasy",
    disposals: "Disposals",
    goals: "Goals",
    xg: "",
    shots: "",
    points: "",
    rebounds: "",
    assists: "",
  },

  units: {
    fantasy: "pts",
    disposals: "disp",
    goals: "g",
    kicks: "kicks",
    marks: "marks",
    tackles: "tackles",
    hitouts: "hitouts",
  },

  descriptions: {
    fantasy:
      "League-wide Fantasy trends reflect shifts driven by usage rates, matchup edges and evolving roles.",
    disposals:
      "High-volume ball winners dominated disposals, with multiple midfielders posting 30+ touches.",
    kicks:
      "Teams pushed territory with more aggressive kicking, lifting inside-50 and switch-kick volume.",
    marks:
      "Intercept and link-up marks surged, highlighting defenders and wings controlling transition chains.",
    tackles:
      "Pressure acts ramped up, with key midfielders and small forwards driving tackle counts.",
    hitouts:
      "Ruck contests shaped territory as top rucks separated in hitouts to advantage.",
    goals:
      "Forward efficiency spiked with multiple players kicking bags and capitalising on inside-50 dominance.",
  },

  sportMeta: {
    totalRounds: 23,
    currentRound: 6,
    roundLabels: [
      "OR","R1","R2","R3","R4","R5","R6","R7","R8","R9",
      "R10","R11","R12","R13","R14","R15","R16","R17","R18","R19",
      "R20","R21","R22","R23",
    ],
    periods: ["Q1", "Q2", "Q3", "Q4"],
    scoringRules: "6 points per goal, 1 point per behind",
  },

  playerInsightThresholds: {
    fantasy: [60, 70, 80, 90, 100],
    disposals: [15, 20, 25, 30],
    goals: [1, 2, 3, 4],
  },

  playerTableThresholds: {
    fantasy: [80, 90, 100, 110],
    disposals: [15, 20, 25, 30],
    goals: [1, 2, 3, 4],
  },

  teamThresholds: {
    fantasy: [1800, 1900, 2000, 2100],
    disposals: [320, 350, 380, 400],
    goals: [8, 10, 12, 14],
  },

  momentum: {
    description: "Recent scoring trend over last rounds",
    window: 3,
  },

  ceiling: {
    description: "Upper scoring potential",
    method: "max",
  },

  volatility: {
    description: "Round-to-round variance",
    method: "stdev",
  },

  prediction: {
    enabled: true,
    horizon: 1,
  },
} as unknown as StatConfig;
