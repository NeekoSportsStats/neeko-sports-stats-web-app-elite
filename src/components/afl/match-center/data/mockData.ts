// src/components/afl/match-center/mockData.ts
import type {
  FixtureMatch,
  MatchTeamStats,
  TeamLists,
  TopFantasyTeam,
  MatchPreview,
} from "./types";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

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

// deterministic RNG (mulberry32)
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

/* -------------------------------------------------------------------------- */
/* TEAMS + ROSTERS                                                             */
/* -------------------------------------------------------------------------- */

export const AFL_TEAMS = [
  "Adelaide",
  "Brisbane",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong",
  "Gold Coast",
  "GWS",
  "Hawthorn",
  "Melbourne",
  "North Melbourne",
  "Port Adelaide",
  "Richmond",
  "St Kilda",
  "Sydney",
  "West Coast",
  "Western Bulldogs",
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

function buildRoster(team: string, size = 30) {
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
  AFL_TEAMS.map((t) => [t, buildRoster(t, 30)])
);

/* -------------------------------------------------------------------------- */
/* MOCK PREVIEW + LISTS                                                        */
/* -------------------------------------------------------------------------- */

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

  // mock ladder pos: stable-ish per team
  const homePos = 1 + Math.floor(mulberry32(hashStringToSeed(homeTeam))() * 18);
  const awayPos = 1 + Math.floor(mulberry32(hashStringToSeed(awayTeam))() * 18);

  // ladder edge → probability
  const ladderEdge = clamp((awayPos - homePos) * 2.2, -12, 12); // + favors home

  // small home advantage + noise
  const noise = (r() - 0.5) * 8;
  const homeProb = clamp(50 + ladderEdge + 2 + noise, 35, 65);
  const awayProb = 100 - homeProb;

  const reasons: [string, string] = [
    `${awayTeam} have the edge on ladder position and recent efficiency indicators.`,
    `Expect the contest to be decided by clearance/inside-50 conversion rather than a blowout.`,
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
      caption: "Not yet announced — projected club list",
      home: homeAll,
      away: awayAll,
    };
  }

  // announced: pick 22 + bench subset
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

  const home22 = pick(homeAll, 22);
  const away22 = pick(awayAll, 22);

  const homeBench = home22.slice(-4);
  const awayBench = away22.slice(-4);

  return {
    announced: true,
    caption: "Final teams",
    home: home22,
    away: away22,
    homeBench,
    awayBench,
    lateChanges:
      r() > 0.7
        ? [{ team: home, in: homeBench[0], out: home22[0], note: "Late change" }]
        : [],
  };
}

/* -------------------------------------------------------------------------- */
/* MOCK TEAM STATS + TOP FANTASY                                                */
/* -------------------------------------------------------------------------- */

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

    // realistic-ish ranges
    const disposals = Math.round(340 + share * 90 + (r() - 0.5) * 18);
    const inside50 = Math.round(42 + share * 28 + (r() - 0.5) * 6);
    const clearances = Math.round(32 + share * 18 + (r() - 0.5) * 4);
    const contested = Math.round(120 + share * 55 + (r() - 0.5) * 10);
    const turnovers = Math.round(58 + (1 - share) * 16 + (r() - 0.5) * 8); // lower better
    const tackles = Math.round(52 + (1 - share) * 18 + (r() - 0.5) * 6);

    return {
      team,
      stats: [
        { label: "Disposals", value: disposals, leagueAvg: 380, higherIsBetter: true },
        { label: "Inside 50s", value: inside50, leagueAvg: 52, higherIsBetter: true },
        { label: "Clearances", value: clearances, leagueAvg: 38, higherIsBetter: true },
        { label: "Contested Possessions", value: contested, leagueAvg: 145, higherIsBetter: true },
        { label: "Turnovers", value: turnovers, leagueAvg: 63, higherIsBetter: false },
        { label: "Tackles", value: tackles, leagueAvg: 60, higherIsBetter: true },
      ],
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
      const fantasy = Math.round(78 + r() * 42); // 78–120
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

/* -------------------------------------------------------------------------- */
/* 2025 FINALS (EXISTING)                                                       */
/* -------------------------------------------------------------------------- */

const FIXTURES_2025_BASE: FixtureMatch[] = [
  {
    id: "2025-r21-rich-carl",
    season: 2025,
    roundNumber: 21,
    roundLabel: "R21",
    status: "final",
    dateISO: "2025-08-08",
    timeLocal: "19:40",
    venue: "MCG",
    homeTeam: "Richmond",
    awayTeam: "Carlton",
    quarters: [q("Q1", 24, 18), q("Q2", 22, 25), q("Q3", 19, 21), q("Q4", 26, 20)],
    ...(() => {
      const qs = [
        { home: 24, away: 18 },
        { home: 22, away: 25 },
        { home: 19, away: 21 },
        { home: 26, away: 20 },
      ];
      const t = total(qs);
      return { homeScore: t.home, awayScore: t.away, crowd: 78124 };
    })(),
  },
  {
    id: "2025-r22-coll-bris",
    season: 2025,
    roundNumber: 22,
    roundLabel: "R22",
    status: "final",
    dateISO: "2025-08-16",
    timeLocal: "15:20",
    venue: "MCG",
    homeTeam: "Collingwood",
    awayTeam: "Brisbane",
    quarters: [q("Q1", 20, 14), q("Q2", 27, 19), q("Q3", 21, 28), q("Q4", 25, 22)],
    ...(() => {
      const qs = [
        { home: 20, away: 14 },
        { home: 27, away: 19 },
        { home: 21, away: 28 },
        { home: 25, away: 22 },
      ];
      const t = total(qs);
      return { homeScore: t.home, awayScore: t.away, crowd: 86402 };
    })(),
  },
  {
    id: "2025-r23-port-adel",
    season: 2025,
    roundNumber: 23,
    roundLabel: "R23",
    status: "final",
    dateISO: "2025-08-24",
    timeLocal: "16:10",
    venue: "Adelaide Oval",
    homeTeam: "Port Adelaide",
    awayTeam: "Adelaide",
    quarters: [q("Q1", 26, 20), q("Q2", 24, 17), q("Q3", 18, 22), q("Q4", 29, 21)],
    ...(() => {
      const qs = [
        { home: 26, away: 20 },
        { home: 24, away: 17 },
        { home: 18, away: 22 },
        { home: 29, away: 21 },
      ];
      const t = total(qs);
      return { homeScore: t.home, awayScore: t.away, crowd: 52318 };
    })(),
  },
];

const FIXTURES_2025: FixtureMatch[] = FIXTURES_2025_BASE.map((m) => {
  // enrich finals with stats + top fantasy + announced lists
  const homePts = m.homeScore ?? 0;
  const awayPts = m.awayScore ?? 0;

  return {
    ...m,
    teamStats: buildTeamStats(m.homeTeam, m.awayTeam, homePts, awayPts),
    topFantasy: buildTopFantasy(m.homeTeam, m.awayTeam),
    teamLists: buildTeamLists(m.homeTeam, m.awayTeam, true),
  };
});

/* -------------------------------------------------------------------------- */
/* 2026 GENERATOR (ALL ROUNDS)                                                  */
/* -------------------------------------------------------------------------- */

function circlePairings(teams: string[]) {
  // standard “circle method” for even team count
  const list = teams.slice();
  const fixed = list[0];
  let rot = list.slice(1);

  return (roundIndex: number) => {
    if (roundIndex > 0) {
      // rotate
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
  { dayOffset: 0, time: "19:50", label: "Thursday" },
  { dayOffset: 1, time: "19:40", label: "Friday" },
  { dayOffset: 2, time: "13:45", label: "Saturday" },
  { dayOffset: 2, time: "16:35", label: "Saturday" },
  { dayOffset: 2, time: "19:20", label: "Saturday" },
  { dayOffset: 3, time: "12:35", label: "Sunday" },
  { dayOffset: 3, time: "15:20", label: "Sunday" },
  { dayOffset: 3, time: "16:10", label: "Sunday" },
  { dayOffset: 3, time: "19:10", label: "Sunday" },
];

// light venue mapping (you can replace with real)
const TEAM_VENUE: Record<string, string> = {
  Adelaide: "Adelaide Oval",
  Brisbane: "Gabba",
  Carlton: "MCG",
  Collingwood: "MCG",
  Essendon: "Marvel Stadium",
  Fremantle: "Optus Stadium",
  Geelong: "GMHBA Stadium",
  "Gold Coast": "People First Stadium",
  GWS: "GIANTS Stadium",
  Hawthorn: "MCG",
  Melbourne: "MCG",
  "North Melbourne": "Marvel Stadium",
  "Port Adelaide": "Adelaide Oval",
  Richmond: "MCG",
  "St Kilda": "Marvel Stadium",
  Sydney: "SCG",
  "West Coast": "Optus Stadium",
  "Western Bulldogs": "Marvel Stadium",
};

function buildRoundLabel(roundNumber: number) {
  return roundNumber === 0 ? "OR" : `R${roundNumber}`;
}

function build2026(): FixtureMatch[] {
  const out: FixtureMatch[] = [];

  // Opening Round (keep your existing)
  out.push(
    {
      id: "2026-or-rich-carl",
      season: 2026,
      roundNumber: 0,
      roundLabel: "OR",
      status: "upcoming",
      dateISO: "2026-03-06",
      timeLocal: "19:20",
      venue: TEAM_VENUE["Richmond"] ?? "MCG",
      homeTeam: "Richmond",
      awayTeam: "Carlton",
    },
    {
      id: "2026-or-adel-port",
      season: 2026,
      roundNumber: 0,
      roundLabel: "OR",
      status: "upcoming",
      dateISO: "2026-03-07",
      timeLocal: "16:35",
      venue: TEAM_VENUE["Adelaide"] ?? "Adelaide Oval",
      homeTeam: "Adelaide",
      awayTeam: "Port Adelaide",
    }
  );

  // R1 starts next week
  const baseR1 = "2026-03-13";

  const pairsForRound = circlePairings(AFL_TEAMS.slice() as unknown as string[]);
  for (let round = 1; round <= 23; round++) {
    const pairs = pairsForRound(round - 1); // deterministic rotation

    // spread across week
    const roundStart = addDays(baseR1, (round - 1) * 7);

    pairs.forEach(([home, away], i) => {
      const slot = TIME_SLOTS[i % TIME_SLOTS.length];
      const dateISO = addDays(roundStart, slot.dayOffset);

      const roundLabel = buildRoundLabel(round);

      const match: FixtureMatch = {
        id: `2026-${roundLabel}-${home.slice(0, 3).toLowerCase()}-${away
          .slice(0, 3)
          .toLowerCase()}-${i}`,
        season: 2026,
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

  // enrich OR preview+lists too
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

/* -------------------------------------------------------------------------- */
/* EXPORTS                                                                    */
/* -------------------------------------------------------------------------- */

export const MOCK_FIXTURES: FixtureMatch[] = [...FIXTURES_2025, ...FIXTURES_2026];

/**
 * Keep legacy ladder shape — AFLMatchCentre normalises it.
 * You can replace this later with a true LadderRow[].
 */
export const MOCK_LADDER_TOP16 = [
  { rank: 1, team: "Sydney", record: "17-6" },
  { rank: 2, team: "Geelong", record: "16-7" },
  { rank: 3, team: "Brisbane", record: "15-8" },
  { rank: 4, team: "Carlton", record: "14-9" },
  { rank: 5, team: "Fremantle", record: "14-9" },
  { rank: 6, team: "Collingwood", record: "13-10" },
  { rank: 7, team: "Port Adelaide", record: "13-10" },
  { rank: 8, team: "Melbourne", record: "12-11" },
];
