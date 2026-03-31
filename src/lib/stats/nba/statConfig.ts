import type { StatConfig, NBAStatKey } from "@/lib/stats/types";

export const NBA_STAT_CONFIG: StatConfig<NBAStatKey> = {
  league: "NBA",

  seasons: {
    past: "2024–2025",
    current: "2025–2026",
  },

  availableStats: ["fantasy", "points", "rebounds", "assists", "threes"],

  defaultStat: "fantasy",

  labels: {
    fantasy: "Fantasy",
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    threes: "3-Pointers",
  },

  units: {
    fantasy: "pts",
    points: "pts",
    rebounds: "reb",
    assists: "ast",
    threes: "3PM",
  },

  descriptions: {
    fantasy:
      "Fantasy scoring combining points, rebounds, assists, and other statistical categories into a composite score.",
    points:
      "Scoring output per game showing offensive volume and efficiency across all shot types.",
    rebounds:
      "Rebounding production indicating board control and positioning on both ends of the floor.",
    assists:
      "Playmaking and ball movement reflected in assist totals and offensive flow creation.",
    threes:
      "Three-point shooting volume and efficiency, showcasing range and spacing impact.",
  },

  sportMeta: {
    totalRounds: 82,
    currentRound: 1,
    roundLabels: [
      "G1","G2","G3","G4","G5","G6","G7","G8","G9","G10",
      "G11","G12","G13","G14","G15","G16","G17","G18","G19","G20",
      "G21","G22","G23","G24","G25","G26","G27","G28","G29","G30",
      "G31","G32","G33","G34","G35","G36","G37","G38","G39","G40",
      "G41","G42","G43","G44","G45","G46","G47","G48","G49","G50",
      "G51","G52","G53","G54","G55","G56","G57","G58","G59","G60",
      "G61","G62","G63","G64","G65","G66","G67","G68","G69","G70",
      "G71","G72","G73","G74","G75","G76","G77","G78","G79","G80",
      "G81","G82",
    ],
    periods: ["Q1", "Q2", "Q3", "Q4"],
    scoringRules: "2 points inside arc, 3 points beyond arc, 1 point per free throw",
  },

  playerThresholds: {
    fantasy: [25, 35, 45, 55, 65],
    points: [15, 20, 25, 30, 35],
    rebounds: [5, 8, 10, 12],
    assists: [3, 5, 7, 10],
    threes: [1, 2, 3, 4],
  },

  teamThresholds: {
    fantasy: [200, 225, 250, 275],
    points: [100, 110, 120, 130],
    rebounds: [40, 45, 50, 55],
    assists: [20, 25, 30, 35],
    threes: [8, 12, 15, 18],
  },

  positions: ["PG", "SG", "SF", "PF", "C"],

  momentum: {
    description: "Recent scoring trend over last games",
    window: 5,
  },

  ceiling: {
    description: "Upper scoring potential",
    method: "max",
  },

  volatility: {
    description: "Game-to-game variance",
    method: "stdev",
  },

  prediction: {
    enabled: true,
    horizon: 1,
  },
};
