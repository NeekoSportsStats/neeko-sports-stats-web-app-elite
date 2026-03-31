import type { EPLStatKey } from "@/lib/stats/types";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";

export type EPLTeam = {
  id: number;
  name: string;
  code: string;
  colours: {
    primary: string;
    secondary: string;
  };

  scores: number[];
  margins: number[];

  fantasy: number[];
  goals: number[];
  assists: number[];
  shots: number[];
  shotsOnTarget: number[];
  xg: number[];

  attackRating: number;
  defenceRating: number;
  possessionDom: number[];
  consistencyIndex: number;

  fixtureDifficulty: {
    score: number;
    opponents: string[];
  };

  attackTrend: number[];
  defenceTrend: number[];
  midfieldTrend: number[];
};

export const ROUND_LABELS = EPL_STAT_CONFIG.sportMeta.roundLabels!;

export type TeamRow = EPLTeam;

export const TEAM_LIST = [
  "Arsenal",
  "Manchester City",
  "Liverpool",
  "Chelsea",
  "Tottenham",
  "Manchester United",
  "Newcastle",
  "Aston Villa",
  "Brighton",
  "West Ham",
  "Fulham",
  "Brentford",
  "Crystal Palace",
  "Everton",
  "Wolves",
  "Leicester",
  "Southampton",
  "Bournemouth",
  "Nottingham Forest",
  "Leeds United",
];

const TEAM_CODES = [
  "ARS", "MCI", "LIV", "CHE", "TOT", "MUN", "NEW", "AVL", "BHA", "WHU",
  "FUL", "BRE", "CRY", "EVE", "WOL", "LEI", "SOU", "BOU", "NFO", "LEE"
];

const TEAM_COLOURS = [
  { primary: "#EF0107", secondary: "#FFFFFF" },
  { primary: "#6CABDD", secondary: "#1C2C5B" },
  { primary: "#C8102E", secondary: "#00B2A9" },
  { primary: "#034694", secondary: "#FFFFFF" },
  { primary: "#132257", secondary: "#FFFFFF" },
  { primary: "#DA291C", secondary: "#FBE122" },
  { primary: "#241F20", secondary: "#FFFFFF" },
  { primary: "#95BFE5", secondary: "#670E36" },
  { primary: "#0057B8", secondary: "#FFCD00" },
  { primary: "#7A263A", secondary: "#1BB1E7" },
  { primary: "#000000", secondary: "#FFFFFF" },
  { primary: "#E30613", secondary: "#FBB800" },
  { primary: "#1B458F", secondary: "#C4122E" },
  { primary: "#003399", secondary: "#FFFFFF" },
  { primary: "#FDB913", secondary: "#231F20" },
  { primary: "#003090", secondary: "#FDBE11" },
  { primary: "#D71920", secondary: "#130C0E" },
  { primary: "#DA291C", secondary: "#000000" },
  { primary: "#DD0000", secondary: "#FFFFFF" },
  { primary: "#FFCD00", secondary: "#1D428A" },
];

const TOTAL_ROUNDS = EPL_STAT_CONFIG.sportMeta.totalRounds!;

function deterministicRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateFantasy(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r;
    const base = 1200 + teamIdx * 20;
    const variance = deterministicRandom(seed) * 400;
    return Math.round(base + variance);
  });
}

function generateGoals(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 100;
    const isTopTeam = teamIdx < 6;
    const base = isTopTeam ? 1.8 : 1.2;
    const variance = deterministicRandom(seed) * 2;
    return Math.round(Math.max(0, base + variance));
  });
}

function generateAssists(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 200;
    const isTopTeam = teamIdx < 6;
    const base = isTopTeam ? 1.5 : 1;
    const variance = deterministicRandom(seed) * 1.5;
    return Math.round(Math.max(0, base + variance));
  });
}

function generateShots(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 300;
    const base = 12 + teamIdx * 0.3;
    const variance = deterministicRandom(seed) * 8;
    return Math.round(base + variance);
  });
}

function generateShotsOnTarget(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 400;
    const base = 4 + teamIdx * 0.2;
    const variance = deterministicRandom(seed) * 4;
    return Math.round(base + variance);
  });
}

function generateXG(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 500;
    const isTopTeam = teamIdx < 6;
    const base = isTopTeam ? 1.8 : 1.2;
    const variance = deterministicRandom(seed) * 1.2;
    return Math.round((base + variance) * 100) / 100;
  });
}

function generateScore(teamIdx: number): number[] {
  return generateGoals(teamIdx).map(g => g + Math.floor(deterministicRandom(teamIdx + g) * 2));
}

function generateMargin(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 600;
    const variance = deterministicRandom(seed) * 6 - 3;
    return Math.round(variance);
  });
}

function generatePossession(teamIdx: number): number[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, r) => {
    const seed = teamIdx * 1000 + r + 700;
    const base = 45 + teamIdx * 0.5;
    const variance = deterministicRandom(seed) * 20;
    return Math.round(base + variance);
  });
}

function generateTrend(teamIdx: number, offset: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const seed = teamIdx * 100 + i + offset;
    return Math.round(40 + deterministicRandom(seed) * 45);
  });
}

export const MOCK_TEAMS: EPLTeam[] = TEAM_LIST.map((name, idx) => ({
  id: idx + 1,
  name,
  code: TEAM_CODES[idx],
  colours: TEAM_COLOURS[idx],

  scores: generateScore(idx),
  margins: generateMargin(idx),

  fantasy: generateFantasy(idx),
  goals: generateGoals(idx),
  assists: generateAssists(idx),
  shots: generateShots(idx),
  shotsOnTarget: generateShotsOnTarget(idx),
  xg: generateXG(idx),

  attackRating: Math.round(40 + deterministicRandom(idx) * 60),
  defenceRating: Math.round(40 + deterministicRandom(idx + 1000) * 60),
  possessionDom: generatePossession(idx),

  consistencyIndex: Math.round(50 + deterministicRandom(idx + 2000) * 40),

  fixtureDifficulty: {
    score: Math.round(30 + deterministicRandom(idx + 3000) * 50),
    opponents: [
      TEAM_CODES[(idx + 1) % 20],
      TEAM_CODES[(idx + 4) % 20],
      TEAM_CODES[(idx + 7) % 20],
    ],
  },

  attackTrend: generateTrend(idx, 100),
  defenceTrend: generateTrend(idx, 200),
  midfieldTrend: generateTrend(idx, 300),
}));
