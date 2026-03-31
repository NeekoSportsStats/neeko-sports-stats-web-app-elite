// src/components/nba/match-center/mockData.ts
import type {
  FixtureMatch,
  MatchTeamStats,
  TopFantasyTeam,
} from "./types";

/* -------------------------------------------------------------------------- */
/* NBA TEAMS                                                                  */
/* -------------------------------------------------------------------------- */

export const NBA_TEAMS = [
  "Lakers", "Warriors", "Celtics", "Heat", "Nuggets",
  "Suns", "Mavericks", "Bucks", "76ers", "Nets",
  "Knicks", "Raptors", "Bulls", "Cavaliers", "Pacers",
  "Pistons", "Hawks", "Hornets", "Magic", "Wizards",
  "Clippers", "Kings", "Trail Blazers", "Jazz", "Timberwolves",
  "Thunder", "Pelicans", "Spurs", "Rockets", "Grizzlies",
] as const;

const NBA_VENUES: Record<string, string> = {
  Lakers: "Crypto.com Arena",
  Warriors: "Chase Center",
  Celtics: "TD Garden",
  Heat: "FTX Arena",
  Nuggets: "Ball Arena",
  Suns: "Footprint Center",
  Mavericks: "American Airlines Center",
  Bucks: "Fiserv Forum",
  "76ers": "Wells Fargo Center",
  Nets: "Barclays Center",
  Knicks: "Madison Square Garden",
  Raptors: "Scotiabank Arena",
  Bulls: "United Center",
  Cavaliers: "Rocket Mortgage FieldHouse",
  Pacers: "Gainbridge Fieldhouse",
  Pistons: "Little Caesars Arena",
  Hawks: "State Farm Arena",
  Hornets: "Spectrum Center",
  Magic: "Amway Center",
  Wizards: "Capital One Arena",
  Clippers: "Crypto.com Arena",
  Kings: "Golden 1 Center",
  "Trail Blazers": "Moda Center",
  Jazz: "Delta Center",
  Timberwolves: "Target Center",
  Thunder: "Paycom Center",
  Pelicans: "Smoothie King Center",
  Spurs: "Frost Bank Center",
  Rockets: "Toyota Center",
  Grizzlies: "FedExForum",
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildTeamStats(
  homeTeam: string,
  awayTeam: string,
  homePts: number,
  awayPts: number
): MatchTeamStats[] {
  const r = mulberry32(hashStringToSeed(`${homeTeam}-${awayTeam}-${homePts}-${awayPts}`));
  const totalPts = homePts + awayPts;

  const make = (team: string, isHome: boolean) => {
    const pts = isHome ? homePts : awayPts;
    const share = pts / Math.max(1, totalPts);

    const fieldGoals = Math.round(38 + share * 10 + (r() - 0.5) * 4);
    const threePointers = Math.round(10 + share * 8 + (r() - 0.5) * 3);
    const freeThrows = Math.round(15 + share * 5 + (r() - 0.5) * 3);
    const rebounds = Math.round(42 + share * 8 + (r() - 0.5) * 4);
    const assists = Math.round(22 + share * 8 + (r() - 0.5) * 3);
    const turnovers = Math.round(14 - share * 4 + (r() - 0.5) * 2);

    return {
      team,
      stats: [
        { label: "Field Goals", value: fieldGoals, leagueAvg: 43, higherIsBetter: true },
        { label: "3-Pointers", value: threePointers, leagueAvg: 13, higherIsBetter: true },
        { label: "Free Throws", value: freeThrows, leagueAvg: 18, higherIsBetter: true },
        { label: "Rebounds", value: rebounds, leagueAvg: 45, higherIsBetter: true },
        { label: "Assists", value: assists, leagueAvg: 25, higherIsBetter: true },
        { label: "Turnovers", value: turnovers, leagueAvg: 13, higherIsBetter: false },
      ],
    } satisfies MatchTeamStats;
  };

  return [make(homeTeam, true), make(awayTeam, false)];
}

function buildTopFantasy(homeTeam: string, awayTeam: string): TopFantasyTeam[] {
  const rh = mulberry32(hashStringToSeed(`${homeTeam}-fantasy`));
  const ra = mulberry32(hashStringToSeed(`${awayTeam}-fantasy`));

  const pick3 = (team: string, r: () => number) => {
    const out: { name: string; fantasy: number }[] = [];
    const names = ["Player 1", "Player 2", "Player 3"];
    for (let i = 0; i < 3; i++) {
      const fantasy = Math.round(35 + r() * 30);
      out.push({ name: `${team} ${names[i]}`, fantasy });
    }
    out.sort((a, b) => b.fantasy - a.fantasy);
    return out;
  };

  return [
    { team: homeTeam, players: pick3(homeTeam, rh) },
    { team: awayTeam, players: pick3(awayTeam, ra) },
  ];
}

/* -------------------------------------------------------------------------- */
/* MOCK FIXTURES                                                              */
/* -------------------------------------------------------------------------- */

const q = (label: "Q1" | "Q2" | "Q3" | "Q4", home: number, away: number) => ({
  label,
  home,
  away,
});

const FIXTURES_2024_25: FixtureMatch[] = [
  {
    id: "2024-25-g80-lakers-warriors",
    season: "2024-25",
    roundNumber: 80,
    roundLabel: "G80",
    status: "final",
    dateISO: "2025-04-10",
    timeLocal: "19:30",
    venue: NBA_VENUES["Lakers"],
    homeTeam: "Lakers",
    awayTeam: "Warriors",
    quarters: [q("Q1", 28, 24), q("Q2", 26, 30), q("Q3", 25, 22), q("Q4", 29, 26)],
    homeScore: 108,
    awayScore: 102,
    crowd: 18997,
    teamStats: buildTeamStats("Lakers", "Warriors", 108, 102),
    topFantasy: buildTopFantasy("Lakers", "Warriors"),
  },
  {
    id: "2024-25-g81-celtics-heat",
    season: "2024-25",
    roundNumber: 81,
    roundLabel: "G81",
    status: "final",
    dateISO: "2025-04-12",
    timeLocal: "20:00",
    venue: NBA_VENUES["Celtics"],
    homeTeam: "Celtics",
    awayTeam: "Heat",
    quarters: [q("Q1", 30, 22), q("Q2", 28, 26), q("Q3", 24, 28), q("Q4", 27, 25)],
    homeScore: 109,
    awayScore: 101,
    crowd: 19156,
    teamStats: buildTeamStats("Celtics", "Heat", 109, 101),
    topFantasy: buildTopFantasy("Celtics", "Heat"),
  },
  {
    id: "2024-25-g82-nuggets-suns",
    season: "2024-25",
    roundNumber: 82,
    roundLabel: "G82",
    status: "final",
    dateISO: "2025-04-13",
    timeLocal: "21:00",
    venue: NBA_VENUES["Nuggets"],
    homeTeam: "Nuggets",
    awayTeam: "Suns",
    quarters: [q("Q1", 27, 29), q("Q2", 31, 24), q("Q3", 26, 28), q("Q4", 30, 25)],
    homeScore: 114,
    awayScore: 106,
    crowd: 19520,
    teamStats: buildTeamStats("Nuggets", "Suns", 114, 106),
    topFantasy: buildTopFantasy("Nuggets", "Suns"),
  },
];

function generateUpcomingGames(): FixtureMatch[] {
  const fixtures: FixtureMatch[] = [];
  const baseDate = new Date("2025-10-22");

  for (let game = 1; game <= 10; game++) {
    const homeIdx = (game * 3) % NBA_TEAMS.length;
    const awayIdx = (game * 5) % NBA_TEAMS.length;
    if (homeIdx === awayIdx) continue;

    const homeTeam = NBA_TEAMS[homeIdx];
    const awayTeam = NBA_TEAMS[awayIdx];

    const gameDate = new Date(baseDate);
    gameDate.setDate(gameDate.getDate() + Math.floor(game / 3));

    const dateISO = gameDate.toISOString().split('T')[0];
    const times = ["19:00", "19:30", "20:00", "20:30"];
    const timeLocal = times[game % times.length];

    const r = mulberry32(hashStringToSeed(`${homeTeam}-${awayTeam}-${game}`));
    const homeProb = 45 + r() * 20;

    fixtures.push({
      id: `2025-26-g${game}-${homeTeam}-${awayTeam}`,
      season: "2025-26",
      roundNumber: game,
      roundLabel: `G${game}`,
      status: "upcoming",
      dateISO,
      timeLocal,
      venue: NBA_VENUES[homeTeam] || "TBD",
      homeTeam,
      awayTeam,
      preview: {
        homeWinProb: Math.round(homeProb),
        awayWinProb: Math.round(100 - homeProb),
        reasons: [
          `${homeTeam} have home court advantage and recent momentum.`,
          `Expect a competitive matchup with playoff implications.`,
        ],
        ladderPos: { home: homeIdx + 1, away: awayIdx + 1 },
        last5: {
          home: Array(5).fill(0).map(() => r() > 0.5 ? "W" : "L") as ("W" | "L")[],
          away: Array(5).fill(0).map(() => r() > 0.5 ? "W" : "L") as ("W" | "L")[],
        },
      },
      teamLists: {
        announced: false,
        caption: "Rosters not yet announced",
        home: [],
        away: [],
      },
    });
  }

  return fixtures;
}

const FIXTURES_2025_26 = generateUpcomingGames();

/* -------------------------------------------------------------------------- */
/* EXPORTS                                                                    */
/* -------------------------------------------------------------------------- */

export const MOCK_FIXTURES: FixtureMatch[] = [...FIXTURES_2024_25, ...FIXTURES_2025_26];

export const MOCK_LADDER_TOP16 = [
  { rank: 1, team: "Celtics", record: "54-28", conference: "East" },
  { rank: 2, team: "Nuggets", record: "53-29", conference: "West" },
  { rank: 3, team: "Bucks", record: "52-30", conference: "East" },
  { rank: 4, team: "Warriors", record: "51-31", conference: "West" },
  { rank: 5, team: "Heat", record: "50-32", conference: "East" },
  { rank: 6, team: "Lakers", record: "49-33", conference: "West" },
  { rank: 7, team: "76ers", record: "48-34", conference: "East" },
  { rank: 8, team: "Suns", record: "47-35", conference: "West" },
];
