import { useState, memo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  ArrowRight,
  Users,
  ChartBar as BarChart2,
  ArrowUpRight,
  Zap,
  TrendingUp,
  Target,
} from "lucide-react";
import { useMatchCentreData } from "./useMatchCentreData";
import type {
  MatchCentreFixture,
  MatchCentreRow,
  MatchCentreSortMode,
  TeamStatLens,
} from "./matchCentreTypes";

// ── Lens config ───────────────────────────────────────────────────────────────

type MatchCentreLens = "overview" | TeamStatLens;

const LENS_OPTIONS: { key: MatchCentreLens; label: string }[] = [
  { key: "overview",      label: "Overview" },
  { key: "score",         label: "Score" },
  { key: "goals",         label: "Goals" },
  { key: "scoring_shots", label: "Scoring Shots" },
  { key: "disposals",     label: "Disposals" },
];

const SORT_OPTIONS: { key: MatchCentreSortMode; label: string }[] = [
  { key: "fixture_order",   label: "Fixture order" },
  { key: "projection_desc", label: "Highest proj. total" },
  { key: "avg_l5_desc",     label: "Highest recent avg" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null) return "—";
  return n.toFixed(dec);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toString();
}

function abbreviateTeam(name: string): string {
  return name.replace(/ (Football Club|F\.?C\.?|AFC)$/i, "").trim();
}

function abbreviateVenue(venue: string): string {
  return venue
    .replace(/ Stadium$/i, "")
    .replace(/ Ground$/i, "")
    .replace(/ Oval$/i, "")
    .replace(/ Park$/i, "")
    .trim();
}

function formatMatchDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

// Backend returns hit rates as whole-number percents (e.g. 75, 88).
// This helper handles both decimal ratios (≤1) and whole percents (>1) safely.
function formatPercent(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  const pct = v <= 1 ? Math.round(v * 100) : Math.round(v);
  return `${pct}%`;
}

function confidenceColor(label: string | null | undefined): string {
  switch (label) {
    case "HIGH":
    case "VERY HIGH": return "text-emerald-400";
    case "MEDIUM":    return "text-amber-400/80";
    case "LOW":       return "text-white/38";
    default:          return "text-white/28";
  }
}

function projectedMarginLabel(
  home: MatchCentreRow | null,
  away: MatchCentreRow | null
): string | null {
  if (!home?.projection || !away?.projection) return null;
  const diff = home.projection - away.projection;
  if (Math.abs(diff) < 0.5) return "Even";
  const favTeam = diff > 0 ? abbreviateTeam(home.team_name) : abbreviateTeam(away.team_name);
  return `${favTeam} +${Math.abs(diff).toFixed(1)}`;
}

function projectedTotal(
  home: MatchCentreRow | null,
  away: MatchCentreRow | null
): number | null {
  if (!home?.projection || !away?.projection) return null;
  return home.projection + away.projection;
}

function overallConfidence(
  home: MatchCentreRow | null,
  away: MatchCentreRow | null
): string | null {
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const h = home?.confidence_label;
  const a = away?.confidence_label;
  if (!h && !a) return null;
  if (!h) return a ?? null;
  if (!a) return h;
  return (order[h] ?? 2) <= (order[a] ?? 2) ? h : a;
}

function scoringEnvLabel(
  home: MatchCentreRow | null,
  away: MatchCentreRow | null
): string {
  const hEnv = home?.scoring_environment_label;
  const aEnv = away?.scoring_environment_label;
  const rank = (s: string) => {
    const l = s.toLowerCase();
    if (l.includes("high") || l.includes("above")) return 2;
    if (l.includes("low") || l.includes("below")) return 0;
    return 1;
  };
  if (hEnv && aEnv) return rank(hEnv) >= rank(aEnv) ? hEnv : aEnv;
  if (hEnv) return hEnv;
  if (aEnv) return aEnv;
  const total = projectedTotal(home, away);
  const seasonTotal = (home?.season_avg ?? 0) + (away?.season_avg ?? 0);
  if (total == null || seasonTotal === 0) return "Standard";
  const ratio = total / seasonTotal;
  if (ratio > 1.06) return "Above average";
  if (ratio < 0.94) return "Below average";
  return "Average";
}

function isLowSample(row: MatchCentreRow | null): boolean {
  return row != null && (row.recent_games_count ?? 0) < 3;
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/30">{icon}</span>
      <span className="text-[9.5px] font-[900] uppercase tracking-[0.15em] text-white/30">{title}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

// ── Snapshot card ─────────────────────────────────────────────────────────────

function SnapshotCard({
  label,
  value,
  valueClass = "text-white/75",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
      <div className={`text-[15px] font-[800] tabular-nums leading-none mb-1.5 ${valueClass}`}>
        {value}
      </div>
      <div className="text-[10px] text-white/28 leading-snug">{label}</div>
      {sub && <div className="text-[9px] text-white/20 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

// ── Team row (desktop) ────────────────────────────────────────────────────────

const TeamRow = memo(function TeamRow({
  row,
  lens,
}: {
  row: MatchCentreRow;
  lens: TeamStatLens;
}) {
  const lowSample = isLowSample(row);
  const lensUnit = lens === "score" ? "pts" : lens === "goals" ? "g" : lens === "scoring_shots" ? "ss" : "d";

  return (
    <div className="flex items-center gap-3 py-2.5 px-4 border-b border-white/[0.045] last:border-0">
      {/* Team name */}
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-white/85 leading-tight truncate block">
          {abbreviateTeam(row.team_name)}
        </span>
        <span className="text-[9.5px] text-white/28 leading-none">
          {row.is_home ? "Home" : "Away"}
          {lowSample && <span className="ml-1.5 text-amber-400/55">· Limited recent sample</span>}
        </span>
      </div>

      <div className="flex items-center gap-4 text-right shrink-0">
        {/* Avg L5 — visible sm+ */}
        <div className="hidden sm:block text-right min-w-[46px]">
          <div className="text-[12px] font-semibold text-white/48 tabular-nums leading-none">
            {fmt(row.recent_avg_l5)}
          </div>
          <div className="text-[9px] text-white/22 leading-none mt-0.5">avg L5</div>
        </div>

        {/* Projection — always visible, gold */}
        <div className="text-right min-w-[52px]">
          <div className={`text-[14px] font-[800] tabular-nums leading-none ${row.projection != null ? "text-[#F5C84C]" : "text-white/30"}`}>
            {fmt(row.projection)}
          </div>
          <div className="text-[9px] text-white/28 leading-none mt-0.5">{lensUnit} proj</div>
        </div>

        {/* Confidence — visible md+ */}
        <div className="hidden md:block text-right min-w-[44px]">
          <div className={`text-[11px] font-semibold leading-none ${confidenceColor(row.confidence_label)}`}>
            {row.confidence_label ?? "—"}
          </div>
          <div className="text-[9px] text-white/22 leading-none mt-0.5">conf.</div>
        </div>
      </div>
    </div>
  );
});

// ── Stat environment section ──────────────────────────────────────────────────

function envBadgeClass(label: string | null): string {
  if (!label) return "bg-white/[0.04] text-white/22 border-white/[0.05]";
  const l = label.toLowerCase();
  if (l.includes("high") || l.includes("above")) return "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20";
  if (l.includes("low") || l.includes("below"))  return "bg-red-500/8 text-red-400/65 border-red-500/12";
  return "bg-white/[0.04] text-white/48 border-white/[0.08]";
}

function StatEnvironmentSection({
  homeRow,
  awayRow,
}: {
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
}) {
  function combineEnv(a: string | null | undefined, b: string | null | undefined): string {
    const rank = (s: string) => {
      const l = s.toLowerCase();
      if (l.includes("high") || l.includes("above")) return 2;
      if (l.includes("low") || l.includes("below")) return 0;
      return 1;
    };
    if (a && b) {
      const avg = (rank(a) + rank(b)) / 2;
      if (avg > 1.4) return "Above average";
      if (avg < 0.6) return "Below average";
      return "Average";
    }
    return a || b || "Standard";
  }

  const scoreEnv = combineEnv(homeRow?.scoring_environment_label, awayRow?.scoring_environment_label);

  function goalsEnvLabel(): string {
    const hGoals = homeRow?.recent_goals_avg;
    const aGoals = awayRow?.recent_goals_avg;
    if (hGoals == null && aGoals == null) return "Standard";
    const avg = ((hGoals ?? 0) + (aGoals ?? 0)) / (hGoals != null && aGoals != null ? 2 : 1);
    if (avg > 11) return "High";
    if (avg < 8)  return "Low";
    return "Medium";
  }

  function scoringShotsEnvLabel(): string {
    const h = homeRow?.recent_scoring_shots_avg;
    const a = awayRow?.recent_scoring_shots_avg;
    if (h == null && a == null) return "Standard";
    const avg = ((h ?? 0) + (a ?? 0)) / (h != null && a != null ? 2 : 1);
    if (avg > 27) return "High";
    if (avg < 20) return "Low";
    return "Medium";
  }

  function disposalsEnvLabel(): string {
    if (homeRow == null || awayRow == null) return "Standard";
    const hAvg = homeRow.season_avg;
    const aAvg = awayRow.season_avg;
    if (hAvg == null && aAvg == null) return "Standard";
    const avg = ((hAvg ?? 0) + (aAvg ?? 0)) / (hAvg != null && aAvg != null ? 2 : 1);
    if (avg > 370) return "High";
    if (avg < 320) return "Low";
    return "Medium";
  }

  function volatilityLabel(): string {
    const h = homeRow?.stddev_recent;
    const a = awayRow?.stddev_recent;
    if (h == null && a == null) return "Standard";
    const avg = ((h ?? 0) + (a ?? 0)) / (h != null && a != null ? 2 : 1);
    if (avg > 18) return "High";
    if (avg < 8)  return "Low";
    return "Medium";
  }

  const envRows: { label: string; value: string }[] = [
    { label: "Scoring env", value: scoreEnv },
    { label: "Goals",       value: goalsEnvLabel() },
    { label: "Scoring shots", value: scoringShotsEnvLabel() },
    { label: "Disposals",   value: disposalsEnvLabel() },
    { label: "Volatility",  value: volatilityLabel() },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {envRows.map(({ label, value }) => {
        const cls = envBadgeClass(value);
        const textCls = cls.includes("emerald")
          ? "text-emerald-400/85"
          : cls.includes("red")
          ? "text-red-400/70"
          : "text-white/48";
        return (
          <div key={label} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${cls}`}>
            <span className="text-[9.5px] font-semibold text-white/28 uppercase tracking-wide">{label}</span>
            <span className={`text-[11px] font-bold ${textCls}`}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({
  homeLabel,
  awayLabel,
  homeRow,
  awayRow,
  lens,
}: {
  homeLabel: string;
  awayLabel: string;
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
  lens: TeamStatLens;
}) {
  const thresholdMap: Record<TeamStatLens, number> = {
    score: 90, goals: 10, scoring_shots: 26, disposals: 360,
  };
  const t = thresholdMap[lens];
  const hRate = homeRow?.all_threshold_hit_rates?.[String(t)]?.rate;
  const aRate = awayRow?.all_threshold_hit_rates?.[String(t)]?.rate;

  function CRow({
    metric,
    homeVal,
    awayVal,
    fmt: fmtFn = fmt,
    isHitRate = false,
    isProjection = false,
  }: {
    metric: string;
    homeVal: number | null | undefined;
    awayVal: number | null | undefined;
    fmt?: (v: number | null | undefined) => string;
    isHitRate?: boolean;
    isProjection?: boolean;
  }) {
    const homeWins = homeVal != null && awayVal != null && homeVal > awayVal;
    const awayWins = awayVal != null && homeVal != null && awayVal > homeVal;

    const hClass = isProjection
      ? homeVal != null ? "text-[#F5C84C]" : "text-white/28"
      : isHitRate
      ? homeWins ? "text-emerald-400" : "text-white/45"
      : homeWins ? "text-white/82" : "text-white/45";

    const aClass = isProjection
      ? awayVal != null ? "text-[#F5C84C]/85" : "text-white/28"
      : isHitRate
      ? awayWins ? "text-emerald-400" : "text-white/45"
      : awayWins ? "text-white/82" : "text-white/45";

    return (
      <div className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0">
        <div className="w-[130px] min-w-[100px] text-[9.5px] font-semibold text-white/25 uppercase tracking-wide shrink-0 leading-tight pr-2">
          {metric}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <span className={`text-[12px] tabular-nums text-right font-semibold ${hClass}`}>
            {fmtFn(homeVal)}
          </span>
          <span className={`text-[12px] tabular-nums font-semibold ${aClass}`}>
            {fmtFn(awayVal)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center pb-2 border-b border-white/[0.06] mb-1">
        <div className="w-[130px] min-w-[100px] shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <span className="text-[9.5px] font-bold text-white/40 uppercase tracking-wide text-right truncate">{homeLabel}</span>
          <span className="text-[9.5px] font-bold text-white/22 uppercase tracking-wide truncate">{awayLabel}</span>
        </div>
      </div>

      <CRow metric="Projected score"    homeVal={homeRow?.projection}           awayVal={awayRow?.projection}  isProjection />
      <CRow metric="Recent avg L5"      homeVal={homeRow?.recent_avg_l5}        awayVal={awayRow?.recent_avg_l5} />
      <CRow metric="Recent avg L3"      homeVal={homeRow?.recent_avg_l3}        awayVal={awayRow?.recent_avg_l3} />
      <CRow metric="Season avg"         homeVal={homeRow?.season_avg}           awayVal={awayRow?.season_avg} />
      <CRow metric="Opp ceded L5"       homeVal={homeRow?.opponent_conceded_l5} awayVal={awayRow?.opponent_conceded_l5} />
      <CRow metric="Recent high"        homeVal={homeRow?.high_recent}          awayVal={awayRow?.high_recent} />
      <CRow metric="Recent low"         homeVal={homeRow?.low_recent}           awayVal={awayRow?.low_recent} />
      <CRow
        metric="Games (sample)"
        homeVal={homeRow?.recent_games_count}
        awayVal={awayRow?.recent_games_count}
        fmt={(v) => (v == null ? "—" : fmtInt(v))}
      />
      <CRow
        metric={`Hit rate ${t}+`}
        homeVal={hRate != null ? hRate : null}
        awayVal={aRate != null ? aRate : null}
        fmt={formatPercent}
        isHitRate
      />
    </div>
  );
}

// ── Match narrative section ───────────────────────────────────────────────────

function MatchNarrativeSection({
  homeRow,
  awayRow,
}: {
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
}) {
  function buildNarrative(): string | null {
    if (!homeRow || !awayRow) return null;
    const hProj = homeRow.projection;
    const aProj = awayRow.projection;
    const hL5   = homeRow.recent_avg_l5;
    const aL5   = awayRow.recent_avg_l5;
    const conf  = overallConfidence(homeRow, awayRow);
    if (!hProj || !aProj) return null;

    const homeName = abbreviateTeam(homeRow.team_name);
    const awayName = abbreviateTeam(awayRow.team_name);
    const favTeam  = hProj >= aProj ? homeName : awayName;
    const marginVal = Math.abs(hProj - aProj).toFixed(1);
    const total     = (hProj + aProj).toFixed(1);

    let text = "";

    if (hL5 != null) {
      const trend = hProj > hL5 + 3
        ? "is projecting above"
        : hProj < hL5 - 3
        ? "is projecting below"
        : "is projecting in line with";
      text += `${homeName} ${trend} their recent five-game average of ${fmt(hL5)}, with a projected score of ${fmt(hProj)}. `;
    } else {
      text += `${homeName} has a projected score of ${fmt(hProj)} for this match. `;
    }

    if (aL5 != null) {
      const trend = aProj > aL5 + 3
        ? "is projecting above"
        : aProj < aL5 - 3
        ? "is projecting below"
        : "is projecting in line with";
      text += `${awayName} ${trend} their recent five-game average of ${fmt(aL5)}, projecting at ${fmt(aProj)}. `;
    } else {
      text += `${awayName} projects at ${fmt(aProj)}. `;
    }

    text += `${favTeam} holds the stronger projected output by ${marginVal} points, with a combined projected total of ${total}. `;

    if (conf) {
      const confLower = conf.charAt(0) + conf.slice(1).toLowerCase();
      text += `This match profiles as a ${confLower} trend confidence environment based on recent scoring data.`;
    }

    return text.trim();
  }

  const narrative = buildNarrative();
  const lowHome = isLowSample(homeRow);
  const lowAway = isLowSample(awayRow);
  const hasLowSample = lowHome || lowAway;

  return (
    <div>
      <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Match Summary" />
      {hasLowSample && (
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-md bg-amber-400/[0.07] border border-amber-400/15 px-2.5 py-1">
          <span className="text-[10px] font-semibold text-amber-400/65">Limited recent sample</span>
        </div>
      )}
      {narrative ? (
        <p className="text-[12.5px] text-white/50 leading-[1.75]">
          {narrative}
        </p>
      ) : (
        <p className="text-[12px] text-white/28 italic">
          AI match summary not yet available for this fixture.
        </p>
      )}
    </div>
  );
}

// ── Expanded panel ────────────────────────────────────────────────────────────

function ExpandedPanel({
  fixture,
  homeRow,
  awayRow,
  lens,
  uiLens,
}: {
  fixture: MatchCentreFixture;
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
  lens: TeamStatLens;
  uiLens: MatchCentreLens;
}) {
  const home = abbreviateTeam(fixture.homeTeamName);
  const away = abbreviateTeam(fixture.awayTeamName);
  const total = projectedTotal(homeRow, awayRow);
  const margin = projectedMarginLabel(homeRow, awayRow);
  const conf = overallConfidence(homeRow, awayRow);
  const envLabel = scoringEnvLabel(homeRow, awayRow);
  const comparisonLens: TeamStatLens = uiLens === "overview" ? "score" : lens;

  // Sub-labels for snapshot cards
  const envBadge = envBadgeClass(envLabel);
  const envTextCls = envBadge.includes("emerald")
    ? "text-emerald-400"
    : envBadge.includes("red")
    ? "text-red-400/80"
    : "text-white/65";

  return (
    <div className="divide-y divide-white/[0.05]">

      {/* 1 · Match Snapshot ─────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <SectionHeader icon={<Target className="h-3.5 w-3.5" />} title="Match Snapshot" />
        <div className="grid grid-cols-2 gap-2.5">
          <SnapshotCard
            label="Projected total"
            value={total != null ? fmt(total) : "—"}
            valueClass={total != null ? "text-[#F5C84C]" : "text-white/28"}
          />
          <SnapshotCard
            label="Projected margin"
            value={margin ?? "—"}
            valueClass={margin ? "text-[#F5C84C]/85" : "text-white/28"}
          />
          <SnapshotCard
            label="Trend confidence"
            value={conf ?? "—"}
            valueClass={confidenceColor(conf)}
          />
          <SnapshotCard
            label="Scoring environment"
            value={envLabel}
            valueClass={envTextCls}
          />
        </div>
      </div>

      {/* 2 · Recent scoring profile ─────────────────────────────────────── */}
      <div className="px-4 py-4">
        <SectionHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title="Recent Scoring Profile" />
        <ComparisonTable
          homeLabel={home}
          awayLabel={away}
          homeRow={homeRow}
          awayRow={awayRow}
          lens={comparisonLens}
        />
      </div>

      {/* 3 · Matchup context ────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Matchup Context" />
        <StatEnvironmentSection homeRow={homeRow} awayRow={awayRow} />
      </div>

      {/* 4 · Match narrative ────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <MatchNarrativeSection homeRow={homeRow} awayRow={awayRow} />
      </div>

      {/* 5 · Drill-down ─────────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <SectionHeader icon={<ArrowUpRight className="h-3.5 w-3.5" />} title="Drill-down" />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Link
            to={`/stat-board/players?match_id=${fixture.matchId}`}
            className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-white/60 hover:text-white/88 hover:bg-white/[0.06] hover:border-white/[0.16] transition-all"
          >
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Player Stats
            <ArrowUpRight className="h-3 w-3 text-white/25 ml-auto" aria-hidden />
          </Link>
          <Link
            to={`/stat-board/teams?match_id=${fixture.matchId}`}
            className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-white/60 hover:text-white/88 hover:bg-white/[0.06] hover:border-white/[0.16] transition-all"
          >
            <BarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Team Stats
            <ArrowUpRight className="h-3 w-3 text-white/25 ml-auto" aria-hidden />
          </Link>
        </div>
      </div>

    </div>
  );
}

// ── Locked fixture card ───────────────────────────────────────────────────────

function LockedFixture({
  fixture,
  onUpgrade,
}: {
  fixture: MatchCentreFixture;
  onUpgrade: () => void;
}) {
  const home = abbreviateTeam(fixture.homeTeamName);
  const away = abbreviateTeam(fixture.awayTeamName);

  return (
    <div className="rounded-2xl border border-[#F5C84C]/12 bg-white/[0.015] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-white/40 leading-snug">
              {home}
              <span className="mx-1.5 font-normal text-white/18 text-[11px]">vs</span>
              {away}
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#F5C84C]/55 bg-[#F5C84C]/[0.07] border border-[#F5C84C]/15 rounded px-1.5 py-0.5 leading-none">
              <Lock className="h-2 w-2" aria-hidden />
              Neeko+ required
            </span>
          </div>
          <p className="text-[10px] text-white/22 mt-0.5 leading-none">
            {formatMatchDate(fixture.gameDate)}
            {fixture.venue && <> · {abbreviateVenue(fixture.venue)}</>}
          </p>
        </div>
      </div>

      {/* Ghost stat rows */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {[home, away].map((team) => (
          <div
            key={team}
            className="flex items-center gap-3"
          >
            <span className="flex-1 text-[12.5px] font-semibold text-white/22">{team}</span>
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-3 w-10 rounded bg-white/[0.035]" />
              <div className="h-3 w-8 rounded bg-white/[0.035]" />
              <div className="h-3 w-12 rounded bg-white/[0.035]" />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between gap-3">
        <p className="text-[11px] text-white/28 leading-snug">
          Projected total, projected margin and match trends locked.
        </p>
        <button
          onClick={onUpgrade}
          className="shrink-0 text-[11px] font-bold text-[#F5C84C] bg-[#F5C84C]/[0.09] border border-[#F5C84C]/22 rounded-lg px-3 py-1.5 hover:bg-[#F5C84C]/[0.15] active:scale-95 transition-all leading-none whitespace-nowrap"
        >
          Unlock Neeko+
        </button>
      </div>
    </div>
  );
}

// ── Unlocked fixture card ─────────────────────────────────────────────────────

function UnlockedFixture({
  fixture,
  lens,
  uiLens,
  isFreePreview,
  hasFullAccess,
  isExpanded,
  onToggle,
}: {
  fixture: MatchCentreFixture;
  lens: TeamStatLens;
  uiLens: MatchCentreLens;
  isFreePreview: boolean;
  hasFullAccess: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { homeRow, awayRow } = fixture;
  const total = projectedTotal(homeRow, awayRow);
  const margin = projectedMarginLabel(homeRow, awayRow);
  const conf = overallConfidence(homeRow, awayRow);
  const home = abbreviateTeam(fixture.homeTeamName);
  const away = abbreviateTeam(fixture.awayTeamName);
  const env = scoringEnvLabel(homeRow, awayRow);

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all duration-150 ${
        isExpanded
          ? "border-white/[0.16] bg-[#0f1012]"
          : "border-white/[0.09] bg-[#0c0d0f] hover:border-white/[0.14]"
      }`}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.05] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:bg-white/[0.03] transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-white/90 leading-snug">
              {home}
              <span className="mx-1.5 font-normal text-white/25 text-[11px]">vs</span>
              {away}
            </span>
            {isFreePreview && !hasFullAccess && (
              <span className="text-[8.5px] font-bold uppercase tracking-widest text-emerald-400/75 bg-emerald-500/8 border border-emerald-500/18 rounded px-1.5 py-0.5 leading-none">
                Free
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-0.5 leading-none">
            {formatMatchDate(fixture.gameDate)}
            {fixture.venue && <> · {abbreviateVenue(fixture.venue)}</>}
          </p>
        </div>
        <span className="shrink-0 flex items-center justify-center h-6 w-6 rounded-lg bg-white/[0.05] border border-white/[0.07] text-white/35 mt-0.5">
          {isExpanded
            ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </span>
      </button>

      {/* ── Mobile: 2-col score cards ────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2.5 grid grid-cols-2 gap-2 sm:hidden">
        {homeRow ? (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <div className="text-[10px] text-white/28 mb-1.5 truncate font-medium">{home}</div>
            <div className={`text-[18px] font-[800] tabular-nums leading-none ${homeRow.projection != null ? "text-[#F5C84C]" : "text-white/28"}`}>
              {fmt(homeRow.projection)}
            </div>
            <div className="text-[9px] text-white/22 mt-1">projected score</div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 flex items-center justify-center">
            <span className="text-[12px] text-white/22">—</span>
          </div>
        )}
        {awayRow ? (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <div className="text-[10px] text-white/28 mb-1.5 truncate font-medium">{away}</div>
            <div className={`text-[18px] font-[800] tabular-nums leading-none ${awayRow.projection != null ? "text-[#F5C84C]" : "text-white/28"}`}>
              {fmt(awayRow.projection)}
            </div>
            <div className="text-[9px] text-white/22 mt-1">projected score</div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 flex items-center justify-center">
            <span className="text-[12px] text-white/22">—</span>
          </div>
        )}
      </div>

      {/* ── Desktop: team rows ───────────────────────────────────────────── */}
      <div className="hidden sm:block">
        {homeRow && <TeamRow row={homeRow} lens={lens} />}
        {awayRow && <TeamRow row={awayRow} lens={lens} />}
      </div>

      {/* ── Summary strip ───────────────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center gap-x-4 gap-y-1 flex-wrap border-t border-white/[0.04] bg-white/[0.01]">
        {total != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-white/22 uppercase tracking-wide font-semibold">Projected total</span>
            <span className="text-[12.5px] font-[800] text-[#F5C84C] tabular-nums">{fmt(total)}</span>
          </div>
        )}
        {margin && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-white/22 uppercase tracking-wide font-semibold">Margin</span>
            <span className="text-[12px] font-semibold text-[#F5C84C]/75">{margin}</span>
          </div>
        )}
        {conf && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-white/22 uppercase tracking-wide font-semibold">Trend confidence</span>
            <span className={`text-[11px] font-semibold ${confidenceColor(conf)}`}>{conf}</span>
          </div>
        )}
        {env && env !== "Standard" && env !== "Average" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-white/22 uppercase tracking-wide font-semibold">Env</span>
            <span className={`text-[11px] font-semibold ${envBadgeClass(env).includes("emerald") ? "text-emerald-400/80" : envBadgeClass(env).includes("red") ? "text-red-400/70" : "text-white/40"}`}>
              {env}
            </span>
          </div>
        )}
      </div>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-white/[0.07]">
          <ExpandedPanel
            fixture={fixture}
            homeRow={homeRow}
            awayRow={awayRow}
            lens={lens}
            uiLens={uiLens}
          />
        </div>
      )}
    </div>
  );
}

// ── Match filter dropdown ─────────────────────────────────────────────────────

function MatchFilterDropdown({
  allFixtures,
  selectedMatchId,
  onSelect,
  hasFullAccess,
}: {
  allFixtures: MatchCentreFixture[];
  selectedMatchId: number | null;
  onSelect: (id: number | null) => void;
  hasFullAccess: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selectedFixture = selectedMatchId != null
    ? allFixtures.find((f) => f.matchId === selectedMatchId)
    : null;

  const triggerLabel = selectedFixture
    ? `${abbreviateTeam(selectedFixture.homeTeamName)} vs ${abbreviateTeam(selectedFixture.awayTeamName)}`
    : "All matches";

  return (
    <div className="relative w-full sm:w-auto sm:min-w-[200px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/[0.08] border-white/[0.18] text-white"
            : "bg-white/[0.04] border-white/[0.09] text-white/78 hover:bg-white/[0.07] hover:border-white/[0.15]"}`}
      >
        <span className="flex-1 text-[13px] font-medium leading-none truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/28 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full sm:w-[300px] rounded-2xl border border-white/[0.12] bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden py-1.5">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-semibold hover:bg-white/[0.06] transition-colors ${selectedMatchId === null ? "text-white bg-white/[0.08]" : "text-white/60"}`}
            >
              All matches
            </button>
            {allFixtures.map((f) => {
              const isLocked = hasFullAccess ? false : f.isLocked;
              const isSelected = f.matchId === selectedMatchId;
              return (
                <button
                  key={f.matchId}
                  onClick={() => { onSelect(f.matchId); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.05] transition-colors ${isSelected ? "bg-white/[0.08]" : ""}`}
                >
                  <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                    {isLocked
                      ? <Lock className="h-3 w-3 text-[#F5C84C]/40" aria-hidden />
                      : <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/55" aria-hidden />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-tight truncate ${isSelected ? "text-white" : isLocked ? "text-white/40" : "text-white/72"}`}>
                      {abbreviateTeam(f.homeTeamName)}
                      <span className="mx-1 font-normal text-white/22 text-[11px]">vs</span>
                      {abbreviateTeam(f.awayTeamName)}
                    </p>
                    <p className="text-[9.5px] text-white/22 mt-0.5 leading-none">
                      {formatMatchDate(f.gameDate)}
                      {f.venue ? ` · ${abbreviateVenue(f.venue)}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {!hasFullAccess && (
              <div className="px-4 py-2 border-t border-white/[0.06] bg-white/[0.01] flex items-center gap-2 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/55 shrink-0" />
                <span className="text-[10px] text-white/28">First 2 matches free</span>
                <span className="text-white/10 mx-1">·</span>
                <Lock className="h-2.5 w-2.5 text-[#F5C84C]/32" />
                <span className="text-[10px] text-white/22">Neeko+ required</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: MatchCentreSortMode;
  onChange: (v: MatchCentreSortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.key === value);

  return (
    <div className="relative w-full sm:w-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/[0.08] border-white/[0.18] text-white"
            : "bg-white/[0.04] border-white/[0.09] text-white/78 hover:bg-white/[0.07] hover:border-white/[0.15]"}`}
      >
        <span className="flex-1 text-[13px] font-medium leading-none">{current?.label ?? "Sort"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/28 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-full sm:w-52 rounded-2xl border border-white/[0.12] bg-[#111111] shadow-2xl shadow-black/70 py-1.5 overflow-hidden">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-[12.5px] hover:bg-white/[0.06] transition-colors ${o.key === value ? "text-white font-semibold bg-white/[0.07]" : "text-white/55 font-medium"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Round summary pill ────────────────────────────────────────────────────────

function SummaryPill({
  roundLabel,
  totalFixtures,
  hasFullAccess,
}: {
  roundLabel: string | null;
  totalFixtures: number;
  hasFullAccess: boolean;
}) {
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.018] text-[10.5px] font-semibold text-white/30 uppercase tracking-wider">
      {roundLabel && <span>{roundLabel}</span>}
      <span className="text-white/12">·</span>
      <span>{totalFixtures} {totalFixtures === 1 ? "Fixture" : "Fixtures"}</span>
      <span className="text-white/12">·</span>
      {hasFullAccess ? (
        <span className="text-emerald-400/70">Full round unlocked</span>
      ) : (
        <span className="text-amber-400/60">First 2 matches free</span>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FixtureSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0c0d0f] overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="h-4 w-44 rounded bg-white/[0.05] mb-1.5" />
        <div className="h-2.5 w-28 rounded bg-white/[0.035]" />
      </div>
      <div className="px-3 pt-3 pb-2.5 grid grid-cols-2 gap-2 sm:hidden">
        <div className="h-[72px] rounded-xl bg-white/[0.035]" />
        <div className="h-[72px] rounded-xl bg-white/[0.035]" />
      </div>
      <div className="hidden sm:block">
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="h-3.5 w-full rounded bg-white/[0.035]" />
        </div>
        <div className="px-4 py-3">
          <div className="h-3.5 w-full rounded bg-white/[0.035]" />
        </div>
      </div>
      <div className="px-4 py-2 border-t border-white/[0.04]">
        <div className="h-3 w-52 rounded bg-white/[0.035]" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatBoardMatchCentrePage() {
  const navigate = useNavigate();

  const {
    fixtures,
    allFixtures,
    roundLabel,
    lens,
    setLens,
    selectedMatchId,
    setSelectedMatchId,
    sortMode,
    setSortMode,
    hasFullAccess,
    loading,
    error,
  } = useMatchCentreData();

  const [uiLens, setUiLens] = useState<MatchCentreLens>("overview");
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);

  function handleLensChange(l: MatchCentreLens) {
    setUiLens(l);
    setLens(l !== "overview" ? (l as TeamStatLens) : "score");
  }

  function handleToggle(matchId: number) {
    setExpandedMatchId((prev) => (prev === matchId ? null : matchId));
  }

  return (
    <>
      <Helmet>
        <title>AFL Match Centre | Neeko Sports Stats</title>
        <meta
          name="description"
          content="Compare every AFL game by projected score, recent team scoring profile, matchup context and trend confidence."
        />
      </Helmet>

      <div className="min-h-screen bg-[#05070A] text-white overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-7 sm:pt-10 pb-16 sm:pb-24">

          {/* ── Breadcrumb ──────────────────────────────────────────────── */}
          <nav className="flex items-center gap-1.5 mb-5 text-[11px] text-white/28 font-medium">
            <Link to="/stat-board" className="hover:text-white/55 transition-colors">Stat Board</Link>
            <span className="text-white/15">/</span>
            <span className="text-white/50">Match Centre</span>
          </nav>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="mb-6">
            <p className="text-[9px] font-[900] tracking-[0.46em] uppercase text-emerald-500/60 mb-2.5">
              Match Centre
            </p>
            <h1 className="text-[clamp(1.45rem,4vw,2rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.2] mb-2">
              AFL Match Centre
            </h1>
            <p className="text-[clamp(12.5px,2vw,14px)] text-white/45 leading-[1.65] max-w-[500px]">
              Scan every fixture by projected total, projected margin, scoring environment and trend confidence.
            </p>
          </div>

          {/* ── Controls ────────────────────────────────────────────────── */}
          <div className="mb-5 space-y-2.5">
            {/* Lens tabs */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
              <div className="flex items-center gap-1.5 min-w-max sm:flex-wrap sm:min-w-0">
                {LENS_OPTIONS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => handleLensChange(l.key)}
                    className={`px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all duration-100 leading-none whitespace-nowrap border
                      ${uiLens === l.key
                        ? "bg-white/[0.10] border-white/[0.18] text-white"
                        : "bg-white/[0.03] border-white/[0.06] text-white/45 hover:text-white/72 hover:bg-white/[0.06]"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match filter + sort */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <MatchFilterDropdown
                allFixtures={allFixtures}
                selectedMatchId={selectedMatchId}
                onSelect={setSelectedMatchId}
                hasFullAccess={hasFullAccess}
              />
              <SortDropdown value={sortMode} onChange={setSortMode} />
            </div>
          </div>

          {/* ── Round summary pill ──────────────────────────────────────── */}
          {!loading && !error && (
            <div className="mb-4">
              <SummaryPill
                roundLabel={roundLabel}
                totalFixtures={allFixtures.length}
                hasFullAccess={hasFullAccess}
              />
            </div>
          )}

          {/* ── Error ──────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-[13px] text-red-400/75 mb-5">
              Could not load Match Centre data. Please try again.
            </div>
          )}

          {/* ── Loading ────────────────────────────────────────────────── */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <FixtureSkeleton key={i} />)}
            </div>
          )}

          {/* ── Empty ──────────────────────────────────────────────────── */}
          {!loading && !error && fixtures.length === 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-10 text-center">
              <p className="text-[13px] text-white/38">No fixtures available for this round.</p>
            </div>
          )}

          {/* ── Fixture cards ───────────────────────────────────────────── */}
          {!loading && !error && fixtures.length > 0 && (
            <div className="space-y-3">
              {fixtures.map((fixture) =>
                fixture.isLocked ? (
                  <LockedFixture
                    key={fixture.matchId}
                    fixture={fixture}
                    onUpgrade={() => navigate("/neeko-plus")}
                  />
                ) : (
                  <UnlockedFixture
                    key={fixture.matchId}
                    fixture={fixture}
                    lens={lens}
                    uiLens={uiLens}
                    isFreePreview={fixture.isFreePreview}
                    hasFullAccess={hasFullAccess}
                    isExpanded={expandedMatchId === fixture.matchId}
                    onToggle={() => handleToggle(fixture.matchId)}
                  />
                )
              )}
            </div>
          )}

          {/* ── Upgrade banner (free users with locked fixtures) ─────────── */}
          {!loading && !hasFullAccess && allFixtures.some((f) => f.isLocked) && (
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-[#F5C84C]/18 bg-[#F5C84C]/[0.035] px-5 py-4">
              <Lock className="h-4 w-4 text-[#F5C84C]/70 shrink-0 mt-0.5 sm:mt-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#F5C84C]/85 leading-snug">
                  Unlock full round access
                </p>
                <p className="text-[11.5px] text-white/38 mt-0.5 leading-relaxed">
                  View every fixture's projected total, projected margin, scoring environment and trend confidence.
                </p>
              </div>
              <button
                onClick={() => navigate("/neeko-plus")}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#F5C84C] bg-[#F5C84C]/10 border border-[#F5C84C]/22 rounded-xl px-4 py-2.5 hover:bg-[#F5C84C]/[0.17] active:scale-95 transition-all leading-none"
              >
                Upgrade <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
