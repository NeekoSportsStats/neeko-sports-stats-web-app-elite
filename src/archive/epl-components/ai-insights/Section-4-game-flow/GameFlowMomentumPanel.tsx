import React, { useMemo } from "react";
import { Lock, TrendingUp, Activity, Waves } from "lucide-react";

import type { FixtureMatch } from "@/components/epl/match-center/types";
import type { PremiumMode } from "@/components/epl/ai-insights/data/types";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

/* -------------------------------------------------------------------------- */
/* SECTION 3 — GAME FLOW & MOMENTUM                                           */
/* Full fresh design + gating (Free vs Neeko+)                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function mean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stdev(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v =
    vals.reduce((acc, x) => acc + (x - m) * (x - m), 0) /
    Math.max(1, vals.length - 1);
  return Math.sqrt(v);
}

function labelVolatility01(x01: number) {
  if (x01 <= 0.28) return "Stable";
  if (x01 <= 0.56) return "Swing";
  return "Volatile";
}

function labelTone(x: "Stable" | "Swing" | "Volatile") {
  if (x === "Stable")
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (x === "Volatile")
    return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

function fmtPct(n01: number) {
  return `${Math.round(clamp(n01, 0, 1) * 100)}%`;
}

function capTeamName(s: string) {
  return (s || "").trim();
}

/* -------------------------------------------------------------------------- */
/* HALF + EVENT ACCESSORS (robust to mock/real shapes)                        */
/* -------------------------------------------------------------------------- */

type HalfScore = { home: number; away: number };

function getMatchTeams(m: any): { home: string | null; away: string | null } {
  const home = m?.homeTeam ?? m?.teams?.home?.name ?? m?.home?.name ?? null;
  const away = m?.awayTeam ?? m?.teams?.away?.name ?? m?.away?.name ?? null;
  return { home: home ? String(home) : null, away: away ? String(away) : null };
}

function getFinalScores(m: any): { home: number | null; away: number | null } {
  const home =
    safeNum(m?.homeScore) ??
    safeNum(m?.scores?.home) ??
    safeNum(m?.score?.home) ??
    safeNum(m?.goals?.home); // fallback
  const away =
    safeNum(m?.awayScore) ??
    safeNum(m?.scores?.away) ??
    safeNum(m?.score?.away) ??
    safeNum(m?.goals?.away);
  return { home, away };
}

/**
 * Attempts to read halves from a variety of shapes:
 * - m.halves: [{ home: 1, away: 0 }, { home: 2, away: 1 }]
 * - m.halves: [{ homeScore: 1, awayScore: 0 }, ...]
 * - m.scores.halves: same idea
 * - m.periods: same idea
 */
function getHalfScores(m: any): HalfScore[] {
  const raw = m?.halves ?? m?.scores?.halves ?? m?.periods ?? m?.stats?.halves ?? null;

  if (!Array.isArray(raw) || !raw.length) return [];

  const out: HalfScore[] = [];
  for (const h of raw) {
    const homeScore =
      safeNum(h?.home) ??
      safeNum(h?.homeScore) ??
      safeNum(h?.home_goals) ??
      safeNum(h?.goals_home) ??
      null;
    const awayScore =
      safeNum(h?.away) ??
      safeNum(h?.awayScore) ??
      safeNum(h?.away_goals) ??
      safeNum(h?.goals_away) ??
      null;
    if (homeScore == null || awayScore == null) continue;
    out.push({ home: homeScore, away: awayScore });
  }
  return out;
}

/**
 * If event minutes exist, count goal bursts.
 * Accepts shapes like:
 * - m.events: [{ time: { minute: 12 }, type: "Goal" }, ...]
 * - m.events: [{ minute: 12, type: "goal" }, ...]
 */
function getEventMinutes(m: any): number[] {
  const ev = m?.events;
  if (!Array.isArray(ev) || !ev.length) return [];
  const mins: number[] = [];
  for (const e of ev) {
    const min =
      safeNum(e?.time?.minute) ?? safeNum(e?.minute) ?? safeNum(e?.elapsed) ?? null;
    if (min == null) continue;
    mins.push(min);
  }
  return mins.sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------- */
/* MODEL                                                                      */
/* -------------------------------------------------------------------------- */

type Phase = "early" | "mid" | "late";

type PhaseSignal = {
  phase: Phase;
  label: "Stable" | "Swing" | "Volatile";
  volatility01: number; // 0..1
  controlBias: "home" | "away" | "neutral";
  chaosRisk: "Low" | "Elevated" | "High";
  summaryLine: string;
};

type TeamProfile = {
  team: string;
  earlyTempo: "Fast" | "Measured" | "Slow";
  postHalfLift: "Strong" | "Moderate" | "Flat";
  lateStability: "High" | "Medium" | "Low";
  sensitivity: "Low" | "Medium" | "High";
  editorial: string;
};

type MomentumWindow = {
  id: string;
  title: string; // e.g. "Q3 opening 10 minutes"
  why: string; // calm explanation
  weight01: number; // strength
};

type DeepTrigger = {
  id: string;
  if: string;
  then: string;
};

type FlowModel = {
  overallLine: string;
  phases: PhaseSignal[];
  homeProfile: TeamProfile;
  awayProfile: TeamProfile;
  windows: MomentumWindow[]; // sorted desc
  deepTriggers: DeepTrigger[];
};

/* -------------------------------------------------------------------------- */
/* BUILDERS                                                                    */
/* -------------------------------------------------------------------------- */

function gamesForTeam(fixtures: FixtureMatch[], team: string) {
  return fixtures
    .filter((m: any) => {
      const t = getMatchTeams(m);
      return t.home === team || t.away === team;
    })
    .filter((m: any) => {
      const { home, away } = getFinalScores(m);
      return home != null && away != null;
    });
}

function halfGoalsForTeam(m: any, team: string): number[] {
  const { home, away } = getMatchTeams(m);
  const hs = getHalfScores(m);
  if (!hs.length) return [];
  if (home === team) return hs.map((h) => h.home);
  if (away === team) return hs.map((h) => h.away);
  return [];
}

function halfMarginsForTeam(m: any, team: string): number[] {
  const { home, away } = getMatchTeams(m);
  const hs = getHalfScores(m);
  if (!hs.length) return [];
  if (home === team) return hs.map((h) => h.home - h.away);
  if (away === team) return hs.map((h) => h.away - h.home);
  return [];
}

function phaseSlice(halfVals: number[], phase: Phase) {
  if (!halfVals.length) return [];

  if (phase === "early") {
    // First half (H1)
    return halfVals.slice(0, 1);
  }

  if (phase === "mid") {
    // Mid-match control phase (aggregate of both halves, dampened)
    return halfVals.length >= 2 ? halfVals.map((v) => v * 0.85) : halfVals;
  }

  // Late game: Second half (H2) gets a natural volatility lift
  const h2 = halfVals.slice(1, 2);
  return h2.length ? h2.map((v) => v * 1.2) : [];
}

function chaosRiskFrom(vol01: number) {
  // Floor prevents low-volatility but high-tension states
  if (vol01 <= 0.22) return "Low";
  if (vol01 <= 0.5) return "Elevated";
  return "High";
}

function biasFrom(homeEdge: number, awayEdge: number) {
  const d = homeEdge - awayEdge;
  if (Math.abs(d) < 0.18) return "neutral";
  return d > 0 ? "home" : "away";
}

function computePhaseSignal(
  phase: Phase,
  homeMargins: number[],
  awayMargins: number[],
  homeTeam: string,
  awayTeam: string
): PhaseSignal {
  const hm = phaseSlice(homeMargins, phase);
  const am = phaseSlice(awayMargins, phase);

  const hmAbs = hm.map((x) => Math.abs(x));
  const amAbs = am.map((x) => Math.abs(x));

  const base =
    hmAbs.length + amAbs.length >= 3
      ? (stdev(hmAbs) + stdev(amAbs)) / 2
      : mean([...hmAbs, ...amAbs]);

  const vol01 = clamp(base / 18, 0, 1);
  const label = labelVolatility01(vol01);

  const homeEdge = mean(hm) / 40;
  const awayEdge = mean(am) / 40;
  const controlBias = biasFrom(homeEdge, awayEdge);

  const chaosRisk = chaosRiskFrom(vol01);

  const phaseName =
    phase === "early" ? "First Half (H1)" : phase === "mid" ? "Mid-match control" : "Second Half (H2)";

  const biasText =
    controlBias === "neutral"
      ? "control is typically shared"
      : controlBias === "home"
      ? `${homeTeam} tend to find cleaner control`
      : `${awayTeam} tend to find cleaner control`;

  const summaryLine = `${phaseName}: ${label.toLowerCase()} phase — ${biasText}.`;

  return {
    phase,
    label,
    volatility01: vol01,
    controlBias,
    chaosRisk,
    summaryLine,
  };
}

function teamProfileFrom(fixtures: FixtureMatch[], team: string): TeamProfile {
  const games = gamesForTeam(fixtures, team).slice(-12); // last ~12
  const h1: number[] = [];
  const h2: number[] = [];
  const swingCounts: number[] = [];

  for (const m of games as any[]) {
    const goals = halfGoalsForTeam(m, team);
    const margins = halfMarginsForTeam(m, team);

    if (goals.length >= 1) h1.push(goals[0]);
    if (goals.length >= 2) h2.push(goals[1]);

    // sensitivity proxy: count halves with big swing (abs margin >= 2 goals in EPL)
    if (margins.length) {
      const swings = margins.filter((x) => Math.abs(x) >= 2).length;
      swingCounts.push(swings);
    }
  }

  // Early tempo: based on H1 goal output
  const h1Avg = mean(h1);
  const earlyTempo: TeamProfile["earlyTempo"] =
    h1Avg >= 1.5 ? "Fast" : h1Avg >= 0.8 ? "Measured" : "Slow";

  // Post-half lift: compare H2 vs H1
  const h2Avg = mean(h2);
  const lift = h2Avg - h1Avg;
  const postHalfLift: TeamProfile["postHalfLift"] =
    lift >= 0.5 ? "Strong" : lift >= 0.2 ? "Moderate" : "Flat";

  // Late stability: std dev of H2
  const h2Std = stdev(h2);
  const lateStability: TeamProfile["lateStability"] =
    h2Std <= 0.6 ? "High" : h2Std <= 1.0 ? "Medium" : "Low";

  // Sensitivity: how often big swings occur
  const swingAvg = mean(swingCounts);
  const sensitivity: TeamProfile["sensitivity"] =
    swingAvg <= 0.4 ? "Low" : swingAvg <= 0.8 ? "Medium" : "High";

  const editorial = (() => {
    const a =
      earlyTempo === "Fast"
        ? "push early tempo"
        : earlyTempo === "Slow"
        ? "start more conservatively"
        : "open in a measured way";
    const b =
      postHalfLift === "Strong"
        ? "often lift after half-time"
        : postHalfLift === "Flat"
        ? "are typically steady through the middle"
        : "show a moderate third-quarter lift";
    const c =
      lateStability === "High"
        ? "close with control"
        : lateStability === "Low"
        ? "can swing late"
        : "are mixed late-game";
    return `${capTeamName(team)} ${a}, ${b}, and ${c}.`;
  })();

  return {
    team: capTeamName(team),
    earlyTempo,
    postHalfLift,
    lateStability,
    sensitivity,
    editorial,
  };
}

function buildMomentumWindows(
  fixtures: FixtureMatch[],
  homeTeam: string,
  awayTeam: string
): MomentumWindow[] {
  // Windows are pattern-based and conservative.
  // We weight them using observed half swing magnitudes across BOTH teams' recent games.
  const homeGames = gamesForTeam(fixtures, homeTeam).slice(-10) as any[];
  const awayGames = gamesForTeam(fixtures, awayTeam).slice(-10) as any[];

  const collectHalfSwing = (games: any[], whichHalfIdx: number) => {
    const swings: number[] = [];
    for (const m of games) {
      const hs = getHalfScores(m);
      if (hs.length < 2) continue;
      // momentum proxy = abs half margin
      const h = hs[whichHalfIdx];
      swings.push(Math.abs(h.home - h.away));
    }
    return swings;
  };

  const h1Sw = [
    ...collectHalfSwing(homeGames, 0),
    ...collectHalfSwing(awayGames, 0),
  ];
  const h2Sw = [
    ...collectHalfSwing(homeGames, 1),
    ...collectHalfSwing(awayGames, 1),
  ];

  const wH1 = clamp(mean(h1Sw) / 2.5, 0, 1);
  const wH2 = clamp(mean(h2Sw) / 2.5, 0, 1);

  const windows: MomentumWindow[] = [
    {
      id: "h1_opening",
      title: "Opening 15 minutes (H1)",
      why: "The opening shape sets quickly — early possession and territorial control often dictate first-half tempo.",
      weight01: wH1 * 0.95,
    },
    {
      id: "h1_final",
      title: "Final 10 minutes before HT",
      why: "Surges before half-time can shift momentum and reshape the second-half tactical approach.",
      weight01: wH1 * 0.85,
    },
    {
      id: "h2_opening",
      title: "Opening 15 minutes (H2)",
      why: "Post-adjustment phases are a common swing zone — tactical changes and fresh energy show here.",
      weight01: wH2 * 1.0,
    },
    {
      id: "h2_final",
      title: "Final 15 minutes (H2)",
      why: "Late-game pressure intensifies — fatigue and desperation create wider volatility windows as teams push for results.",
      weight01: wH2 * 0.95,
    },
    {
      id: "h2_stoppage",
      title: "Stoppage time (90+)",
      why: "Close-game conditions amplify sensitivity — one chance or defensive lapse can flip the result quickly.",
      weight01: wH2 * 0.75,
    },
  ];

  return windows.sort((a, b) => b.weight01 - a.weight01);
}

function buildDeepTriggers(homeTeam: string, awayTeam: string): DeepTrigger[] {
  // Keep these generic and defensible (no betting language, no certainty).
  return [
    {
      id: "trigger_1",
      if: "A goal is scored within the first 10 minutes",
      then: "The leading team typically gains territorial control, forcing the opponent to adjust their shape early.",
    },
    {
      id: "trigger_2",
      if: "The first 10 minutes of the second half see sustained pressure",
      then: "The half-time tactical adjustments become clear — momentum often shifts decisively.",
    },
    {
      id: "trigger_3",
      if: "The match is level or within one goal entering the final 15 minutes",
      then: "Late-game sensitivity increases dramatically (one chance or error can decide the result).",
    },
    {
      id: "trigger_4",
      if: `${homeTeam} concede just before half-time`,
      then: "Their opening 10 minutes of the second half becomes a critical response window.",
    },
    {
      id: "trigger_5",
      if: `${awayTeam} face sustained pressure in their defensive third`,
      then: "Counter-attacking opportunities increase, but defensive errors become more likely under fatigue.",
    },
  ];
}

function buildFlowModel(
  fixtures: FixtureMatch[],
  match: FixtureMatch,
  homeTeam: string,
  awayTeam: string
): FlowModel {
  // Prefer current match halves if available, else fall back to recent history patterns.
  const hs = getHalfScores(match as any);

  const homeMargins: number[] = [];
  const awayMargins: number[] = [];

  if (hs.length >= 2) {
    // Use THIS match's half pattern (best for live/finished games).
    for (const h of hs) {
      const m = h.home - h.away;
      homeMargins.push(m);
      awayMargins.push(-m);
    }
  } else {
    // Use recent history as proxy.
    const hg = (gamesForTeam(fixtures, homeTeam).slice(-8) as any[]) ?? [];
    const ag = (gamesForTeam(fixtures, awayTeam).slice(-8) as any[]) ?? [];

    const takeAvgMargins = (games: any[], team: string) => {
      const hM: number[][] = [];
      for (const m of games) {
        const margins = halfMarginsForTeam(m, team);
        if (margins.length >= 2) hM.push(margins.slice(0, 2));
      }
      if (!hM.length) return [0, 0];
      const out = [0, 0];
      for (let i = 0; i < 2; i++) out[i] = mean(hM.map((row) => row[i] ?? 0));
      return out;
    };

    const hm = takeAvgMargins(hg, homeTeam);
    const am = takeAvgMargins(ag, awayTeam);
    homeMargins.push(...hm);
    awayMargins.push(...am);
  }

  const phases: PhaseSignal[] = [
    computePhaseSignal("early", homeMargins, awayMargins, homeTeam, awayTeam),
    computePhaseSignal("mid", homeMargins, awayMargins, homeTeam, awayTeam),
    computePhaseSignal("late", homeMargins, awayMargins, homeTeam, awayTeam),
  ];

  const overallLine = (() => {
    const e = phases[0].label;
    const m = phases[1].label;
    const l = phases[2].label;

    // Calm + readable summary
    if (e === "Stable" && m !== "Stable" && l === "Volatile")
      return "Overall flow: controlled first half → swing zone mid-match → volatile finish.";
    if (e === "Volatile" && l === "Stable")
      return "Overall flow: fast early swings → steadies late if control holds.";
    if (m === "Swing" && l === "Swing")
      return "Overall flow: mid-to-late swing profile — control can shift in quick bursts.";
    if (e === "Stable" && m === "Stable" && l === "Stable")
      return "Overall flow: stable throughout — momentum shifts tend to be slower and more earned.";
    return "Overall flow: mixed phases — expect tempo to change across halves.";
  })();

  const homeProfile = teamProfileFrom(fixtures, homeTeam);
  const awayProfile = teamProfileFrom(fixtures, awayTeam);

  const windows = buildMomentumWindows(fixtures, homeTeam, awayTeam);
  const deepTriggers = buildDeepTriggers(homeTeam, awayTeam);

  return {
    overallLine,
    phases,
    homeProfile,
    awayProfile,
    windows,
    deepTriggers,
  };
}

/* -------------------------------------------------------------------------- */
/* UI PIECES                                                                  */
/* -------------------------------------------------------------------------- */

function Chip({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${tone}`}
    >
      {icon}
      {children}
    </span>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function PremiumBlock({
  locked,
  children,
  ctaHref = "https://www.neekostats.com.au/neeko-plus",
  ctaText = "Unlock with Neeko+",
  caption = "Premium insight",
  blurPx = 2.6,
}: {
  locked: boolean;
  children: React.ReactNode;
  ctaHref?: string;
  ctaText?: string;
  caption?: string;
  blurPx?: number;
}) {
  return (
    <div className="relative">
      {/* Content shell */}
      <div
        className={[
          "rounded-2xl border border-white/10 bg-white/5 p-4",
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
          locked ? "opacity-70 select-none pointer-events-none" : "transition-all duration-300 hover:border-amber-400/20 hover:bg-white/[0.06]",
        ].join(" ")}
        style={locked ? { filter: `blur(${blurPx}px)` } : undefined}
      >
        {children}
      </div>

      {/* Locked overlay */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-black/10 via-black/35 to-black/55" />
          <a
            href={ctaHref}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-black/75 px-3 py-1.5 text-xs text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.14)] hover:bg-black/80 transition-colors"
          >
            <Lock className="h-4 w-4" />
            <span className="font-medium">{ctaText}</span>
            <span className="ml-1 hidden sm:inline text-amber-200/70">· {caption}</span>
          </a>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function GameFlowMomentumPanel({
  mode,
  match,
  fixtures,
}: {
  mode: PremiumMode;
  match?: FixtureMatch;
  fixtures: FixtureMatch[];
}) {
  // ZERO-CRASH GUARD
  const teams = useMemo(() => getMatchTeams(match as any), [match]);
  const homeTeam = teams.home ? String(teams.home) : null;
  const awayTeam = teams.away ? String(teams.away) : null;

  if (!match || !homeTeam || !awayTeam) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/40">
        <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/10">
          <SectionHeader
            eyebrow="Match Dynamics"
            title="Game Flow & Momentum"
            subtitle="Tempo shifts, turning points, and when control tends to move"
            icon={Activity}
          />
        </header>
        <div className="px-4 sm:px-6 py-6 sm:py-8 text-sm text-white/40">
          Select a match to view game flow and momentum insights.
        </div>
      </section>
    );
  }

  const locked = mode !== "premium";

  const model = useMemo(
    () => buildFlowModel(fixtures, match, homeTeam, awayTeam),
    [fixtures, match, homeTeam, awayTeam]
  );

  const top2Windows = model.windows.slice(0, 2);
  const remainingWindows = model.windows.slice(2);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      {/* Header */}
      <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <SectionHeader
              eyebrow="Match Dynamics"
              title="Game Flow & Momentum"
              subtitle="Tempo shifts, turning points, and when control tends to move"
              icon={Activity}
            />
          </div>

          <div className="hidden sm:inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200/90">
            Neeko+
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-3">
        {/* CARD 1 — Momentum Timeline (FREE) */}
        <div
          className={[
            "rounded-2xl border border-white/10 bg-black/30 p-4",
            "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
            "transition-colors duration-300 hover:border-amber-400/15",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3 pb-2 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase">
                Momentum Timeline
              </div>
              <div className="mt-2 text-sm text-white/75">{model.overallLine}</div>
            </div>

            <Chip
              tone="border-white/10 bg-white/5 text-white/70"
              icon={<Waves className="h-4 w-4 opacity-80" />}
            >
              Flow model
            </Chip>
          </div>

          <Divider />

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {model.phases.map((p) => {
              const tone = labelTone(p.label);
              const phaseTitle =
                p.phase === "early"
                  ? "First Half (H1)"
                  : p.phase === "mid"
                  ? "Mid-match control"
                  : "Second Half (H2)";
              return (
                <div
                  key={p.phase}
                  className={[
                    "rounded-xl border border-white/10 bg-white/5 p-3",
                    "transition-colors duration-300 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-white/55">{phaseTitle}</div>
                    <Chip
                      tone={tone}
                      icon={
                        p.label === "Stable" ? (
                          <TrendingUp className="h-4 w-4 opacity-80" />
                        ) : p.label === "Volatile" ? (
                          <Activity className="h-4 w-4 opacity-80" />
                        ) : (
                          <Waves className="h-4 w-4 opacity-80" />
                        )
                      }
                    >
                      {p.label} · {fmtPct(p.volatility01)}
                    </Chip>
                  </div>

                  <div className="mt-2 text-xs text-white/60">{p.summaryLine}</div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                    <span>Chaos risk</span>
                    <span className="text-white/70">{p.chaosRisk}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARD 2 — Team Momentum Profiles (FREE) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {[model.homeProfile, model.awayProfile].map((t) => (
            <div
              key={t.team}
              className={[
                "rounded-2xl border border-white/10 bg-black/35 p-3 sm:p-4",
                "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
                "transition-all duration-300 hover:-translate-y-[1px] hover:border-amber-400/20 hover:bg-black/40",
              ].join(" ")}
            >
              <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase">
                {t.team} — Momentum Profile
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/55">Early tempo</span>
                  <span className="text-white">{t.earlyTempo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/55">Post-half lift</span>
                  <span className="text-white">{t.postHalfLift}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/55">Late stability</span>
                  <span className="text-white">{t.lateStability}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/55">Momentum sensitivity</span>
                  <span className="text-white">{t.sensitivity}</span>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/65">
                “{t.editorial}”
              </div>
            </div>
          ))}
        </div>

        {/* CARD 3 — Key Momentum Windows (FREE → PARTIAL) */}
        <div
          className={[
            "rounded-2xl border border-white/10 bg-black/30 p-4",
            "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase">
                Key Momentum Windows
              </div>
              <div className="mt-2 text-sm text-white/65">
                Where control has historically flipped faster (pattern-based — not a guarantee).
              </div>
            </div>

            {!locked && (
              <Chip
                tone="border-amber-400/25 bg-amber-400/10 text-amber-200"
                icon={<Waves className="h-4 w-4 opacity-80" />}
              >
                Neeko+ unlocked
              </Chip>
            )}
          </div>

          <Divider />

          <div className="mt-3 space-y-2">
            {top2Windows.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors duration-300 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-white">{w.title}</div>
                  <div className="text-[11px] text-white/55">
                    Strength {fmtPct(w.weight01)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">{w.why}</div>
              </div>
            ))}

            {/* Remaining windows are premium-gated as a single blurred block (no repeated locks). */}
            <PremiumBlock
              locked={locked}
              ctaHref="https://www.neekostats.com.au/neeko-plus"
              ctaText="Unlock the full momentum window map (Neeko+)"
              caption="Momentum windows"
              blurPx={2.6}
            >
              <details className="group">
                <summary className="cursor-pointer list-none text-[11px] font-semibold tracking-widest text-white/55 uppercase flex items-center justify-between">
                  Additional windows
                  <span className="text-[10px] text-white/40 group-open:hidden">▼</span>
                  <span className="text-[10px] text-white/40 hidden group-open:inline">▲</span>
                </summary>

                <div className="mt-2 space-y-2">
                  {remainingWindows.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white/80">{w.title}</div>
                        <div className="text-[11px] text-white/50">
                          Strength {fmtPct(w.weight01)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-white/55">{w.why}</div>
                    </div>
                  ))}
                </div>
              </details>
            </PremiumBlock>
          </div>
        </div>

        {/* CARD 4 — Momentum Triggers (Neeko+) (NEEKO+ ONLY) */}
        <PremiumBlock
          locked={locked}
          ctaHref="https://www.neekostats.com.au/neeko-plus"
          ctaText="Unlock momentum trigger scenarios (Neeko+)"
          caption="Trigger scenarios"
          blurPx={2.8}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">
                Momentum Triggers (Neeko+)
              </div>
              <div className="mt-1 text-sm text-white/65">
                “If/then” conditions that commonly open a swing window.
              </div>
            </div>

            <Chip
              tone="border-white/10 bg-white/5 text-white/70"
              icon={<Activity className="h-4 w-4 opacity-80" />}
            >
              Scenarios
            </Chip>
          </div>

          <div className="mt-3 space-y-1.5">
            {model.deepTriggers.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"
              >
                <div className="text-sm text-white/80">
                  <span className="text-white/60">IF </span>
                  {t.if}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  <span className="text-white/60">THEN </span>
                  {t.then}
                </div>
              </div>
            ))}
          </div>
        </PremiumBlock>

        {/* Footer micro-note */}
        <div className="text-[11px] text-white/40">
          Note: Game flow signals are pattern-based from historical half structures. They describe tendencies — not guarantees.
        </div>
      </div>
    </section>
  );
}
