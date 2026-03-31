import { useMemo, useState } from "react";
import type { FixtureMatch } from "@/components/afl/match-center/types";

export type LensKey = "fantasy" | "disposals" | "goals";
export type TeamFilter = "both" | "home" | "away";
export type LabelMode = "smart" | "all" | "none";

export type PlayerTrendPoint = { week: string; value: number };

export type PlayerPoint = {
  id: string;
  name: string;
  teamSide: "home" | "away";
  teamName: string;

  momentum: number; // 0-100
  ceiling: number; // 0-100

  trend?: PlayerTrendPoint[];
};

export type Quadrant = "volatile" | "finale" | "low" | "safe";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function rnd(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function stdev(vals: number[]) {
  if (!vals.length) return 0;
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const v =
    vals.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, vals.length - 1);
  return Math.sqrt(v);
}

function quadrantOf(p: PlayerPoint): Quadrant {
  if (p.momentum >= 50 && p.ceiling >= 50) return "finale";
  if (p.momentum < 50 && p.ceiling >= 50) return "volatile";
  if (p.momentum >= 50 && p.ceiling < 50) return "safe";
  return "low";
}

function genTrend(seed: number) {
  const weeks = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12"];
  let v = seed;
  return weeks.map((w, i) => {
    v = v + (i % 3 === 0 ? rnd(-12, 14) : rnd(-8, 10));
    return { week: w, value: Math.max(20, Math.min(130, v)) };
  });
}

export function usePlayerScatterData(args: { match?: FixtureMatch; initialLens?: LensKey }) {
  const homeTeam = (args.match as any)?.homeTeam?.name ?? (args.match as any)?.homeTeam ?? "Richmond";
  const awayTeam = (args.match as any)?.awayTeam?.name ?? (args.match as any)?.awayTeam ?? "Carlton";

  const [lens, setLens] = useState<LensKey>(args.initialLens ?? "fantasy");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("both");
  const [labelMode, setLabelMode] = useState<LabelMode>("smart");
  const [openId, setOpenId] = useState<string | null>(null);

  const playersAll = useMemo<PlayerPoint[]>(() => {
    // Deterministic-ish “mock” pool (safe / non-scrapable). Replace later with real ingestion.
    const home = [
      "Dustin Martin",
      "Tom Lynch",
      "Noah Balta",
      "Shai Bolton",
      "Toby Nankervis",
      "Jack Graham",
      "Jayden Short",
      "Nick Vlastuin",
    ];
    const away = [
      "Sam Walsh",
      "Patrick Cripps",
      "Charlie Curnow",
      "Jacob Weitering",
      "Christian Petracca",
      "George Hewett",
      "Zac Williams",
      "Adam Cerra",
    ];

    const mk = (name: string, side: "home" | "away", idx: number): PlayerPoint => {
      const base = 58 + (idx % 6) * 6 + (side === "away" ? 4 : 0);
      const momentum = clamp(base + rnd(-16, 18), 20, 95);
      const ceiling = clamp(base + rnd(-20, 22), 20, 95);
      return {
        id: `${side}-${idx}-${name.replace(/\s+/g, "-").toLowerCase()}`,
        name,
        teamSide: side,
        teamName: side === "home" ? homeTeam : awayTeam,
        momentum,
        ceiling,
        trend: genTrend(70 + idx * 3 + (side === "away" ? 5 : 0)),
      };
    };

    const out: PlayerPoint[] = [];
    home.forEach((n, i) => out.push(mk(n, "home", i)));
    away.forEach((n, i) => out.push(mk(n, "away", i)));

    // Keep a familiar “hero” name for your screenshots vibe
    if (!out.some((p) => p.name === "Max Gawn")) {
      out.push({
        id: "away-max-gawn",
        name: "Max Gawn",
        teamSide: "away",
        teamName: awayTeam,
        momentum: 62,
        ceiling: 81,
        trend: genTrend(78),
      });
    }

    return out;
  }, [homeTeam, awayTeam]);

  const playersVisible = useMemo(() => {
    let arr = playersAll;

    if (teamFilter !== "both") {
      arr = arr.filter((p) => p.teamSide === teamFilter);
    }

    // Lens just nudges the distribution (still mock)
    if (lens === "disposals") {
      arr = arr.map((p) => ({
        ...p,
        momentum: clamp(p.momentum + rnd(-6, 10), 20, 95),
        ceiling: clamp(p.ceiling + rnd(-10, 8), 20, 95),
      }));
    } else if (lens === "goals") {
      arr = arr.map((p) => ({
        ...p,
        momentum: clamp(p.momentum + rnd(-10, 6), 20, 95),
        ceiling: clamp(p.ceiling + rnd(-6, 14), 20, 95),
      }));
    }

    return arr;
  }, [playersAll, lens, teamFilter]);

  const selected = useMemo(
    () => playersAll.find((p) => p.id === openId) ?? null,
    [playersAll, openId]
  );

  const ranked = useMemo(() => {
    return [...playersVisible].sort(
      (a, b) => b.momentum + b.ceiling - (a.momentum + a.ceiling)
    );
  }, [playersVisible]);

  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = { volatile: 0, finale: 0, low: 0, safe: 0 };
    playersVisible.forEach((p) => counts[quadrantOf(p)]++);
    return counts;
  }, [playersVisible]);

  const dominantQuadrant = useMemo<Quadrant>(() => {
    const entries = Object.entries(quadrantCounts) as [Quadrant, number][];
    return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "finale";
  }, [quadrantCounts]);

  const lean = useMemo(() => {
    const homePts = playersVisible.filter((p) => p.teamSide === "home");
    const awayPts = playersVisible.filter((p) => p.teamSide === "away");

    const score = (arr: PlayerPoint[]) =>
      arr.length ? arr.reduce((s, p) => s + (p.momentum + p.ceiling), 0) / arr.length : 0;

    const homeAvg = score(homePts);
    const awayAvg = score(awayPts);
    const diff = awayAvg - homeAvg; // + => away lean

    const direction = Math.abs(diff) < 3 ? "even" : diff > 0 ? "away" : "home";
    const strength = Math.abs(diff) < 3 ? "Neutral" : Math.abs(diff) < 8 ? "Slight" : "Lean";
    const pct = clamp(50 + diff * 1.2, 8, 92);

    return { homeAvg, awayAvg, diff, direction, strength, pct };
  }, [playersVisible]);

  const volatility = useMemo(() => {
    const totals = playersVisible.map((p) => p.momentum + p.ceiling);
    const s = stdev(totals);
    const v01 = clamp((s - 6) / 12, 0, 1);
    const label = v01 < 0.33 ? "Stable" : v01 < 0.66 ? "Swingy" : "Volatile";
    return { label, v01 };
  }, [playersVisible]);

  const whyLean = useMemo(() => {
    const homeFinale = playersVisible.filter((p) => p.teamSide === "home" && quadrantOf(p) === "finale").length;
    const awayFinale = playersVisible.filter((p) => p.teamSide === "away" && quadrantOf(p) === "finale").length;

    const dir =
      lean.direction === "even"
        ? "Even"
        : lean.direction === "home"
        ? homeTeam
        : awayTeam;

    const magnitude =
      lean.direction === "even"
        ? "Both sides cluster similarly across momentum and ceiling."
        : `Avg (momentum+ceiling) difference is ${Math.abs(lean.diff).toFixed(1)} toward ${dir}.`;

    const distribution =
      lean.direction === "even"
        ? `Finale targets are balanced (${homeFinale} vs ${awayFinale}).`
        : `Finale target count: ${homeTeam} ${homeFinale} · ${awayTeam} ${awayFinale}.`;

    const risk = `Volatility reads ${volatility.label.toLowerCase()} — expect ${volatility.label === "Volatile" ? "wider outcome ranges" : volatility.label === "Swingy" ? "moderate swings" : "tighter floors"}.`;

    const practical =
      lean.direction === "even"
        ? "Use quadrant buckets to separate ceiling plays vs stable floors."
        : `If stacking, bias your top exposures toward ${dir} “finale” + one volatile ceiling play.`;

    return {
      title: `Why is it lean?`,
      lines: [magnitude, distribution, risk, practical],
    };
  }, [playersVisible, lean.direction, lean.diff, homeTeam, awayTeam, volatility.label]);

  const buckets = useMemo(() => {
    const finale = playersVisible.filter((p) => quadrantOf(p) === "finale").slice(0, 6);
    const volatileUpside = playersVisible
      .filter((p) => quadrantOf(p) === "volatile")
      .sort((a, b) => b.ceiling - a.ceiling)
      .slice(0, 6);
    const safeFloors = playersVisible
      .filter((p) => quadrantOf(p) === "safe")
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, 6);
    const avoid = playersVisible
      .filter((p) => quadrantOf(p) === "low")
      .sort((a, b) => a.momentum + a.ceiling - (b.momentum + b.ceiling))
      .slice(0, 6);

    return { finale, volatileUpside, safeFloors, avoid };
  }, [playersVisible]);

  return {
    homeTeam,
    awayTeam,

    lens,
    setLens,

    teamFilter,
    setTeamFilter,

    labelMode,
    setLabelMode,

    playersAll,
    playersVisible,

    ranked,
    buckets,

    openId,
    setOpenId,
    selected,

    quadrantCounts,
    dominantQuadrant,

    lean,
    volatility,
    whyLean,
  };
}
