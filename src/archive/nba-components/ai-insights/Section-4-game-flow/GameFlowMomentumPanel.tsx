import React, { useMemo } from "react";
import { Lock, TrendingUp, Activity, Waves } from "lucide-react";

import type { FixtureMatch } from "@/components/nba/match-center/types";
import type { PremiumMode } from "@/components/nba/ai-insights/data/types";
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
/* QUARTER + EVENT ACCESSORS (robust to mock/real shapes)                     */
/* -------------------------------------------------------------------------- */

type QuarterScore = { home: number; away: number };

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
    safeNum(m?.points?.home); // fallback
  const away =
    safeNum(m?.awayScore) ??
    safeNum(m?.scores?.away) ??
    safeNum(m?.score?.away) ??
    safeNum(m?.points?.away);
  return { home, away };
}

/**
 * Attempts to read quarters from a variety of shapes:
 * - m.quarters: [{ home: 21, away: 14 }, ...]
 * - m.quarters: [{ homeScore: 21, awayScore: 14 }, ...]
 * - m.scores.quarters: same idea
 * - m.periods: same idea
 */
function getQuarterScores(m: any): QuarterScore[] {
  const raw = m?.quarters ?? m?.scores?.quarters ?? m?.periods ?? m?.stats?.quarters ?? null;

  if (!Array.isArray(raw) || !raw.length) return [];

  const out: QuarterScore[] = [];
  for (const q of raw) {
    const h =
      safeNum(q?.home) ??
      safeNum(q?.homeScore) ??
      safeNum(q?.home_points) ??
      safeNum(q?.points_home) ??
      null;
    const a =
      safeNum(q?.away) ??
      safeNum(q?.awayScore) ??
      safeNum(q?.away_points) ??
      safeNum(q?.points_away) ??
      null;
    if (h == null || a == null) continue;
    out.push({ home: h, away: a });
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

function quarterPointsForTeam(m: any, team: string): number[] {
  const { home, away } = getMatchTeams(m);
  const qs = getQuarterScores(m);
  if (!qs.length) return [];
  if (home === team) return qs.map((q) => q.home);
  if (away === team) return qs.map((q) => q.away);
  return [];
}

function quarterMarginsForTeam(m: any, team: string): number[] {
  const { home, away } = getMatchTeams(m);
  const qs = getQuarterScores(m);
  if (!qs.length) return [];
  if (home === team) return qs.map((q) => q.home - q.away);
  if (away === team) return qs.map((q) => q.away - q.home);
  return [];
}

function phaseSlice(quarterVals: number[], phase: Phase) {
  if (!quarterVals.length) return [];

  if (phase === "early") {
    // Q1 only
    return quarterVals.slice(0, 1);
  }

  if (phase === "mid") {
    // Q2 + Q3
    return quarterVals.slice(1, 3);
  }

  // Late game: Q4 gets a natural volatility lift
  const q4 = quarterVals.slice(3, 4);
  return q4.length ? q4.map((v) => v * 1.15) : [];
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
    phase === "early" ? "Early game" : phase === "mid" ? "Mid game" : "Late game";

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
  const q1: number[] = [];
  const q3: number[] = [];
  const q4: number[] = [];
  const swingCounts: number[] = [];

  for (const m of games as any[]) {
    const pts = quarterPointsForTeam(m, team);
    const margins = quarterMarginsForTeam(m, team);

    if (pts.length >= 1) q1.push(pts[0]);
    if (pts.length >= 3) q3.push(pts[2]);
    if (pts.length >= 4) q4.push(pts[3]);

    // sensitivity proxy: count quarters with big swing (abs margin > 18)
    if (margins.length) {
      const swings = margins.filter((x) => Math.abs(x) >= 18).length;
      swingCounts.push(swings);
    }
  }

  // Early tempo: based on Q1 points distribution
  const q1Avg = mean(q1);
  const earlyTempo: TeamProfile["earlyTempo"] =
    q1Avg >= 26 ? "Fast" : q1Avg >= 20 ? "Measured" : "Slow";

  // Post-half lift: compare Q3 vs Q1
  const q3Avg = mean(q3);
  const lift = q3Avg - q1Avg;
  const postHalfLift: TeamProfile["postHalfLift"] =
    lift >= 4 ? "Strong" : lift >= 1 ? "Moderate" : "Flat";

  // Late stability: std dev of Q4
  const q4Std = stdev(q4);
  const lateStability: TeamProfile["lateStability"] =
    q4Std <= 5.5 ? "High" : q4Std <= 8.5 ? "Medium" : "Low";

  // Sensitivity: how often big swings occur
  const swingAvg = mean(swingCounts);
  const sensitivity: TeamProfile["sensitivity"] =
    swingAvg <= 0.6 ? "Low" : swingAvg <= 1.2 ? "Medium" : "High";

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
  // We weight them using observed quarter swing magnitudes across BOTH teams’ recent games.
  const homeGames = gamesForTeam(fixtures, homeTeam).slice(-10) as any[];
  const awayGames = gamesForTeam(fixtures, awayTeam).slice(-10) as any[];

  const collectQuarterSwing = (games: any[], whichQuarterIdx: number) => {
    const swings: number[] = [];
    for (const m of games) {
      const qs = getQuarterScores(m);
      if (qs.length < 4) continue;
      // total points in quarter = home+away; momentum proxy = abs quarter margin
      const q = qs[whichQuarterIdx];
      swings.push(Math.abs(q.home - q.away));
    }
    return swings;
  };

  const q1Sw = [
    ...collectQuarterSwing(homeGames, 0),
    ...collectQuarterSwing(awayGames, 0),
  ];
  const q2Sw = [
    ...collectQuarterSwing(homeGames, 1),
    ...collectQuarterSwing(awayGames, 1),
  ];
  const q3Sw = [
    ...collectQuarterSwing(homeGames, 2),
    ...collectQuarterSwing(awayGames, 2),
  ];
  const q4Sw = [
    ...collectQuarterSwing(homeGames, 3),
    ...collectQuarterSwing(awayGames, 3),
  ];

  const wQ1 = clamp(mean(q1Sw) / 22, 0, 1);
  const wQ2 = clamp(mean(q2Sw) / 22, 0, 1);
  const wQ3 = clamp(mean(q3Sw) / 22, 0, 1);
  const wQ4 = clamp(mean(q4Sw) / 22, 0, 1);

  const windows: MomentumWindow[] = [
    {
      id: "q1_start",
      title: "First 10 minutes (Q1)",
      why: "Opening tempo and early pace control often set the rhythm and defensive intensity.",
      weight01: wQ1 * 0.9,
    },
    {
      id: "q2_late",
      title: "Final 5 minutes (Q2)",
      why: "Surges before half-time can compress or stretch margins and reshape the second-half script.",
      weight01: wQ2 * 0.75,
    },
    {
      id: "q3_open",
      title: "Opening 10 minutes (Q3)",
      why: "Post-halftime adjustments are a common swing zone — rotations and defensive changes show impact.",
      weight01: wQ3 * 1.0,
    },
    {
      id: "q4_mid",
      title: "Mid Q4 (6–10 minutes)",
      why: "Fatigue and foul trouble widen volatility windows — scoring runs can snowball faster.",
      weight01: wQ4 * 0.9,
    },
    {
      id: "q4_last6",
      title: "Final 6 minutes (Q4)",
      why: "Close-game conditions amplify sensitivity — one clean run can flip momentum quickly.",
      weight01: wQ4 * 0.85,
    },
  ];

  return windows.sort((a, b) => b.weight01 - a.weight01);
}

function buildDeepTriggers(homeTeam: string, awayTeam: string): DeepTrigger[] {
  // Keep these generic and defensible (no betting language, no certainty).
  return [
    {
      id: "trigger_1",
      if: "Two quick buckets land within ~90 seconds",
      then: "A momentum window typically opens for the next 4–6 minutes (pace lifts, defensive pressure increases).",
    },
    {
      id: "trigger_2",
      if: "The first 5 minutes of Q3 show one-sided scoring",
      then: "The mid-game lean often hardens (teams commit to defensive schemes and rotations).",
    },
    {
      id: "trigger_3",
      if: "The margin is under 8 points entering Q4",
      then: "Late-game volatility increases (scoring runs and defensive stops can flip control quickly).",
    },
    {
      id: "trigger_4",
      if: `${homeTeam} concede a late Q2 run`,
      then: "Their first 6 minutes after half-time becomes a key response window.",
    },
    {
      id: "trigger_5",
      if: `${awayTeam} are forced into repeat defensive entries`,
      then: "Chain breaks and rebound bursts become more likely (momentum flips faster).",
    },
  ];
}

function buildFlowModel(
  fixtures: FixtureMatch[],
  match: FixtureMatch,
  homeTeam: string,
  awayTeam: string
): FlowModel {
  // Prefer current match quarters if available, else fall back to recent history patterns.
  const qs = getQuarterScores(match as any);

  const homeMargins: number[] = [];
  const awayMargins: number[] = [];

  if (qs.length >= 4) {
    // Use THIS match’s quarter pattern (best for live/finished games).
    for (const q of qs) {
      const m = q.home - q.away;
      homeMargins.push(m);
      awayMargins.push(-m);
    }
  } else {
    // Use recent history as proxy.
    const hg = (gamesForTeam(fixtures, homeTeam).slice(-8) as any[]) ?? [];
    const ag = (gamesForTeam(fixtures, awayTeam).slice(-8) as any[]) ?? [];

    const takeAvgMargins = (games: any[], team: string) => {
      const qM: number[][] = [];
      for (const m of games) {
        const margins = quarterMarginsForTeam(m, team);
        if (margins.length >= 4) qM.push(margins.slice(0, 4));
      }
      if (!qM.length) return [0, 0, 0, 0];
      const out = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) out[i] = mean(qM.map((row) => row[i] ?? 0));
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
      return "Overall flow: controlled early → swing zone mid-game → volatile finish.";
    if (e === "Volatile" && l === "Stable")
      return "Overall flow: fast early swings → steadies late if control holds.";
    if (m === "Swing" && l === "Swing")
      return "Overall flow: mid-to-late swing profile — control can move in short runs.";
    if (e === "Stable" && m === "Stable" && l === "Stable")
      return "Overall flow: stable phases — momentum shifts tend to be slower and more earned.";
    return "Overall flow: mixed phases — expect tempo to change across quarters.";
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
                  ? "Early game (Q1)"
                  : p.phase === "mid"
                  ? "Mid game (Q2–Q3)"
                  : "Late game (Q4)";
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
          Note: Game flow signals are pattern-based from available quarter structure. They describe tendencies — not guarantees.
        </div>
      </div>
    </section>
  );
}
