/* -------------------------------------------------------------------------- */
/* MATCH CENTER — CORE TYPES                                                  */
/* -------------------------------------------------------------------------- */

export type MatchStatus = "upcoming" | "final";

export type FixtureHalf = {
  label: "H1" | "H2";
  home: number;
  away: number;
};

export type TeamStatLine = {
  label: string;
  value: number;
  leagueAvg?: number;
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
  announced: boolean;
  caption?: string;
  home: string[];
  away: string[];
  homeBench?: string[];
  awayBench?: string[];
  lateChanges?: { team: string; in: string; out?: string; note?: string }[];
  insOuts?: { team: string; ins: string[]; outs: string[] }[];
};

export type MatchPreview = {
  homeWinProb: number;
  awayWinProb: number;
  reasons: [string, string];
  ladderPos?: { home: number; away: number };
  last5?: { home: ("W" | "L")[]; away: ("W" | "L")[] };
};

export type FixtureMatch = {
  id: string;
  season: 2025 | 2026;
  roundNumber: number;
  roundLabel: string;
  dateISO: string;
  timeLocal: string;
  venue: string;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  halves?: FixtureHalf[];
  crowd?: number;
  topPlayers?: { home: string[]; away: string[] };
  ladderDelta?: { team: string; delta: number }[];
  teamStats?: MatchTeamStats[];
  topFantasy?: TopFantasyTeam[];
  teamLists?: TeamLists;
  preview?: MatchPreview;
};

/* -------------------------------------------------------------------------- */
/* EPL AI INSIGHTS — SHARED TYPES                                              */
/* -------------------------------------------------------------------------- */

export type PremiumMode = "free" | "premium";

/* ---------------- PREDICTABILITY ---------------- */

export type PredictRow = {
  id: string;
  name: string;
  team: string;
  confidence01: number;
  volatility01: number;
  rangeLow: number;
  rangeHigh: number;
  ai: string;
};

/* ---------------- MATCHUPS ---------------- */

export type MatchupRow = {
  id: string;
  label: string;
  edge01: number;
  ai: string;
};

/* ---------------- GAME FLOW ---------------- */

export type HalfFlowRow = {
  half: "H1" | "H2";
  swing01: number;
  decisive01: number;
  ai: string;
};

/* ---------------- CONSISTENCY ---------------- */

export type ConsistencyRow = {
  id: string;
  name: string;
  consistency01: number;
  explosiveness01: number;
  ai: string;
};

/* ---------------- DRIVERS ---------------- */

export type DriverRow = {
  id: string;
  title: string;
  influence01: number;
  stability01: number;
  ai: string;
};

export type OutcomeDriver = {
  key: string;
  title: string;
  influence01: number;
  stability01: number;
  aiSummary: string;
};

/* ---------------- H2H DETAIL ---------------- */

export type PlayerMatchupRow = {
  id: string;
  label: string;
  edge01: number;
  confidence01: number;
  volatility01: number;
  ai: string;
};

export type TeamMatchupRow = {
  id: string;
  label: string;
  edge01: number;
  confidence01: number;
  volatility01: number;
  ai: string;
};

export type HalfFlow = HalfFlowRow;

export type ConsistencyExplosivenessRow = {
  id: string;
  name: string;
  consistency01: number;
  explosiveness01: number;
  ai: string;
};

/* -------------------------------------------------------------------------- */
/* SECTION 4 — PLAYER IMPACT VISUAL                                            */
/* -------------------------------------------------------------------------- */

/**
 * Trend point used by Player Impact visuals
 * (line chart + NEXT round shaded column)
 */
export type PlayerTrendPoint = {
  /** Round label (OR, R1–R23, NEXT) */
  label: string;

  /** Actual or projected stat value */
  value: number;

  /** Projection band (NEXT round only) */
  low?: number;
  high?: number;

  /** Visual hint for styling */
  kind?: "actual" | "projected";
};

/**
 * Unified data shape for Player Impact visualisations
 */
export type PlayerImpactPoint = {
  id: string;
  name: string;
  team: string;

  /* Scatter axes */
  safety01: number;
  impact01: number;
  size01: number;

  /* Predictive signals */
  confidence01: number;
  volatility01: number;
  expected01: number;

  /* Projection */
  expected: number;
  rangeLow: number;
  rangeHigh: number;

  /* Trend */
  trend?: PlayerTrendPoint[];

  /* Copy */
  ai?: string;
};
