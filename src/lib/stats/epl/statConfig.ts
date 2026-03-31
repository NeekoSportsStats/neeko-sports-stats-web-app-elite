import type { StatConfig, EPLStatKey } from "@/lib/stats/types";

export const EPL_STAT_CONFIG: StatConfig<EPLStatKey> = {
  league: "EPL",

  seasons: {
    past: "2024–2025",
    current: "2025–2026",
  },

  availableStats: ["fantasy", "goals", "assists", "shots", "shotsOnTarget", "xg"],

  defaultStat: "fantasy",

  labels: {
    fantasy: "Fantasy",
    goals: "Goals",
    assists: "Assists",
    shots: "Shots",
    shotsOnTarget: "Shots on Target",
    xg: "Expected Goals",
  },

  units: {
    fantasy: "pts",
    goals: "g",
    assists: "a",
    shots: "sh",
    shotsOnTarget: "sot",
    xg: "xG",
  },

  descriptions: {
    fantasy:
      "Fantasy scoring based on goals, assists, shots, xG and involvement.",
    goals:
      "Forward efficiency spiked with multiple players scoring and capitalising on high xG chances.",
    assists:
      "Creative midfielders dominated assists, with key playmakers posting multiple goal contributions.",
    shots:
      "Teams pushed volume with aggressive shooting, lifting shot counts in attacking thirds.",
    shotsOnTarget:
      "Clinical finishing surged, with top forwards converting shots on target at elite rates.",
    xg:
      "Expected goals reflected chance quality, highlighting forwards and attacking mids in prime positions.",
  },

  sportMeta: {
    totalRounds: 38,
    currentRound: 1,
    roundLabels: [
      "GW1", "GW2", "GW3", "GW4", "GW5", "GW6", "GW7", "GW8", "GW9", "GW10",
      "GW11", "GW12", "GW13", "GW14", "GW15", "GW16", "GW17", "GW18", "GW19", "GW20",
      "GW21", "GW22", "GW23", "GW24", "GW25", "GW26", "GW27", "GW28", "GW29", "GW30",
      "GW31", "GW32", "GW33", "GW34", "GW35", "GW36", "GW37", "GW38",
    ],
    periods: ["H1", "H2"],
    scoringRules: "1 point per goal, assists credited to final pass before goal",
  },

  playerThresholds: {
    fantasy: [30, 40, 50, 60],
    goals: [1, 2, 3, 4],
    assists: [1, 2, 3],
    shots: [2, 4, 6, 8],
    shotsOnTarget: [1, 2, 3, 4],
    xg: [0.3, 0.6, 1.0, 1.5],
  },

  teamThresholds: {
    fantasy: [1300, 1400, 1500, 1600],
    goals: [1, 2, 3, 4],
    assists: [1, 2, 3, 4],
    shots: [8, 12, 16, 20],
    shotsOnTarget: [4, 6, 8, 10],
    xg: [1.0, 1.8, 2.5, 3.0],
  },

  positions: ["GK", "DEF", "MID", "FWD"],

  momentum: {
    description: "Recent scoring trend over last matchweeks",
    window: 3,
  },

  ceiling: {
    description: "Upper scoring potential",
    method: "max",
  },

  volatility: {
    description: "Matchweek-to-matchweek variance",
    method: "stdev",
  },

  prediction: {
    enabled: true,
    horizon: 1,
  },
};
