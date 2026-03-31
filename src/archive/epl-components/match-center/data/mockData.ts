import type {
  FixtureMatch,
  MatchTeamStats,
  TeamLists,
  TopFantasyTeam,
  MatchPreview,
} from "./types";
import { EPL_MATCH_STATS, availableTeamStats } from "./statConfig";

const q = (label: "Q1" | "Q2" | "Q3" | "Q4", home: number, away: number) => ({
  label,
  home,
  away,
});

const total = (qs: { home: number; away: number }[]) => ({
  home: qs.reduce((a, b) => a + b.home, 0),
  away: qs.reduce((a, b) => a + b.away, 0),
});

const pad2 = (n: number) => String(n).padStart(2, "0");

function addDays(dateISO: string, days: number) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

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

export const EPL_TEAMS = [
  "Arsenal",
  "Aston Villa",
  "Bournemouth",
  "Brentford",
  "Brighton",
  "Chelsea",
  "Crystal Palace",
  "Everton",
  "Fulham",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Newcastle",
  "Nottingham Forest",
  "Southampton",
  "Tottenham",
  "West Ham",
  "Wolverhampton",
  "Leicester",
  "Leeds",
] as const;

const FIRST = [
  "Jack",
  "Tom",
  "Sam",
  "Josh",
  "Liam",
  "Will",
  "Ben",
  "Noah",
  "Max",
  "Harry",
  "Luke",
  "Connor",
  "Zac",
  "Bailey",
  "Nick",
  "Jordan",
  "Charlie",
  "Isaac",
  "Dylan",
  "Caleb",
];
const LAST = [
  "Smith",
  "Brown",
  "Wilson",
  "Taylor",
  "Anderson",
  "Martin",
  "Thompson",
  "Walker",
  "Roberts",
  "Johnson",
  "Miller",
  "Moore",
  "Thomas",
  "Harris",
  "Young",
  "King",
  "Scott",
  "Adams",
  "Baker",
  "Clark",
];

function buildRoster(team: string, size = 25) {
  const r = mulberry32(hashStringToSeed(team));
  const out: string[] = [];
  const used = new Set<string>();
  while (out.length < size) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${
      LAST[Math.floor(r() * LAST.length)]
    }`;
    if (!used.has(name)) {
      used.add(name);
      out.push(name);
    }
  }
  return out;
}

export const TEAM_ROSTERS: Record<string, string[]> = Object.fromEntries(
  EPL_TEAMS.map((t) => [t, buildRoster(t, 25)])
);

function mockLast5(r: () => number): ("W" | "L")[] {
  const arr: ("W" | "L")[] = [];
  for (let i = 0; i < 5; i++) arr.push(r() > 0.45 ? "W" : "L");
  return arr;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function buildPreview(homeTeam: string, awayTeam: string, roundLabel: string): MatchPreview {
  const r = mulberry32(hashStringToSeed(`${homeTeam}-${awayTeam}-${roundLabel}`));

  const homePos = 1 + Math.floor(mulberry32(hashStringToSeed(homeTeam))() * 20);
  const awayPos = 1 + Math.floor(mulberry32(hashStringToSeed(awayTeam))() * 20);

  const ladderEdge = clamp((awayPos - homePos) * 2.2, -12, 12);

  const noise = (r() - 0.5) * 8;
  const homeProb = clamp(50 + ladderEdge + 2 + noise, 35, 65);
  const awayProb = 100 - homeProb;

  const reasons: [string, string] = [
    `${awayTeam} have the edge on table position and recent form indicators.`,
    `Expect the match to be decided by possession and conversion efficiency.`,
  ];

  return {
    homeWinProb: Math.round(homeProb),
    awayWinProb: Math.round(awayProb),
    reasons,
    ladderPos: { home: homePos, away: awayPos },
    last5: {
      home: mockLast5(mulberry32(hashStringToSeed(`${homeTeam}-L5-${roundLabel}`))),
      away: mockLast5(mulberry32(hashStringToSeed(`${awayTeam}-L5-${roundLabel}`))),
    },
  };
}

function buildTeamLists(home: string, away: string, announced: boolean): TeamLists {
  const homeAll = TEAM_ROSTERS[home] ?? [];
  const awayAll = TEAM_ROSTERS[away] ?? [];

  if (!announced) {
    return {
      announced: false,
      caption: "Not yet announced — projected squad",
      home: homeAll,
      away: awayAll,
    };
  }

  const r = mulberry32(hashStringToSeed(`${home}-${away}-squad`));
  const pick = (arr: string[], n: number) => {
    const copy = arr.slice();
    const out: string[] = [];
    while (out.length < n && copy.length) {
      const idx = Math.floor(r() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  };

  const home18 = pick(homeAll, 18);
  const away18 = pick(awayAll, 18);

  const homeBench = home18.slice(-7);
  const awayBench = away18.slice(-7);

  return {
    announced: true,
    caption: "Confirmed lineup",
    home: home18,
    away: away18,
    homeBench,
    awayBench,
    lateChanges:
      r() > 0.7
        ? [{ team: home, in: homeBench[0], out: home18[0], note: "Late change" }]
        : [],
  };
}

function buildTeamStats(
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,
  awayGoals: number
): MatchTeamStats[] {
  const r = mulberry32(hashStringToSeed(`${homeTeam}-${awayTeam}-${homeGoals}-${awayGoals}`));
  const totalGoals = homeGoals + awayGoals;

  const make = (team: string, isHome: boolean) => {
    const goals = isHome ? homeGoals : awayGoals;
    const share = totalGoals > 0 ? goals / totalGoals : 0.5;

    const stats = availableTeamStats.map((statKey) => {
      const config = EPL_MATCH_STATS[statKey];
      if (!config) {
        return {
          label: statKey,
          value: 0,
          leagueAvg: 0,
          higherIsBetter: true,
        };
      }

      let value: number;

      switch (statKey) {
        case "shots":
          value = Math.round(10 + share * 12 + (r() - 0.5) * 4);
          break;
        case "goals":
          value = goals;
          break;
        case "possession":
          value = Math.round(45 + share * 15 + (r() - 0.5) * 8);
          break;
        case "passes":
          value = Math.round(350 + share * 200 + (r() - 0.5) * 50);
          break;
        case "passAccuracy":
          value = Math.round(78 + share * 8 + (r() - 0.5) * 4);
          break;
        case "tackles":
          value = Math.round(15 + (1 - share) * 10 + (r() - 0.5) * 4);
          break;
        case "fouls":
          value = Math.round(10 + (1 - share) * 6 + (r() - 0.5) * 3);
          break;
        default:
          value = Math.round(config.leagueAvg * (0.8 + r() * 0.4));
      }

      return {
        label: config.label,
        value,
        leagueAvg: config.leagueAvg,
        higherIsBetter: config.higherIsBetter,
      };
    });

    return {
      team,
      stats,
    } satisfies MatchTeamStats;
  };

  return [make(homeTeam, true), make(awayTeam, false)];
}

function buildTopFantasy(homeTeam: string, awayTeam: string): TopFantasyTeam[] {
  const rh = mulberry32(hashStringToSeed(`${homeTeam}-fantasy`));
  const ra = mulberry32(hashStringToSeed(`${awayTeam}-fantasy`));

  const pick3 = (team: string, r: () => number) => {
    const roster = (TEAM_ROSTERS[team] ?? []).slice();
    const out: { name: string; fantasy: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(r() * roster.length);
      const name = roster.splice(idx, 1)[0] ?? `${team} Player ${i + 1}`;
      const fantasy = Math.round(60 + r() * 40);
      out.push({ name, fantasy });
    }
    out.sort((a, b) => b.fantasy - a.fantasy);
    return out;
  };

  return [
    { team: homeTeam, players: pick3(homeTeam, rh) },
    { team: awayTeam, players: pick3(awayTeam, ra) },
  ];
}

const FIXTURES_2025_BASE: FixtureMatch[] = [
  {
    id: "2025-r35-ars-che",
    season: "2024–2025",
    roundNumber: 35,
    roundLabel: "GW35",
    status: "final",
    dateISO: "2025-05-03",
    timeLocal: "15:00",
    venue: "Emirates Stadium",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    quarters: [q("Q1", 1, 0), q("Q2", 1, 1), q("Q3", 0, 0), q("Q4", 0, 1)],
    ...(() => {
      const homeGoals = 2;
      const awayGoals = 2;
      return { homeScore: homeGoals, awayScore: awayGoals, crowd: 60284 };
    })(),
  },
  {
    id: "2025-r36-liv-mci",
    season: "2024–2025",
    roundNumber: 36,
    roundLabel: "GW36",
    status: "final",
    dateISO: "2025-05-10",
    timeLocal: "16:30",
    venue: "Anfield",
    homeTeam: "Liverpool",
    awayTeam: "Manchester City",
    quarters: [q("Q1", 1, 0), q("Q2", 2, 0), q("Q3", 0, 1), q("Q4", 0, 1)],
    ...(() => {
      const homeGoals = 3;
      const awayGoals = 2;
      return { homeScore: homeGoals, awayScore: awayGoals, crowd: 53394 };
    })(),
  },
  {
    id: "2025-r37-tot-mun",
    season: "2024–2025",
    roundNumber: 37,
    roundLabel: "GW37",
    status: "final",
    dateISO: "2025-05-17",
    timeLocal: "14:00",
    venue: "Tottenham Hotspur Stadium",
    homeTeam: "Tottenham",
    awayTeam: "Manchester United",
    quarters: [q("Q1", 0, 1), q("Q2", 1, 1), q("Q3", 1, 0), q("Q4", 1, 0)],
    ...(() => {
      const homeGoals = 3;
      const awayGoals = 2;
      return { homeScore: homeGoals, awayScore: awayGoals, crowd: 61559 };
    })(),
  },
];

const FIXTURES_2025: FixtureMatch[] = FIXTURES_2025_BASE.map((m) => {
  const homeGoals = m.homeScore ?? 0;
  const awayGoals = m.awayScore ?? 0;

  return {
    ...m,
    teamStats: buildTeamStats(m.homeTeam, m.awayTeam, homeGoals, awayGoals),
    topFantasy: buildTopFantasy(m.homeTeam, m.awayTeam),
    teamLists: buildTeamLists(m.homeTeam, m.awayTeam, true),
  };
});

function circlePairings(teams: string[]) {
  const list = teams.slice();
  const fixed = list[0];
  let rot = list.slice(1);

  return (roundIndex: number) => {
    if (roundIndex > 0) {
      rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
    }
    const left = [fixed, ...rot.slice(0, rot.length / 2)];
    const right = rot.slice(rot.length / 2).slice().reverse();

    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < left.length; i++) {
      pairs.push([left[i], right[i]]);
    }
    return pairs;
  };
}

const TIME_SLOTS = [
  { dayOffset: 0, time: "12:30", label: "Saturday" },
  { dayOffset: 0, time: "15:00", label: "Saturday" },
  { dayOffset: 0, time: "17:30", label: "Saturday" },
  { dayOffset: 1, time: "14:00", label: "Sunday" },
  { dayOffset: 1, time: "16:30", label: "Sunday" },
];

const TEAM_VENUE: Record<string, string> = {
  Arsenal: "Emirates Stadium",
  "Aston Villa": "Villa Park",
  Bournemouth: "Vitality Stadium",
  Brentford: "Gtech Community Stadium",
  Brighton: "Amex Stadium",
  Chelsea: "Stamford Bridge",
  "Crystal Palace": "Selhurst Park",
  Everton: "Goodison Park",
  Fulham: "Craven Cottage",
  Liverpool: "Anfield",
  "Manchester City": "Etihad Stadium",
  "Manchester United": "Old Trafford",
  Newcastle: "St James' Park",
  "Nottingham Forest": "City Ground",
  Southampton: "St Mary's Stadium",
  Tottenham: "Tottenham Hotspur Stadium",
  "West Ham": "London Stadium",
  Wolverhampton: "Molineux Stadium",
  Leicester: "King Power Stadium",
  Leeds: "Elland Road",
};

function buildRoundLabel(roundNumber: number) {
  return `GW${roundNumber}`;
}

function build2026(): FixtureMatch[] {
  const out: FixtureMatch[] = [];

  out.push(
    {
      id: "2026-gw1-ars-liv",
      season: "2025–2026",
      roundNumber: 1,
      roundLabel: "GW1",
      status: "upcoming",
      dateISO: "2025-08-15",
      timeLocal: "12:30",
      venue: TEAM_VENUE["Arsenal"] ?? "Emirates Stadium",
      homeTeam: "Arsenal",
      awayTeam: "Liverpool",
    },
    {
      id: "2026-gw1-che-mci",
      season: "2025–2026",
      roundNumber: 1,
      roundLabel: "GW1",
      status: "upcoming",
      dateISO: "2025-08-15",
      timeLocal: "15:00",
      venue: TEAM_VENUE["Chelsea"] ?? "Stamford Bridge",
      homeTeam: "Chelsea",
      awayTeam: "Manchester City",
    }
  );

  const baseGW2 = "2025-08-22";

  const pairsForRound = circlePairings(EPL_TEAMS.slice() as unknown as string[]);
  for (let round = 2; round <= 38; round++) {
    const pairs = pairsForRound(round - 2);

    const roundStart = addDays(baseGW2, (round - 2) * 7);

    pairs.forEach(([home, away], i) => {
      const slot = TIME_SLOTS[i % TIME_SLOTS.length];
      const dateISO = addDays(roundStart, slot.dayOffset);

      const roundLabel = buildRoundLabel(round);

      const match: FixtureMatch = {
        id: `2026-${roundLabel}-${home.slice(0, 3).toLowerCase()}-${away
          .slice(0, 3)
          .toLowerCase()}-${i}`,
        season: "2025–2026",
        roundNumber: round,
        roundLabel,
        status: "upcoming",
        dateISO,
        timeLocal: slot.time,
        venue: TEAM_VENUE[home] ?? "TBC",
        homeTeam: home,
        awayTeam: away,
        preview: buildPreview(home, away, roundLabel),
        teamLists: buildTeamLists(home, away, false),
      };

      out.push(match);
    });
  }

  return out.map((m) => {
    if (m.status === "upcoming") {
      return {
        ...m,
        preview: m.preview ?? buildPreview(m.homeTeam, m.awayTeam, m.roundLabel),
        teamLists: m.teamLists ?? buildTeamLists(m.homeTeam, m.awayTeam, false),
      };
    }
    return m;
  });
}

const FIXTURES_2026 = build2026();

export const MOCK_FIXTURES: FixtureMatch[] = [...FIXTURES_2025, ...FIXTURES_2026];

export const MOCK_LADDER_TOP16 = [
  { rank: 1, team: "Arsenal", record: "26-8-4" },
  { rank: 2, team: "Manchester City", record: "25-7-6" },
  { rank: 3, team: "Liverpool", record: "24-9-5" },
  { rank: 4, team: "Chelsea", record: "21-10-7" },
  { rank: 5, team: "Tottenham", record: "20-8-10" },
  { rank: 6, team: "Newcastle", record: "19-10-9" },
  { rank: 7, team: "Aston Villa", record: "18-11-9" },
  { rank: 8, team: "Brighton", record: "17-12-9" },
];
