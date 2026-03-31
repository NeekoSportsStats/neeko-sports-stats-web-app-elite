// src/components/nba/match-center/types.ts

export type MatchStatus = "upcoming" | "final";

export type FixtureQuarter = {
  label: "Q1" | "Q2" | "Q3" | "Q4";
  home: number;
  away: number;
};

export type TeamStatLine = {
  label: string;
  value: number;
  /** Optional league average for a ghost marker line */
  leagueAvg?: number;
  /** If false, lower is better (e.g. Turnovers). Default true */
  higherIsBetter?: boolean;
};

export type MatchTeamStats = {
  team: string;
  stats: TeamStatLine[];
};

export type FantasyPlayer = {
  name: string;
  fantasy: number;
};

export type TopFantasyTeam = {
  team: string;
  players: FantasyPlayer[];
};

export type TeamLists = {
  /** If false, we show the full club list as “Not yet announced (projected)” */
  announced: boolean;
  caption?: string;

  /** Usually 22 when announced; can be full list when not announced */
  home: string[];
  away: string[];

  /** Optional bench labels (subset of home/away) */
  homeBench?: string[];
  awayBench?: string[];

  /** Optional change notes (purely mock for now) */
  lateChanges?: { team: string; in: string; out?: string; note?: string }[];
  insOuts?: { team: string; ins: string[]; outs: string[] }[];
};

export type MatchPreview = {
  homeWinProb: number; // 0-100
  awayWinProb: number; // 0-100
  reasons: [string, string]; // exactly 2 lines
  ladderPos?: { home: number; away: number };
  last5?: { home: ("W" | "L")[]; away: ("W" | "L")[] };
};

export type FixtureMatch = {
  id: string;

  /** Season context */
  season: "2024-25" | "2025-26";

  /** Game context */
  roundNumber: number; // Game number (1-82)
  roundLabel: string; // G1…G82

  /** Match info */
  dateISO: string;
  timeLocal: string;
  venue: string;

  homeTeam: string;
  awayTeam: string;

  status: MatchStatus;

  /** FINAL-only fields */
  homeScore?: number;
  awayScore?: number;

  quarters?: FixtureQuarter[];

  crowd?: number;

  /** Optional: existing (kept) */
  topPlayers?: {
    home: string[];
    away: string[];
  };

  /** Post-match ladder movement (optional) */
  ladderDelta?: { team: string; delta: number }[];

  /** FINAL: team stats shown in overlay */
  teamStats?: MatchTeamStats[];

  /** FINAL: top 3 fantasy performers per team (card + overlay optional) */
  topFantasy?: TopFantasyTeam[];

  /** UPCOMING: squads & lists (overlay only) */
  teamLists?: TeamLists;

  /** UPCOMING: win probability + reasons + ladder + last5 */
  preview?: MatchPreview;
};
