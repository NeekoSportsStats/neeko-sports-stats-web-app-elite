// src/components/nba/teams/data/mockTeams.tsx
// NBA TEAMS — Full Mock Dataset (30 Teams, 82 Games)

export type NBATeam = {
  id: number;
  name: string;
  code: string;
  conference: "East" | "West";
  colours: {
    primary: string;
    secondary: string;
  };

  // Game-by-game stats (82 games)
  scores: number[];
  margins: number[];

  // NBA stat lenses
  fantasy: number[];     // NBA Fantasy team totals per game
  points: number[];      // team total points per game
  rebounds: number[];    // team total rebounds per game
  assists: number[];     // team total assists per game
  threes: number[];      // team total 3-pointers per game

  // Dashboard metrics
  attackRating: number;
  defenceRating: number;
  paceRating: number[];  // Possessions per game trend
  consistencyIndex: number;

  // Next 3 fixtures difficulty
  fixtureDifficulty: {
    score: number;
    opponents: string[];
  };

  // Trend sparkline data
  attackTrend: number[];
  defenceTrend: number[];
  paceTrend: number[];
};

// Game labels (G1–G82)
export const GAME_LABELS = Array.from({ length: 82 }, (_, i) => `G${i + 1}`);

// Alias for master tables
export type TeamRow = NBATeam;

// 30 NBA Teams
export const TEAM_LIST = [
  "Lakers",
  "Warriors",
  "Celtics",
  "Heat",
  "Nuggets",
  "Suns",
  "Mavericks",
  "Bucks",
  "76ers",
  "Nets",
  "Knicks",
  "Raptors",
  "Bulls",
  "Cavaliers",
  "Pacers",
  "Pistons",
  "Hawks",
  "Hornets",
  "Magic",
  "Wizards",
  "Clippers",
  "Kings",
  "Trail Blazers",
  "Jazz",
  "Timberwolves",
  "Thunder",
  "Pelicans",
  "Spurs",
  "Rockets",
  "Grizzlies",
];

// Team codes
const TEAM_CODES = [
  "LAL", "GSW", "BOS", "MIA", "DEN", "PHX", "DAL", "MIL",
  "PHI", "BKN", "NYK", "TOR", "CHI", "CLE", "IND", "DET",
  "ATL", "CHA", "ORL", "WAS", "LAC", "SAC", "POR", "UTA",
  "MIN", "OKC", "NOP", "SAS", "HOU", "MEM"
];

// Conference assignments (East = 0, West = 1)
const TEAM_CONFERENCES: Array<"East" | "West"> = [
  "West", "West", "East", "East", "West", "West", "West", "East", // LAL, GSW, BOS, MIA, DEN, PHX, DAL, MIL
  "East", "East", "East", "East", "East", "East", "East", "East", // PHI, BKN, NYK, TOR, CHI, CLE, IND, DET
  "East", "East", "East", "East", "West", "West", "West", "West", // ATL, CHA, ORL, WAS, LAC, SAC, POR, UTA
  "West", "West", "West", "West", "West", "West"                   // MIN, OKC, NOP, SAS, HOU, MEM
];

// Team colours
const TEAM_COLOURS = [
  { primary: "#552583", secondary: "#FDB927" }, // Lakers
  { primary: "#1D428A", secondary: "#FFC72C" }, // Warriors
  { primary: "#007A33", secondary: "#BA9653" }, // Celtics
  { primary: "#98002E", secondary: "#F9A01B" }, // Heat
  { primary: "#0E2240", secondary: "#FEC524" }, // Nuggets
  { primary: "#1D1160", secondary: "#E56020" }, // Suns
  { primary: "#00538C", secondary: "#002B5E" }, // Mavericks
  { primary: "#00471B", secondary: "#EEE1C6" }, // Bucks
  { primary: "#006BB6", secondary: "#ED174C" }, // 76ers
  { primary: "#000000", secondary: "#FFFFFF" }, // Nets
  { primary: "#006BB6", secondary: "#F58426" }, // Knicks
  { primary: "#CE1141", secondary: "#000000" }, // Raptors
  { primary: "#CE1141", secondary: "#000000" }, // Bulls
  { primary: "#860038", secondary: "#FDBB30" }, // Cavaliers
  { primary: "#002D62", secondary: "#FDBB30" }, // Pacers
  { primary: "#C8102E", secondary: "#1D42BA" }, // Pistons
  { primary: "#E03A3E", secondary: "#C1D32F" }, // Hawks
  { primary: "#1D1160", secondary: "#00788C" }, // Hornets
  { primary: "#0077C0", secondary: "#C4CED4" }, // Magic
  { primary: "#002B5C", secondary: "#E31837" }, // Wizards
  { primary: "#C8102E", secondary: "#1D428A" }, // Clippers
  { primary: "#5A2D81", secondary: "#63727A" }, // Kings
  { primary: "#E03A3E", secondary: "#000000" }, // Trail Blazers
  { primary: "#002B5C", secondary: "#00471B" }, // Jazz
  { primary: "#0C2340", secondary: "#236192" }, // Timberwolves
  { primary: "#007AC1", secondary: "#EF3B24" }, // Thunder
  { primary: "#0C2340", secondary: "#C8102E" }, // Pelicans
  { primary: "#C4CED4", secondary: "#000000" }, // Spurs
  { primary: "#CE1141", secondary: "#000000" }, // Rockets
  { primary: "#5D76A9", secondary: "#12173F" }, // Grizzlies
];

// Random helpers for NBA realism
const randomScore = () => Math.floor(95 + Math.random() * 30);       // 95–125
const randomMargin = () => Math.floor(-20 + Math.random() * 40);      // -20 to +20
const randomRating = () => Math.floor(40 + Math.random() * 60);       // 40–100
const randomPace = () =>
  Array.from({ length: 82 }, () => Math.floor(95 + Math.random() * 15)); // 95–110 possessions

// NBA stat generators (82 games)
const randomFantasy = () =>
  Array.from({ length: 82 }, () => Math.floor(180 + Math.random() * 70)); // 180–250

const randomPoints = () =>
  Array.from({ length: 82 }, () => Math.floor(95 + Math.random() * 30));  // 95–125

const randomRebounds = () =>
  Array.from({ length: 82 }, () => Math.floor(38 + Math.random() * 15));  // 38–53

const randomAssists = () =>
  Array.from({ length: 82 }, () => Math.floor(18 + Math.random() * 12));  // 18–30

const randomThrees = () =>
  Array.from({ length: 82 }, () => Math.floor(8 + Math.random() * 10));   // 8–18

// Trend sparkline values
const randomTrend = () =>
  Array.from({ length: 12 }, () => Math.floor(40 + Math.random() * 45));

// Generate all 30 NBA teams
export const MOCK_TEAMS: NBATeam[] = TEAM_LIST.map((name, idx) => {
  const scores = Array.from({ length: 82 }, randomScore);
  const margins = Array.from({ length: 82 }, randomMargin);

  return {
    id: idx + 1,
    name,
    code: TEAM_CODES[idx],
    conference: TEAM_CONFERENCES[idx],
    colours: TEAM_COLOURS[idx],

    scores,
    margins,

    fantasy: randomFantasy(),
    points: randomPoints(),
    rebounds: randomRebounds(),
    assists: randomAssists(),
    threes: randomThrees(),

    attackRating: randomRating(),
    defenceRating: randomRating(),
    paceRating: randomPace(),

    consistencyIndex: Math.floor(50 + Math.random() * 40),

    fixtureDifficulty: {
      score: Math.floor(30 + Math.random() * 50),
      opponents: [
        TEAM_CODES[(idx + 1) % 30],
        TEAM_CODES[(idx + 5) % 30],
        TEAM_CODES[(idx + 11) % 30],
      ],
    },

    attackTrend: randomTrend(),
    defenceTrend: randomTrend(),
    paceTrend: randomTrend(),
  };
});
