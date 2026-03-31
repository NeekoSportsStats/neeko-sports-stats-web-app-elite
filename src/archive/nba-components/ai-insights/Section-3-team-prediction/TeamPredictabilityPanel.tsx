import React, { useMemo } from "react";
import { Lock } from "lucide-react";

import type { FixtureMatch } from "@/components/nba/match-center/types";
import type { PremiumMode } from "@/components/nba/ai-insights/data/types";
import type { StatLens } from "@/components/nba/ai-insights/data/utils";
import { mean } from "@/components/nba/ai-insights/data/utils";
import { roundOrder } from "@/components/nba/ai-insights/data/engine";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function stdev(vals: number[]) {
  if (!vals.length) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v =
    vals.reduce((acc, x) => acc + (x - m) * (x - m), 0) /
    Math.max(1, vals.length - 1);
  return Math.sqrt(v);
}

function quantile(sortedAsc: number[], q: number) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sortedAsc[base] ?? sortedAsc[0];
  const b = sortedAsc[base + 1] ?? a;
  return a + rest * (b - a);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function trendArrow(last5: number[], prev5: number[]) {
  if (last5.length < 3 || prev5.length < 3)
    return { arrow: "→" as const, strength01: 0.35 };
  const m1 = mean(prev5);
  const m2 = mean(last5);
  const d = m2 - m1;

  // normalize trend strength by typical scale
  const denom = Math.max(1, Math.abs(m1) * 0.12);
  const strength01 = clamp(Math.abs(d) / denom, 0, 1);

  if (d >= denom) return { arrow: "↑" as const, strength01 };
  if (d <= -denom) return { arrow: "↓" as const, strength01 };
  return { arrow: "→" as const, strength01: clamp(strength01 * 0.5, 0, 0.6) };
}

function labelStability(cv: number) {
  if (cv <= 0.11) return "High";
  if (cv <= 0.16) return "Medium";
  return "Low";
}

function labelVolatility(cv: number) {
  if (cv <= 0.11) return "Low";
  if (cv <= 0.18) return "Low–Moderate";
  if (cv <= 0.26) return "Elevated";
  return "High";
}

function labelTempoControl(marginStd: number, avgAbsMargin: number) {
  if (marginStd <= 12 && avgAbsMargin >= 10) return "Strong";
  if (marginStd <= 18) return "Moderate";
  return "Inconsistent";
}

function labelDefensiveRisk(concededCv: number, oppCeilingBias: number) {
  const score = concededCv * 0.7 + oppCeilingBias * 0.3;
  if (score <= 0.14) return "Low";
  if (score <= 0.2) return "Low–Moderate";
  if (score <= 0.26) return "Moderate";
  return "Moderate–High";
}

function meterLabel(pct01: number) {
  if (pct01 <= 0.22) return "Low";
  if (pct01 <= 0.45) return "Steady";
  if (pct01 <= 0.68) return "Elevated";
  return "Chaos";
}

function statContext(stat: StatLens) {
  if (stat === "points") return "scoring output";
  if (stat === "rebounds") return "rebounding";
  if (stat === "assists") return "playmaking";
  if (stat === "threes") return "three-point shooting";
  return "fantasy output";
}

/**
 * IMPORTANT:
 * Your fixture scores are TEAM POINTS.
 * To make the lens meaningfully change the AI block, we apply a deterministic
 * lens mapping (proxy). This makes the numbers move when stat changes.
 */
function lensValueFromTeamScore(teamPoints: number, stat: StatLens) {
  if (stat === "points") {
    return teamPoints; // direct mapping
  }
  if (stat === "rebounds") {
    return teamPoints * 0.4; // ~40-50 rebounds per game
  }
  if (stat === "assists") {
    return teamPoints * 0.22; // ~22-28 assists per game
  }
  if (stat === "threes") {
    return teamPoints * 0.12; // ~12-15 threes per game
  }
  return teamPoints * 0.8; // fantasy proxy
}

function clampForLens(n: number, stat: StatLens) {
  if (stat === "points") return clamp(n, 90, 135);
  if (stat === "rebounds") return clamp(n, 38, 55);
  if (stat === "assists") return clamp(n, 20, 32);
  if (stat === "threes") return clamp(n, 8, 18);
  return clamp(n, 70, 130); // fantasy
}

function minSpreadForLens(stat: StatLens) {
  if (stat === "points") return 8;
  if (stat === "rebounds") return 4;
  if (stat === "assists") return 3;
  if (stat === "threes") return 2;
  return 6; // fantasy
}

/** -------------------------------------------------------------------------
 * UI RENDER HELPERS (Surgical UX fixes only)
 * - keyword emphasis for IF/THEN lines
 * - CV tooltip for Deep AI Read lines
 * -------------------------------------------------------------------------- */

const EMPHASIS_WORDS = [
  "rotations",
  "transition",
  "pace",
  "shooting",
  "defense",
  "rebounding",
  "turnovers",
] as const;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithEmphasis(text: string) {
  // Wrap important keywords with <strong> for scanability (esp. mobile)
  const pattern = new RegExp(
    `(${EMPHASIS_WORDS.map(escapeRegExp).join("|")})`,
    "ig"
  );
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((p, i) => {
        const isEmph = EMPHASIS_WORDS.some(
          (w) => p.toLowerCase() === w.toLowerCase()
        );
        return isEmph ? (
          <strong key={i} className="text-white font-semibold">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function renderDeepLine(line: string) {
  // Add a tooltip for CV without changing the content string generation.
  // Example line: "Last 5 avg: 91 · CV 0.00"
  const m = line.match(/^(.*?\bCV)\s+([0-9]+(?:\.[0-9]+)?)\b(.*)$/i);
  if (!m) return <>{line}</>;

  const before = m[1]; // includes "CV"
  const cvVal = m[2];
  const after = m[3] ?? "";

  return (
    <>
      {before.replace(/\bCV$/i, "").trim()}
      {before.toLowerCase().includes("cv") && (
        <>
          {before.trim().endsWith("CV") ? " " : ""}
          <span
            title="CV = Coefficient of Variation (consistency: stdev ÷ mean). Lower CV = more predictable."
            className="underline decoration-dotted underline-offset-2 text-white/80"
          >
            CV
          </span>{" "}
          <span className="text-white/85">{cvVal}</span>
          {after}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type TeamOutlook = {
  team: string;

  // core labels
  stability: string;
  volatility: string;
  tempoControl: string;
  defensiveRisk: string;

  // numbers
  expectedLow: number;
  expectedHigh: number;

  // dynamics
  trend: "↑" | "→" | "↓";
  trendConf01: number;

  // “AI”
  confidencePct: number;
  read: string;

  // deeper blocks (blur in free)
  deepRead: string[];
  ifThen: string[];
  breaksModel: string[];
};

type MatchMeta = {
  volatility01: number;
  label: string;
  aiLean: "home" | "away" | "even";
  aiLeanText: string;
  ifThen: string[];
};

/* -------------------------------------------------------------------------- */
/* DATA BUILDERS                                                              */
/* -------------------------------------------------------------------------- */

function gamesForTeam(fixtures: FixtureMatch[], team: string) {
  return fixtures
    .filter((m: any) => m?.homeTeam === team || m?.awayTeam === team)
    .filter(
      (m: any) =>
        safeNum(m?.homeScore) != null && safeNum(m?.awayScore) != null
    )
    .sort(
      (a: any, b: any) => roundOrder(a.roundLabel) - roundOrder(b.roundLabel)
    );
}

function scoreForTeam(m: any, team: string) {
  if (m?.homeTeam === team) return safeNum(m?.homeScore);
  if (m?.awayTeam === team) return safeNum(m?.awayScore);
  return null;
}

function concededForTeam(m: any, team: string) {
  if (m?.homeTeam === team) return safeNum(m?.awayScore);
  if (m?.awayTeam === team) return safeNum(m?.homeScore);
  return null;
}

function marginForTeam(m: any, team: string) {
  const hs = safeNum(m?.homeScore);
  const as = safeNum(m?.awayScore);
  if (hs == null || as == null) return null;

  if (m?.homeTeam === team) return hs - as;
  if (m?.awayTeam === team) return as - hs;
  return null;
}

function lastNH2H(fixtures: FixtureMatch[], a: string, b: string, n = 5) {
  return fixtures
    .filter((m: any) => {
      const t1 = m?.homeTeam;
      const t2 = m?.awayTeam;
      return (t1 === a && t2 === b) || (t1 === b && t2 === a);
    })
    .filter(
      (m: any) =>
        safeNum(m?.homeScore) != null && safeNum(m?.awayScore) != null
    )
    .sort(
      (x: any, y: any) => roundOrder(x.roundLabel) - roundOrder(y.roundLabel)
    )
    .slice(-n);
}

function computeExpectedRange(vals: number[], stat: StatLens) {
  const s = [...vals].filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) {
    // fallback
    const base =
      stat === "points" ? 110 :
      stat === "rebounds" ? 45 :
      stat === "assists" ? 25 :
      stat === "threes" ? 12 : 90;
    return {
      low: base - minSpreadForLens(stat),
      high: base + minSpreadForLens(stat),
    };
  }

  const q25 = quantile(s, 0.25);
  const q75 = quantile(s, 0.75);

  // enforce non-collapsing band
  const minSpread = minSpreadForLens(stat);
  let low = clampForLens(q25, stat);
  let high = clampForLens(q75, stat);
  if (high < low + minSpread) high = clampForLens(low + minSpread, stat);

  // round nicely per lens
  return { low: Math.round(low), high: Math.round(high) };
}

function buildTeamOutlook(
  team: string,
  opponent: string,
  fixtures: FixtureMatch[],
  stat: StatLens
): TeamOutlook {
  const games = gamesForTeam(fixtures, team);
  const last10 = games.slice(-10);
  const last5 = games.slice(-5);
  const prev5 = last10.slice(0, Math.max(0, last10.length - last5.length));

  const rawScores = games
    .map((m) => scoreForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number");

  const rawLast5Scores = last5
    .map((m) => scoreForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number");

  const rawPrev5Scores = prev5
    .map((m) => scoreForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number");

  const rawConceded = games
    .map((m) => concededForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number");

  // lens-adjusted values
  const scores = rawScores.map((p) => lensValueFromTeamScore(p, stat));
  const last5Scores = rawLast5Scores.map((p) => lensValueFromTeamScore(p, stat));
  const prev5Scores = rawPrev5Scores.map((p) => lensValueFromTeamScore(p, stat));

  const baseVals = last5Scores.length ? last5Scores : scores;
  const avg = baseVals.length ? mean(baseVals) : 0;
  const sd = stdev(baseVals);
  const cv = avg > 0 ? sd / avg : 0.25;

  const stability = labelStability(cv);
  const volatility = labelVolatility(cv);

  // opponent interaction: do they force your conceded volatility?
  const concededCv = rawConceded.length
    ? stdev(rawConceded) / Math.max(1, mean(rawConceded))
    : 0.18;

  // H2H influence (lens uses your score in H2H)
  const h2h = lastNH2H(fixtures, team, opponent, 5);
  const h2hScores = h2h
    .map((m: any) => scoreForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number")
    .map((p) => lensValueFromTeamScore(p, stat));

  const oppH2HScores = h2h
    .map((m: any) => scoreForTeam(m, opponent))
    .filter((x: any): x is number => typeof x === "number")
    .map((p) => lensValueFromTeamScore(p, stat));

  const oppCeilingBias =
    oppH2HScores.length && rawConceded.length
      ? clamp(
          (quantile([...oppH2HScores].sort((a, b) => a - b), 0.75) -
            lensValueFromTeamScore(mean(rawConceded), stat)) /
            Math.max(1, stat === "points" ? 15 : stat === "rebounds" ? 5 : stat === "assists" ? 4 : stat === "threes" ? 3 : 50),
          0,
          0.35
        )
      : 0.12;

  const marginsLast5Abs = last5
    .map((m: any) => marginForTeam(m, team))
    .filter((x: any): x is number => typeof x === "number")
    .map((m) => Math.abs(m));

  const marginStd = stdev(marginsLast5Abs);
  const avgAbsMargin = marginsLast5Abs.length ? mean(marginsLast5Abs) : 8;

  const tempoControl = labelTempoControl(marginStd, avgAbsMargin);
  const defensiveRisk = labelDefensiveRisk(concededCv, oppCeilingBias);

  const { arrow: trend, strength01: trendConf01 } = trendArrow(last5Scores, prev5Scores);

  // expected range: blend season + last5 + h2h
  const seasonRange = computeExpectedRange(scores, stat);
  const last5Range = computeExpectedRange(last5Scores, stat);
  const h2hRange = computeExpectedRange(h2hScores.length ? h2hScores : scores, stat);

  const wSeason = 0.5;
  const wLast5 = 0.3;
  const wH2H = 0.2;

  let expectedLow =
    seasonRange.low * wSeason + last5Range.low * wLast5 + h2hRange.low * wH2H;
  let expectedHigh =
    seasonRange.high * wSeason + last5Range.high * wLast5 + h2hRange.high * wH2H;

  expectedLow = clampForLens(expectedLow, stat);
  expectedHigh = clampForLens(expectedHigh, stat);

  const minSpread = minSpreadForLens(stat);
  if (expectedHigh < expectedLow + minSpread)
    expectedHigh = clampForLens(expectedLow + minSpread, stat);

  // confidence score (0..100)
  const sample = clamp(scores.length / 10, 0, 1);
  const h2hBoost = clamp(h2hScores.length / 5, 0, 1) * 0.15;
  const stabilityBoost =
    stability === "High" ? 0.18 : stability === "Medium" ? 0.08 : 0.0;
  const trendBoost = clamp(trendConf01, 0, 1) * 0.12;
  const defensivePenalty = defensiveRisk.includes("High")
    ? 0.12
    : defensiveRisk.includes("Moderate")
    ? 0.06
    : 0.0;

  const conf01 = clamp(
    0.38 + sample * 0.25 + stabilityBoost + trendBoost + h2hBoost - defensivePenalty,
    0.25,
    0.92
  );
  const confidencePct = Math.round(conf01 * 100);

  // lens narrative
  const ctx = statContext(stat);
  const lensLine =
    stat === "points"
      ? "Points lens emphasizes scoring efficiency and shot variance — bands reflect offensive rhythm."
      : stat === "rebounds"
      ? "Rebounds lens tracks possession control and second-chance opportunities — consistency signals defensive commitment."
      : stat === "assists"
      ? "Assists lens reflects ball movement and offensive flow — variance often comes from defensive pressure."
      : stat === "threes"
      ? "Three-point lens emphasizes shooting variance — hot/cold streaks create wide outcome bands."
      : "Fantasy lens mixes role + matchup — volatility often comes from rotations and usage fluctuations.";

  const read = (() => {
    const parts: string[] = [];
    parts.push(`${team} show a ${stability.toLowerCase()} ${ctx} profile`);
    parts.push(`with ${volatility.toLowerCase()} variance`);
    parts.push(`vs ${opponent}.`);
    if (trend !== "→")
      parts.push(`Trend is ${trend === "↑" ? "up" : "down"} over the last 5.`);
    if (tempoControl === "Strong") parts.push("Tempo control signal is strong.");
    if (defensiveRisk.includes("High"))
      parts.push("Defensive exposure widens the ceiling tail.");
    return parts.join(" ");
  })();

  // deeper blocks
  const deepRead: string[] = [
    `Lens: ${stat.toUpperCase()} · Confidence ${confidencePct}% · Trend ${trend}`,
    `Last 5 avg: ${Math.round(mean(last5Scores.length ? last5Scores : scores))} · CV ${cv.toFixed(2)}`,
    `Opponent interaction: conceded volatility ${labelVolatility(concededCv)} · ceiling bias ${Math.round(
      oppCeilingBias * 100
    )}%`,
    lensLine,
  ];

  const ifThen: string[] = (() => {
    const chaosWord =
      volatility.includes("High") || volatility.includes("Elevated")
        ? "chaos rises"
        : "bands stay tighter";
    const tempoWord =
      tempoControl === "Strong"
        ? "tempo compresses"
        : tempoControl === "Inconsistent"
        ? "tempo swings"
        : "tempo drifts";

    if (stat === "points") {
      return [
        `IF early shooting heats up (first-quarter run), THEN the ceiling widens quickly (${chaosWord}).`,
        `IF defensive pressure tightens and shot quality drops, THEN floors rise and volatility compresses (${tempoWord}).`,
        `IF one team controls pace, THEN late scoring swings become more predictable.`,
      ];
    }

    if (stat === "rebounds") {
      return [
        `IF offensive rebounds spike early, THEN possession bands widen and scoring variance increases.`,
        `IF defensive rebounding stays consistent, THEN the profile stabilizes (${tempoWord}).`,
        `IF one team dominates the glass, THEN second-chance points amplify the lean.`,
      ];
    }

    if (stat === "assists") {
      return [
        `IF ball movement stays fluid, THEN assist bands tighten and team shooting improves.`,
        `IF defensive pressure forces isolation, THEN assist totals drop and variance increases (${chaosWord}).`,
        `IF one team controls transition, THEN easy buckets lift the ceiling.`,
      ];
    }

    if (stat === "threes") {
      return [
        `IF hot shooting starts early, THEN ceiling outcomes widen dramatically (${chaosWord}).`,
        `IF defensive closeouts tighten, THEN three-point attempts drop and variance compresses.`,
        `IF one team finds rhythm from deep, THEN the scoring lean hardens quickly.`,
      ];
    }

    return [
      `IF rotations stay stable, THEN fantasy bands tighten and confidence rises.`,
      `IF the game opens up in transition, THEN ceiling outcomes widen (${chaosWord}).`,
      `IF one team controls pace and possessions, THEN tempo shifts and the lean hardens.`,
    ];
  })();

  const breaksModel: string[] = (() => {
    const out: string[] = [];
    if (scores.length < 6) out.push("Low sample size: model confidence is limited.");
    if (last5Scores.length < 3) out.push("Limited recent form: last-5 trend signal is weak.");
    if (defensiveRisk.includes("High"))
      out.push("High defensive exposure: late-game volatility can exceed the band.");
    if (!h2hScores.length)
      out.push("No H2H sample: matchup weight shifts to season profile.");
    if (stat === "threes")
      out.push("Three-point shooting is variance-sensitive: hot/cold stretches can break the band.");
    return out;
  })();

  return {
    team,
    stability,
    volatility,
    expectedLow: Math.round(expectedLow),
    expectedHigh: Math.round(expectedHigh),
    tempoControl,
    defensiveRisk,
    trend,
    trendConf01,
    confidencePct,
    read,
    deepRead,
    ifThen,
    breaksModel,
  };
}

function buildMatchMeta(home: TeamOutlook, away: TeamOutlook, stat: StatLens): MatchMeta {
  // volatility meter combines both vol + defensive risk
  const volScore = (o: TeamOutlook) => {
    const v =
      o.volatility === "Low"
        ? 0.15
        : o.volatility === "Low–Moderate"
        ? 0.35
        : o.volatility === "Elevated"
        ? 0.62
        : 0.78;

    const d =
      o.defensiveRisk === "Low"
        ? 0.08
        : o.defensiveRisk === "Low–Moderate"
        ? 0.16
        : o.defensiveRisk === "Moderate"
        ? 0.26
        : 0.36;

    const t =
      o.tempoControl === "Strong"
        ? -0.08
        : o.tempoControl === "Moderate"
        ? 0.0
        : 0.10;

    return clamp(v + d + t, 0, 1);
  };

  const volatility01 = clamp((volScore(home) + volScore(away)) / 2, 0, 1);
  const label = `${meterLabel(volatility01)} (${Math.round(volatility01 * 100)}%)`;

  // AI Lean: compare confidence-adjusted expected highs/lows
  const homeEdge =
    (home.expectedHigh - home.expectedLow) * 0.15 +
    (home.confidencePct - away.confidencePct) * 0.08 +
    (home.trend === "↑" ? 6 : home.trend === "↓" ? -6 : 0);

  const awayEdge =
    (away.expectedHigh - away.expectedLow) * 0.15 +
    (away.confidencePct - home.confidencePct) * 0.08 +
    (away.trend === "↑" ? 6 : away.trend === "↓" ? -6 : 0);

  let aiLean: MatchMeta["aiLean"] = "even";
  if (homeEdge - awayEdge >= 6) aiLean = "home";
  else if (awayEdge - homeEdge >= 6) aiLean = "away";

  const aiLeanText =
    aiLean === "even"
      ? "Even — matchup edges are balanced."
      : aiLean === "home"
      ? `${home.team} — cleaner profile + better signals.`
      : `${away.team} — cleaner profile + better signals.`;

  const ifThen =
    stat === "points"
      ? [
          "IF early shooting heats up, THEN scoring volatility accelerates.",
          "IF defensive pressure tightens, THEN floors rise and variance compresses.",
        ]
      : stat === "rebounds"
      ? [
          "IF rebounding battles tilt one way, THEN possession lean sharpens.",
          "IF offensive boards spike, THEN second-chance points widen the band.",
        ]
      : stat === "assists"
      ? [
          "IF ball movement stays crisp, THEN assist totals stabilize.",
          "IF defensive pressure forces isolation, THEN assist bands widen.",
        ]
      : stat === "threes"
      ? [
          "IF shooting rhythm clicks early, THEN ceiling outcomes explode.",
          "IF defensive closeouts tighten, THEN three-point volume drops.",
        ]
      : [
          "IF rotations hold, THEN reliability improves across both teams.",
          "IF transition opens up, THEN ceiling outcomes widen.",
        ];

  return { volatility01, label, aiLean, aiLeanText, ifThen };
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function TeamPredictabilityPanel({
  mode,
  match,
  fixtures,
  showHeader = true,
}: {
  mode: PremiumMode;
  match?: FixtureMatch;
  fixtures: FixtureMatch[];
  showHeader?: boolean;
}) {
  const [stat, setStat] = React.useState<StatLens>("fantasy");
  // ✅ ZERO-CRASH GUARD
  if (!match || !(match as any)?.homeTeam || !(match as any)?.awayTeam) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/40">
        {showHeader && (
          <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/10">
            <h2 className="text-base sm:text-lg font-semibold">2. Team Score Predictability</h2>
            <p className="text-xs sm:text-sm text-white/60">
              Stat-driven AI · opponent interaction · game script + volatility
            </p>
          </header>
        )}
        <div className="px-4 sm:px-6 py-6 sm:py-8 text-sm text-white/40">
          Select a match to view team predictability insights.
        </div>
      </section>
    );
  }

  const locked = mode !== "premium";

  const home = (match as any).homeTeam as string;
  const away = (match as any).awayTeam as string;

  const homeOutlook = useMemo(
    () => buildTeamOutlook(home, away, fixtures, stat),
    [home, away, fixtures, stat]
  );
  const awayOutlook = useMemo(
    () => buildTeamOutlook(away, home, fixtures, stat),
    [away, home, fixtures, stat]
  );

  const meta = useMemo(
    () => buildMatchMeta(homeOutlook, awayOutlook, stat),
    [homeOutlook, awayOutlook, stat]
  );

  const leanChip = (which: "home" | "away" | "even") => {
    if (which === "even") {
      return (
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
          AI Lean: Even
        </span>
      );
    }
    const team = which === "home" ? homeOutlook.team : awayOutlook.team;
    return (
      <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-[11px] text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]">
        AI Lean: {team}
      </span>
    );
  };

  const trendPill = (o: TeamOutlook) => {
    const conf = Math.round(clamp(o.trendConf01, 0, 1) * 100);
    const tone =
      o.trend === "↑"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
        : o.trend === "↓"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/5 text-white/60";

    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] ${tone} transition-transform duration-200 hover:-translate-y-[1px]`}
      >
        <span className="font-semibold">{o.trend}</span>
        <span className="opacity-80">Trend</span>
        <span className="opacity-70">{conf}%</span>
      </span>
    );
  };

  /**
   * PATCH:
   * - Keep blur behavior
   * - Remove repeated overlay CTA (was causing mobile fatigue)
   */
  const premiumBlock = (children: React.ReactNode) => (
    <div className="relative group">
      <div
        className={
          locked
            ? [
                "rounded-2xl border border-white/10 bg-white/5 p-4",
                "blur-[2.5px] select-none",
                "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
              ].join(" ")
            : [
                "rounded-2xl border border-white/10 bg-white/5 p-4",
                "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
                "transition-all duration-300",
                "hover:border-amber-400/20 hover:bg-white/[0.06]",
              ].join(" ")
        }
      >
        {children}
      </div>
      {/* 🔥 Intentionally no overlay CTA here anymore (single CTA per team card below) */}
    </div>
  );

  const upgradeHref = "https://www.neekostats.com.au/neeko-plus";

  const teamCTA = () =>
    locked ? (
      <div className="mt-4">
        <a
          href={upgradeHref}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "w-full inline-flex items-center justify-center gap-2",
            "rounded-full border border-amber-400/40 bg-black/70",
            "px-4 py-2 text-xs text-amber-200",
            "shadow-[0_0_0_1px_rgba(251,191,36,0.12)]",
            "transition-transform duration-200 hover:-translate-y-[1px]",
          ].join(" ")}
        >
          <Lock className="h-4 w-4" />
          Unlock Team AI (Neeko+)
          <span className="hidden sm:inline text-[11px] text-amber-300/80">
            · Includes Deep AI Read + Game Script Scenarios
          </span>
        </a>
        <div className="mt-2 text-center text-[11px] text-white/40">
          Unlock gives full Deep AI Read, IF/THEN scripts, and model limits for this matchup.
        </div>
      </div>
    ) : null;

  const card = (o: TeamOutlook, opponentName: string) => {
    const ctx = statContext(stat);

    return (
      <div
        className={[
          "group rounded-2xl border border-white/10 bg-black/35",
          "p-4 sm:p-5",
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
          "transition-all duration-300",
          "hover:-translate-y-[1px] hover:border-amber-400/20 hover:bg-black/40",
        ].join(" ")}
      >
        {/* subtle gold rim */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase truncate">
              {o.team} — Team AI Outlook
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {trendPill(o)}
              <span className="text-[11px] text-white/50">
                AI confidence{" "}
                <span className="text-white font-semibold">{o.confidencePct}%</span>
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] sm:text-[11px] text-white/40">Expected range</div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              {o.expectedLow}–{o.expectedHigh}
            </div>
          </div>
        </div>

        {/* stats grid */}
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white/55">Stability</span>
            <span className="text-white">{o.stability}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Volatility</span>
            <span className="text-white">{o.volatility}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Tempo control</span>
            <span className="text-white">{o.tempoControl}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/55">Defensive risk</span>
            <span className="text-white">{o.defensiveRisk}</span>
          </div>
        </div>

        {/* primary read */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 transition-colors duration-300 group-hover:border-amber-400/15 group-hover:bg-white/[0.06]">
          “{o.read}”
        </div>

        {/* lens strip */}
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/60 transition-colors duration-300 group-hover:border-amber-400/15">
          {stat === "points" ? (
            <>
              Points lens vs <span className="text-white">{opponentName}</span>: expect tighter scoring unless shooting rhythm swings dramatically.
            </>
          ) : stat === "rebounds" ? (
            <>
              Rebounds lens vs <span className="text-white">{opponentName}</span>: glass control + second-chance points will decide band width.
            </>
          ) : stat === "assists" ? (
            <>
              Assists lens vs <span className="text-white">{opponentName}</span>: ball movement + defensive pressure are the swing levers.
            </>
          ) : stat === "threes" ? (
            <>
              Three-point lens vs <span className="text-white">{opponentName}</span>: shooting variance creates the widest outcome bands.
            </>
          ) : (
            <>
              Fantasy lens vs <span className="text-white">{opponentName}</span>: rotations + usage fluctuations are the swing levers.
            </>
          )}
          <div className="mt-2 text-[11px] text-white/45">
            Lens context: {ctx}
          </div>
        </div>

        {/* Premium blocks (intentional blur) */}
        <div className="mt-4 space-y-3">
          {premiumBlock(
            <>
              <div className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">
                Deep AI read
              </div>
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                {o.deepRead.map((line, i) => (
                  <li key={i} className="leading-snug">
                    • {renderDeepLine(line)}
                  </li>
                ))}
              </ul>
            </>
          )}

          {premiumBlock(
            <>
              <div className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">
                IF / THEN Scenarios
              </div>
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                {o.ifThen.map((line, i) => (
                  <li key={i} className="leading-snug">
                    • {renderWithEmphasis(line)}
                  </li>
                ))}
              </ul>
            </>
          )}

          {premiumBlock(
            <>
              <div className="text-[11px] font-semibold tracking-widest text-rose-200/80 uppercase">
                What breaks the model
              </div>
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                {o.breaksModel.map((line, i) => (
                  <li key={i} className="leading-snug">
                    • {line}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ✅ Single consolidated Neeko+ CTA per team card */}
        {teamCTA()}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      {showHeader && (
        <header className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold">Team Score Predictability</h2>
              <p className="mt-1 text-xs sm:text-sm text-white/60">
                Stat-driven AI · opponent interaction · game script + volatility
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {(["fantasy", "points", "rebounds", "assists", "threes"] as StatLens[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStat(s)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      stat === s
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5"
                    ].join(" ")}
                  >
                    {s === "fantasy" ? "Fantasy" :
                     s === "points" ? "Points" :
                     s === "rebounds" ? "Rebounds" :
                     s === "assists" ? "Assists" : "3-Pointers"}
                  </button>
                ))}
              </div>

              <div className="hidden sm:inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200/90">
                Neeko+ Gold
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Match volatility + AI lean */}
      <div className="px-4 sm:px-6 py-4 border-b border-white/10">
        <div
          className={[
            "rounded-2xl border border-white/10 bg-black/30 p-4",
            "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
            "transition-colors duration-300 hover:border-amber-400/15",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase">
              Match Volatility Meter
            </div>
            <div className="text-[11px] text-white/60">{meta.label}</div>
          </div>

          <div className="mt-3 h-2 w-full rounded bg-white/10 overflow-hidden">
            <div
              className="h-2 rounded bg-amber-400/60 relative"
              style={{ width: `${Math.round(meta.volatility01 * 100)}%` }}
            >
              {/* subtle “live” motion without custom keyframes */}
              <div className="absolute inset-0 animate-pulse bg-white/10" />
              {/* gold sheen */}
              <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/10 to-transparent" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {leanChip(meta.aiLean)}
              <span className="text-xs text-white/60">AI Lean: {meta.aiLeanText}</span>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/50">
            {meta.ifThen.map((l, i) => (
              <div key={i}>• {renderWithEmphasis(l)}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 sm:py-5 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {card(homeOutlook, awayOutlook.team)}
        {card(awayOutlook, homeOutlook.team)}
      </div>
    </section>
  );
}
