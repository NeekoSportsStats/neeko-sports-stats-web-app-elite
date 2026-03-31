// src/components/afl/ai-insights/engine.ts
// NOTE: Full replacement file. Keeps existing exports and adds Player Impact Visual builders.
// Designed to be deterministic (no per-render Math.random flicker).

import type {
  PredictRow,
  MatchupRow,
  QuarterFlowRow,
  ConsistencyRow,
  DriverRow,
  // NEW (Section 4)
  PlayerImpactPoint,
  PlayerTrendPoint,
} from "./types";
import type { StatLens } from "./utils";
import {
  band,
  confLabel,
  cv,
  mean,
  normalize01,
  safeDiv,
  stdev,
  advantageLabel,
  clamp,
} from "./utils";
import type {
  FixtureMatch,
  TeamStatLine,
} from "@/components/afl/match-center/types";
import type { AFLTeam } from "@/components/afl/teams/mockTeams";

const WINDOW = 8;

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function lastN<T>(arr: T[], n: number) {
  return arr.slice(Math.max(0, arr.length - n));
}

function lower(s: string) {
  return (s ?? "").toString().trim().toLowerCase();
}

function findTeamByName(teams: AFLTeam[], name: string) {
  const n = lower(name);
  if (!n) return null;
  return (
    teams.find((t: any) => lower(t.name) === n) ??
    teams.find(
      (t: any) => lower(t.name).includes(n) || n.includes(lower(t.name))
    ) ??
    null
  );
}

function seriesForTeam(t: AFLTeam | null, stat: StatLens): number[] {
  if (!t) return [];
  if (stat === "fantasy") return ((t as any).fantasy ?? []).map(Number);
  if (stat === "disposals") return ((t as any).disposals ?? []).map(Number);
  return ((t as any).goals ?? []).map(Number);
}

function findStat(lines: TeamStatLine[] | undefined, key: StatLens) {
  if (!lines?.length) return null;

  const candidates = [
    key,
    key === "fantasy" ? "fantasy points" : key,
    key === "disposals" ? "disp" : key,
    key === "fantasy" ? "total fantasy" : key,
  ].map(lower);

  const direct = lines.find((l) => candidates.includes(lower(l.label)));
  if (direct) return Number(direct.value);

  const fuzzy = lines.find((l) =>
    candidates.some((c) => lower(l.label).includes(c))
  );
  return fuzzy ? Number(fuzzy.value) : null;
}

/* -------------------------------------------------------------------------- */
/* DETERMINISTIC RNG (NO FLICKER)                                              */
/* -------------------------------------------------------------------------- */

function hash32(input: string) {
  // fast stable 32-bit hash
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded01(seed: number) {
  // Mulberry32
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seededBetween(seed: number, min: number, max: number) {
  const r = seeded01(seed);
  return min + r * (max - min);
}

/* -------------------------------------------------------------------------- */
/* RANGE LOGIC                                                                */
/* -------------------------------------------------------------------------- */

function computeProjectionBand(values: number[]) {
  if (!values.length) return { low: 0, high: 0, mean: 0 };

  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { low: 0, high: 0, mean: 0 };

  const m = mean(clean);
  const sd = stdev(clean);

  return {
    low: Math.max(0, Math.round(m - sd * 0.85)),
    high: Math.round(m + sd * 0.85),
    mean: m,
  };
}

/* -------------------------------------------------------------------------- */
/* FIXTURES FILTERING                                                         */
/* -------------------------------------------------------------------------- */

export function filterPastFixtures(fixtures: FixtureMatch[]) {
  return fixtures.filter((m: any) =>
    ["final", "completed", "ft"].includes(lower(m.status))
  );
}

export function filterUpcomingFixtures(fixtures: FixtureMatch[]) {
  return fixtures.filter((m: any) =>
    ["upcoming", "scheduled", "pre", "preview"].includes(lower(m.status))
  );
}

export function roundOrder(label: string) {
  const l = lower(label);
  if (l === "or" || l.includes("opening")) return 0;
  const m = l.match(/r\s*(\d{1,2})/);
  if (m) return Number(m[1]);
  const n = Number(l.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 999;
}

/* -------------------------------------------------------------------------- */
/* 1) PLAYER SCORE PREDICTABILITY                                              */
/* -------------------------------------------------------------------------- */

export function buildPlayerPredictabilityFromFixtures(
  fixtures: FixtureMatch[],
  stat: StatLens
): PredictRow[] {
  const byPlayer = new Map<
    string,
    { name: string; team: string; values: number[] }
  >();

  for (const m of fixtures) {
    const lists = (m as any).teamLists;
    if (!lists) continue;

    const collect = (team: string, names: string[]) => {
      for (const name of names ?? []) {
        if (!name) continue;
        const key = `${name}__${team}`;
        if (!byPlayer.has(key)) {
          byPlayer.set(key, { name, team, values: [] });
        }
      }
    };

    collect(String((m as any).homeTeam), lists.home);
    collect(String((m as any).awayTeam), lists.away);
  }

  if (!byPlayer.size) return [];

  // deterministic mock history (until real ingestion is wired)
  for (const [id, p] of byPlayer) {
    const base =
      stat === "fantasy"
        ? 75 + seededBetween(hash32(id + stat), 0, 35)
        : stat === "disposals"
        ? 14 + seededBetween(hash32(id + stat), 0, 18)
        : 1 + seededBetween(hash32(id + stat), 0, 2.2);

    const games = WINDOW + Math.floor(seededBetween(hash32(id + "games"), 0, 4));

    for (let i = 0; i < games; i++) {
      const noise =
        stat === "fantasy"
          ? seededBetween(hash32(id + "n" + i), 0, 18)
          : stat === "disposals"
          ? seededBetween(hash32(id + "n" + i), 0, 6)
          : seededBetween(hash32(id + "n" + i), 0, 1.2);

      p.values.push(Math.max(0, Math.round(base + noise)));
    }
  }

  const vols: number[] = [];
  const confs: number[] = [];

  const pre = Array.from(byPlayer.entries()).map(([id, it]) => {
    const recent = lastN(it.values, WINDOW);
    const { low, high, mean: m } = computeProjectionBand(recent);

    const sd = stdev(recent);
    const within = recent.length
      ? recent.filter((x) => Math.abs(x - m) <= sd * 0.65).length /
        recent.length
      : 0;

    const vol = cv(recent);
    vols.push(vol);
    confs.push(within);

    return {
      id,
      name: it.name,
      team: it.team,
      rangeLow: low,
      rangeHigh: high,
      within,
      vol,
      ai: `${confLabel(within)} role stability with ${
        vol < 0.25 ? "contained" : "elevated"
      } volatility.`,
    };
  });

  const confMin = Math.min(...confs, 0);
  const confMax = Math.max(...confs, 1);
  const volMin = Math.min(...vols, 0);
  const volMax = Math.max(...vols, 1);

  const rows: PredictRow[] = pre.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    rangeLow: p.rangeLow,
    rangeHigh: p.rangeHigh,
    confidence01: normalize01(p.within, confMin, confMax),
    volatility01: normalize01(p.vol, volMin, volMax),
    ai: p.ai,
  }));

  rows.sort(
    (a, b) =>
      b.confidence01 - a.confidence01 ||
      a.volatility01 - b.volatility01
  );

  return rows;
}

/* -------------------------------------------------------------------------- */
/* 2) TEAM SCORE PREDICTABILITY                                                */
/* -------------------------------------------------------------------------- */

export function buildTeamPredictabilityFromTeams(
  teams: AFLTeam[],
  stat: StatLens
): PredictRow[] {
  const vols: number[] = [];
  const confs: number[] = [];

  const pre = teams.map((t: any) => {
    const series = lastN(seriesForTeam(t as any, stat), WINDOW).filter(
      Number.isFinite
    );

    const { low, high, mean: m } = computeProjectionBand(series);
    const sd = stdev(series);

    const within = series.length
      ? series.filter((x) => Math.abs(x - m) <= sd * 0.65).length /
        series.length
      : 0;

    const vol = cv(series);
    vols.push(vol);
    confs.push(within);

    return {
      id: String(t.code ?? t.name),
      name: String(t.name ?? "Team"),
      team: String(t.name ?? "Team"),
      rangeLow: low,
      rangeHigh: high,
      within,
      vol,
      ai: `${confLabel(within)} system repeatability.`,
    };
  });

  const confMin = Math.min(...confs, 0);
  const confMax = Math.max(...confs, 1);
  const volMin = Math.min(...vols, 0);
  const volMax = Math.max(...vols, 1);

  const rows: PredictRow[] = pre.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    rangeLow: p.rangeLow,
    rangeHigh: p.rangeHigh,
    confidence01: normalize01(p.within, confMin, confMax),
    volatility01: normalize01(p.vol, volMin, volMax),
    ai: p.ai,
  }));

  rows.sort(
    (a, b) =>
      b.confidence01 - a.confidence01 ||
      a.volatility01 - b.volatility01
  );

  return rows;
}

/* -------------------------------------------------------------------------- */
/* 3) H2H PLAYER MATCHUPS                                                      */
/* -------------------------------------------------------------------------- */

export function buildH2HPlayerMatchups(
  match: FixtureMatch | undefined,
  stat: StatLens,
  teams: AFLTeam[]
): MatchupRow[] {
  if (!match) return [];

  const out: MatchupRow[] = [];
  const status = lower((match as any).status);
  const top = (match as any).topFantasy as any[] | undefined;

  if (
    ["final", "completed", "ft"].includes(status) &&
    top?.length &&
    stat === "fantasy"
  ) {
    const a = top[0];
    const b = top[1];

    const sumA = (a?.players ?? []).reduce(
      (s: number, p: any) => s + Number(p.fantasy ?? 0),
      0
    );
    const sumB = (b?.players ?? []).reduce(
      (s: number, p: any) => s + Number(p.fantasy ?? 0),
      0
    );

    const delta = safeDiv(sumA - sumB, Math.max(1, Math.abs(sumB)));
    const label = advantageLabel(delta);

    out.push({
      key: "top3_fantasy_swing",
      label,
      deltaPct: delta,
      ai: `${label} indicated: ${Math.round(sumA)} vs ${Math.round(sumB)}.`,
    } as any);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* 4) H2H TEAM MATCHUPS                                                        */
/* -------------------------------------------------------------------------- */

export function buildH2HTeamMatchups(
  match: FixtureMatch | undefined,
  stat: StatLens,
  teams: AFLTeam[]
): MatchupRow[] {
  if (!match) return [];

  const out: MatchupRow[] = [];

  const home = String((match as any).homeTeam ?? "");
  const away = String((match as any).awayTeam ?? "");
  const venue = String((match as any).venue ?? "");

  const hT = findTeamByName(teams, home);
  const aT = findTeamByName(teams, away);

  const hSeries = lastN(seriesForTeam(hT, stat), WINDOW);
  const aSeries = lastN(seriesForTeam(aT, stat), WINDOW);

  const delta = safeDiv(
    mean(hSeries) - mean(aSeries),
    Math.max(1, Math.abs(mean(aSeries)))
  );

  out.push({
    key: "system_edge",
    label: advantageLabel(delta),
    deltaPct: delta,
    ai: "System edge based on recent output.",
  } as any);

  return out;
}

/* -------------------------------------------------------------------------- */
/* 5) GAME FLOW                                                               */
/* -------------------------------------------------------------------------- */

export function buildQuarterFlow(
  match: FixtureMatch | undefined
): QuarterFlowRow[] {
  const qs = (match as any)?.quarters;
  if (!qs?.length)
    return [
      { q: "Q1", swing01: 0.4, decisive01: 0.4, ai: "No data." },
      { q: "Q2", swing01: 0.4, decisive01: 0.4, ai: "No data." },
      { q: "Q3", swing01: 0.4, decisive01: 0.4, ai: "No data." },
      { q: "Q4", swing01: 0.4, decisive01: 0.4, ai: "No data." },
    ];

  const margins = qs.map((q: any) => q.home - q.away);
  const abs = margins.map(Math.abs);

  const sd = stdev(margins);
  const sdN = normalize01(sd, 3, 22);

  const absMin = Math.min(...abs, 0);
  const absMax = Math.max(...abs, 1);

  return qs.map((q: any) => {
    const m = q.home - q.away;
    return {
      q: q.label,
      decisive01: normalize01(Math.abs(m), absMin, absMax),
      swing01: clamp(sdN * 0.7, 0, 1),
      ai: `Margin ${m}`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 6) CONSISTENCY VS EXPLOSIVENESS                                             */
/* -------------------------------------------------------------------------- */

export function buildConsistencyExplosivenessTeams(
  teams: AFLTeam[],
  stat: StatLens
): ConsistencyRow[] {
  const rows: ConsistencyRow[] = [];

  for (const t of teams as any[]) {
    const series = lastN(seriesForTeam(t as any, stat), WINDOW);
    const consistency01 = clamp(1 - normalize01(cv(series), 0.06, 0.45), 0, 1);

    const b = band(series, 0.1, 0.9);
    const m = mean(series);

    const tailRate = series.length
      ? series.filter((x) => x >= b.high).length / series.length
      : 0;

    const tailMag = series.length
      ? mean(series.filter((x) => x >= b.high).map((x) => safeDiv(x - m, m)))
      : 0;

    const explosiveness01 = clamp(tailRate * 0.65 + tailMag * 0.35, 0, 1);

    rows.push({
      id: String(t.code ?? t.name),
      name: String(t.name ?? "Team"),
      consistency01,
      explosiveness01,
      ai: "Derived from recent output distribution.",
    });
  }

  return rows.sort(
    (a, b) =>
      b.explosiveness01 - a.explosiveness01 ||
      b.consistency01 - a.consistency01
  );
}

/* -------------------------------------------------------------------------- */
/* 7) OUTCOME DRIVERS                                                          */
/* -------------------------------------------------------------------------- */

export function buildOutcomeDrivers(params: {
  match: FixtureMatch | undefined;
  fixtures: FixtureMatch[];
  stat: StatLens;
}): DriverRow[] {
  const out: DriverRow[] = [];

  out.push({
    id: "system",
    title: "System Output",
    influence01: 0.6,
    stability01: 0.6,
    ai: "System output drives baseline expectation.",
  });

  return out;
}

/* -------------------------------------------------------------------------- */
/* 8) SECTION 4 — PLAYER IMPACT VISUAL                                         */
/* -------------------------------------------------------------------------- */

function collectPlayersFromFixtures(fixtures: FixtureMatch[]) {
  const byPlayer = new Map<string, { name: string; team: string }>();

  for (const m of fixtures) {
    const lists = (m as any).teamLists;
    if (!lists) continue;

    const add = (team: string, names: string[]) => {
      for (const name of names ?? []) {
        if (!name) continue;
        const key = `${name}__${team}`;
        if (!byPlayer.has(key)) byPlayer.set(key, { name, team });
      }
    };

    add(String((m as any).homeTeam), lists.home);
    add(String((m as any).awayTeam), lists.away);
  }

  return byPlayer;
}

function makeDeterministicSeries(params: {
  id: string;
  stat: StatLens;
  length: number;
}) {
  const { id, stat, length } = params;

  const base =
    stat === "fantasy"
      ? 70 + seededBetween(hash32(id + stat + "b"), 0, 45)
      : stat === "disposals"
      ? 12 + seededBetween(hash32(id + stat + "b"), 0, 22)
      : 0.5 + seededBetween(hash32(id + stat + "b"), 0, 3.0);

  const volatility =
    stat === "fantasy"
      ? seededBetween(hash32(id + stat + "v"), 6, 22)
      : stat === "disposals"
      ? seededBetween(hash32(id + stat + "v"), 3, 9)
      : seededBetween(hash32(id + stat + "v"), 0.4, 1.8);

  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const phase = i / Math.max(1, length - 1);
    const trend = seededBetween(hash32(id + stat + "t"), -0.12, 0.18);
    const drift = base * (trend * (phase - 0.5));
    const noise = seededBetween(hash32(id + stat + "n" + i), -volatility, volatility);
    const v = Math.max(0, Math.round(base + drift + noise));
    out.push(v);
  }
  return out;
}

export function buildPlayerImpactPoints(params: {
  fixturesPast: FixtureMatch[];
  match: FixtureMatch | undefined;
  stat: StatLens;
  window?: number; // history bars
}): PlayerImpactPoint[] {
  const { fixturesPast, match, stat } = params;
  const window = Math.max(4, Math.min(10, params.window ?? 7));

  if (!match) return [];

  const home = String((match as any).homeTeam ?? "");
  const away = String((match as any).awayTeam ?? "");

  // Collect all players across past fixtures, then filter to the match teams.
  const all = collectPlayersFromFixtures(fixturesPast);
  const matchPlayers = Array.from(all.entries())
    .filter(([, p]) => p.team === home || p.team === away)
    .map(([id, p]) => ({ id, ...p }));

  if (!matchPlayers.length) return [];

  const confs: number[] = [];
  const vols: number[] = [];
  const expecteds: number[] = [];

  const pre = matchPlayers.map((p) => {
    // Build history series (deterministic until real ingestion)
    const hist = makeDeterministicSeries({
      id: p.id,
      stat,
      length: window,
    });

    const band = computeProjectionBand(hist);
    const sd = stdev(hist);

    const within = hist.length
      ? hist.filter((x) => Math.abs(x - band.mean) <= sd * 0.65).length / hist.length
      : 0;

    const vol = cv(hist);
    const expected = Math.round(band.mean);

    confs.push(within);
    vols.push(vol);
    expecteds.push(expected);

    // Build trend points (history + one projected point)
    const trend: PlayerTrendPoint[] = hist.map((v, idx) => ({
      label: `G${idx + 1}`,
      value: v,
      kind: "actual",
    }));

    trend.push({
      label: "Next",
      value: expected,
      kind: "projected",
      low: band.low,
      high: band.high,
    });

    return {
      id: p.id,
      name: p.name,
      team: p.team,
      within,
      vol,
      expected,
      rangeLow: band.low,
      rangeHigh: band.high,
      trend,
      ai: `${confLabel(within)} role shape; projection band reflects recent variance.`,
    };
  });

  const confMin = Math.min(...confs, 0);
  const confMax = Math.max(...confs, 1);
  const volMin = Math.min(...vols, 0);
  const volMax = Math.max(...vols, 1);
  const expMin = Math.min(...expecteds, 0);
  const expMax = Math.max(...expecteds, 1);

  const out: PlayerImpactPoint[] = pre.map((p) => {
    const confidence01 = normalize01(p.within, confMin, confMax);
    const volatility01 = normalize01(p.vol, volMin, volMax);
    const expected01 = normalize01(p.expected, expMin, expMax);

    return {
      id: p.id,
      name: p.name,
      team: p.team,
      safety01: confidence01,
      impact01: confidence01,
      size01: expected01,
      confidence01,
      volatility01,
      expected01,
      expected: p.expected,
      rangeLow: p.rangeLow,
      rangeHigh: p.rangeHigh,
      trend: p.trend,
      ai: p.ai,
    };
  });

  // Order: higher expected then safer
  out.sort((a, b) => b.expected - a.expected || b.confidence01 - a.confidence01);
  return out;
}
