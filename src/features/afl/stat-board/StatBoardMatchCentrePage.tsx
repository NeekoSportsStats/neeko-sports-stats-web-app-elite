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
import { teamLensLabel } from "./teamTypes";

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

function confidenceColor(label: string | null): string {
  switch (label) {
    case "HIGH":   return "text-emerald-400";
    case "MEDIUM": return "text-amber-400/80";
    case "LOW":    return "text-white/40";
    default:       return "text-white/30";
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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/35">{icon}</span>
      <span className="text-[10px] font-[900] uppercase tracking-[0.14em] text-white/35">{title}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

// ── Snapshot card ─────────────────────────────────────────────────────────────

function SnapshotCard({
  label,
  value,
  valueClass = "text-white/80",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className={`text-[14px] font-bold tabular-nums leading-none mb-1 ${valueClass}`}>
        {value}
      </div>
      <div className="text-[10px] text-white/30 leading-snug">{label}</div>
    </div>
  );
}

// ── Team row — collapsed (desktop shows more columns) ─────────────────────────

const TeamRow = memo(function TeamRow({
  row,
  lens,
}: {
  row: MatchCentreRow;
  lens: TeamStatLens;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-white/85 leading-tight truncate block">
          {abbreviateTeam(row.team_name)}
        </span>
        <span className="text-[10px] text-white/30 leading-none">
          {row.is_home ? "Home" : "Away"}
        </span>
      </div>
      <div className="flex items-center gap-3 text-right shrink-0">
        {/* avg L5 — hidden on very small screens */}
        <div className="hidden sm:block text-right min-w-[44px]">
          <div className="text-[12px] font-semibold text-white/55 tabular-nums leading-none">
            {fmt(row.recent_avg_l5)}
          </div>
          <div className="text-[9px] text-white/25 leading-none mt-0.5">avg L5</div>
        </div>
        {/* Projection — always visible */}
        <div className="text-right min-w-[52px]">
          <div className="text-[13px] font-bold text-white/90 tabular-nums leading-none">
            {fmt(row.projection)}
          </div>
          <div className="text-[9px] text-white/30 leading-none mt-0.5">proj</div>
        </div>
        {/* Confidence — hidden on mobile */}
        <div className="hidden md:block text-right min-w-[48px]">
          <div className={`text-[11px] font-semibold leading-none ${confidenceColor(row.confidence_label)}`}>
            {row.confidence_label ?? "—"}
          </div>
          <div className="text-[9px] text-white/25 leading-none mt-0.5">conf.</div>
        </div>
        {/* Lens label hidden — used for visual alignment only */}
        <div className="hidden lg:block text-right min-w-[32px]">
          <div className="text-[10px] text-white/20 leading-none uppercase tracking-wide">
            {lens === "score" ? "pts" : lens === "goals" ? "g" : lens === "scoring_shots" ? "ss" : "d"}
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Stat environment section ──────────────────────────────────────────────────

function envBadgeClass(label: string | null): string {
  if (!label) return "bg-white/[0.04] text-white/25 border-white/[0.06]";
  const l = label.toLowerCase();
  if (l.includes("high") || l.includes("above")) return "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20";
  if (l.includes("low") || l.includes("below"))  return "bg-red-500/10 text-red-400/70 border-red-500/15";
  return "bg-white/[0.05] text-white/55 border-white/[0.09]";
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

  const rows: { label: string; value: string }[] = [
    { label: "Score", value: scoreEnv },
    { label: "Goals", value: goalsEnvLabel() },
    { label: "Scoring shots", value: scoringShotsEnvLabel() },
    { label: "Disposals", value: disposalsEnvLabel() },
    { label: "Volatility", value: volatilityLabel() },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(({ label, value }) => {
        const cls = envBadgeClass(value);
        const textCls = cls.includes("emerald")
          ? "text-emerald-400/85"
          : cls.includes("red")
          ? "text-red-400/75"
          : "text-white/55";
        return (
          <div key={label} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${cls}`}>
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wide">{label}</span>
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
  }: {
    metric: string;
    homeVal: number | null | undefined;
    awayVal: number | null | undefined;
    fmt?: (v: number | null | undefined) => string;
    isHitRate?: boolean;
  }) {
    const homeWins = homeVal != null && awayVal != null && homeVal > awayVal;
    const awayWins = awayVal != null && homeVal != null && awayVal > homeVal;
    const hClass = isHitRate
      ? homeWins ? "text-emerald-400" : "text-white/50"
      : homeWins ? "text-white/85" : "text-white/50";
    const aClass = isHitRate
      ? awayWins ? "text-emerald-400" : "text-white/50"
      : awayWins ? "text-white/85" : "text-white/50";

    return (
      <div className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0">
        <div className="w-[120px] min-w-[100px] text-[10px] font-semibold text-white/28 uppercase tracking-wide shrink-0 leading-tight pr-2">
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
      <div className="flex items-center pb-2 border-b border-white/[0.07] mb-1">
        <div className="w-[120px] min-w-[100px] shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <span className="text-[10px] font-bold text-white/45 uppercase tracking-wide text-right truncate">{homeLabel}</span>
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-wide truncate">{awayLabel}</span>
        </div>
      </div>

      <CRow metric="Proj. score"       homeVal={homeRow?.projection}             awayVal={awayRow?.projection} />
      <CRow metric="Avg L5"            homeVal={homeRow?.recent_avg_l5}          awayVal={awayRow?.recent_avg_l5} />
      <CRow metric="Avg L3"            homeVal={homeRow?.recent_avg_l3}          awayVal={awayRow?.recent_avg_l3} />
      <CRow metric="Season avg"        homeVal={homeRow?.season_avg}             awayVal={awayRow?.season_avg} />
      <CRow metric="Opp ceded L5"      homeVal={homeRow?.opponent_conceded_l5}   awayVal={awayRow?.opponent_conceded_l5} />
      <CRow metric="High recent"       homeVal={homeRow?.high_recent}            awayVal={awayRow?.high_recent} />
      <CRow metric="Low recent"        homeVal={homeRow?.low_recent}             awayVal={awayRow?.low_recent} />
      <CRow
        metric="Games"
        homeVal={homeRow?.recent_games_count}
        awayVal={awayRow?.recent_games_count}
        fmt={(v) => (v == null ? "—" : fmtInt(v))}
      />
      <CRow
        metric={`Hit ${t}+`}
        homeVal={hRate != null ? hRate : null}
        awayVal={aRate != null ? aRate : null}
        fmt={(v) => (v == null ? "—" : `${Math.round(v * 100)}%`)}
        isHitRate
      />
    </div>
  );
}

// ── AI match summary ──────────────────────────────────────────────────────────

function AiMatchSummarySection({
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
      const trend = hProj > hL5 + 3 ? "is projecting above" : hProj < hL5 - 3 ? "is projecting below" : "is projecting in line with";
      text += `${homeName} ${trend} their recent five-game average of ${fmt(hL5)}, with a projected score of ${fmt(hProj)}. `;
    } else {
      text += `${homeName} projects at ${fmt(hProj)} for this match. `;
    }

    if (aL5 != null) {
      const trend = aProj > aL5 + 3 ? "is projecting above" : aProj < aL5 - 3 ? "is projecting below" : "is projecting in line with";
      text += `${awayName} ${trend} their recent five-game average of ${fmt(aL5)}, projecting at ${fmt(aProj)}. `;
    } else {
      text += `${awayName} projects at ${fmt(aProj)}. `;
    }

    text += `${favTeam} holds the stronger projected output by ${marginVal} points, with a combined projected total of ${total}. `;

    if (conf) {
      const confLower = conf.charAt(0) + conf.slice(1).toLowerCase();
      text += `This match profiles as a ${confLower}-confidence scoring environment.`;
    }

    return text.trim();
  }

  const narrative = buildNarrative();

  return (
    <div>
      <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Match Summary" />
      {narrative ? (
        <p className="text-[12.5px] text-white/55 leading-[1.7]">
          {narrative}
        </p>
      ) : (
        <p className="text-[12px] text-white/30 italic">
          AI match summary not yet available for this fixture.
        </p>
      )}
    </div>
  );
}

// ── Expanded panel — 5 sections (rendered only for the open match) ────────────

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

  return (
    <div className="divide-y divide-white/[0.06]">

      {/* 1 · Match Snapshot */}
      <div className="px-4 py-4">
        <SectionHeader icon={<Target className="h-3.5 w-3.5" />} title="Match Snapshot" />
        <div className="grid grid-cols-2 gap-2.5">
          <SnapshotCard label="Projected total"       value={total != null ? fmt(total) : "—"} />
          <SnapshotCard label="Projected margin"      value={margin ?? "—"} />
          <SnapshotCard label="Confidence"            value={conf ?? "—"}    valueClass={confidenceColor(conf)} />
          <SnapshotCard label="Scoring environment"   value={envLabel} />
        </div>
      </div>

      {/* 2 · Team Comparison */}
      <div className="px-4 py-4">
        <SectionHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title="Team Comparison" />
        <ComparisonTable
          homeLabel={home}
          awayLabel={away}
          homeRow={homeRow}
          awayRow={awayRow}
          lens={comparisonLens}
        />
      </div>

      {/* 3 · Stat Environment */}
      <div className="px-4 py-4">
        <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} title="Stat Environment" />
        <StatEnvironmentSection homeRow={homeRow} awayRow={awayRow} />
      </div>

      {/* 4 · AI Match Summary */}
      <div className="px-4 py-4">
        <AiMatchSummarySection homeRow={homeRow} awayRow={awayRow} />
      </div>

      {/* 5 · Drill-down links */}
      <div className="px-4 py-4">
        <SectionHeader icon={<ArrowUpRight className="h-3.5 w-3.5" />} title="Drill-down" />
        {/* Stacked on mobile, inline on sm+ */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <Link
            to={`/stat-board/players?match_id=${fixture.matchId}`}
            className="flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-white/65 hover:text-white/90 hover:bg-white/[0.07] hover:border-white/[0.18] transition-all"
          >
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Open Player Stats
            <ArrowUpRight className="h-3 w-3 text-white/30 ml-auto" aria-hidden />
          </Link>
          <Link
            to={`/stat-board/teams?match_id=${fixture.matchId}`}
            className="flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-white/65 hover:text-white/90 hover:bg-white/[0.07] hover:border-white/[0.18] transition-all"
          >
            <BarChart2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Open Team Stats
            <ArrowUpRight className="h-3 w-3 text-white/30 ml-auto" aria-hidden />
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
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-white/50 leading-snug">
              {home}
              <span className="mx-1.5 font-normal text-white/20 text-[11px]">vs</span>
              {away}
            </span>
            <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-widest text-[#F5C84C]/60 bg-[#F5C84C]/[0.08] border border-[#F5C84C]/20 rounded px-1.5 py-0.5 leading-none">
              <Lock className="h-2 w-2" aria-hidden />
              Locked
            </span>
          </div>
          <p className="text-[10.5px] text-white/25 mt-0.5 leading-none">
            {formatMatchDate(fixture.gameDate)}
            {fixture.venue && <> · {abbreviateVenue(fixture.venue)}</>}
          </p>
        </div>
      </div>

      {/* Blurred/ghost team rows */}
      {[home, away].map((team) => (
        <div
          key={team}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0"
        >
          <span className="flex-1 text-[12.5px] font-semibold text-white/28">{team}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-3.5 w-10 rounded bg-white/[0.04]" />
            <div className="h-3.5 w-8 rounded bg-white/[0.04]" />
            <div className="h-3.5 w-12 rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}

      {/* CTA */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.015] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[11.5px] text-white/32 leading-snug">
          Upgrade to Neeko+ to view projections and match trends.
        </p>
        <button
          onClick={onUpgrade}
          className="shrink-0 text-[11px] font-bold text-[#F5C84C] bg-[#F5C84C]/[0.10] border border-[#F5C84C]/25 rounded-lg px-3 py-1.5 hover:bg-[#F5C84C]/[0.16] active:scale-95 transition-all leading-none"
        >
          Unlock full round
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

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors duration-150 ${
        isExpanded
          ? "border-white/[0.18] bg-white/[0.035]"
          : "border-white/[0.10] bg-white/[0.03]"
      }`}
    >
      {/* ── Header — tap/click to expand ─────────────────────────────── */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.06] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:bg-white/[0.04] transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-white/90 leading-snug">
              {home}
              <span className="mx-1.5 font-normal text-white/30 text-[11px]">vs</span>
              {away}
            </span>
            {isFreePreview && !hasFullAccess && (
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 leading-none">
                Free Preview
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-white/35 mt-0.5 leading-none">
            {formatMatchDate(fixture.gameDate)}
            {fixture.venue && <> · {abbreviateVenue(fixture.venue)}</>}
          </p>
        </div>
        <span className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/40 mt-0.5">
          {isExpanded
            ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </span>
      </button>

      {/* ── Projected scores — mobile compact 2-col, desktop table row ── */}
      {/* Mobile: 2-column score card pair */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-2 gap-2 sm:hidden">
        {homeRow && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <div className="text-[10px] text-white/30 mb-1 truncate">{home}</div>
            <div className="text-[17px] font-bold text-white/90 tabular-nums leading-none">{fmt(homeRow.projection)}</div>
            <div className="text-[9px] text-white/22 mt-0.5">proj</div>
          </div>
        )}
        {awayRow && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
            <div className="text-[10px] text-white/30 mb-1 truncate">{away}</div>
            <div className="text-[17px] font-bold text-white/90 tabular-nums leading-none">{fmt(awayRow.projection)}</div>
            <div className="text-[9px] text-white/22 mt-0.5">proj</div>
          </div>
        )}
      </div>

      {/* Desktop: standard team rows */}
      <div className="hidden sm:block">
        {homeRow && <TeamRow row={homeRow} lens={lens} />}
        {awayRow && <TeamRow row={awayRow} lens={lens} />}
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap border-t border-white/[0.05] bg-white/[0.015]">
        {total != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-white/28 uppercase tracking-wide font-semibold">Total</span>
            <span className="text-[12px] font-bold text-white/72 tabular-nums">{fmt(total)}</span>
          </div>
        )}
        {margin && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-white/28 uppercase tracking-wide font-semibold">Margin</span>
            <span className="text-[12px] font-semibold text-white/60">{margin}</span>
          </div>
        )}
        {conf && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-white/28 uppercase tracking-wide font-semibold">Confidence</span>
            <span className={`text-[12px] font-semibold ${confidenceColor(conf)}`}>{conf}</span>
          </div>
        )}
      </div>

      {/* ── Expanded panel — only rendered when open ──────────────────── */}
      {isExpanded && (
        <div className="border-t border-white/[0.08]">
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

// ── Match filter dropdown (full-width on mobile) ──────────────────────────────

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
        className={`
          w-full flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left
          transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/[0.08] border-white/[0.18] text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/[0.07] hover:border-white/[0.16]"}
        `}
      >
        <span className="flex-1 text-[13px] font-medium leading-none truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* Backdrop to close on tap-outside (mobile) */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full sm:w-[300px] rounded-2xl border border-white/[0.12] bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden py-1.5">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-semibold hover:bg-white/[0.06] transition-colors ${selectedMatchId === null ? "text-white bg-white/[0.08]" : "text-white/65"}`}
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
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.055] transition-colors ${isSelected ? "bg-white/[0.09]" : ""}`}
                >
                  <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                    {isLocked
                      ? <Lock className="h-3 w-3 text-[#F5C84C]/45" aria-hidden />
                      : <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/55" aria-hidden />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-tight truncate ${isSelected ? "text-white" : isLocked ? "text-white/45" : "text-white/75"}`}>
                      {abbreviateTeam(f.homeTeamName)}
                      <span className="mx-1 font-normal text-white/25 text-[11px]">vs</span>
                      {abbreviateTeam(f.awayTeamName)}
                    </p>
                    <p className="text-[9.5px] text-white/25 mt-0.5 leading-none">
                      {formatMatchDate(f.gameDate)}
                      {f.venue ? ` · ${abbreviateVenue(f.venue)}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {!hasFullAccess && (
              <div className="px-4 py-2 border-t border-white/[0.07] bg-white/[0.015] flex items-center gap-2 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                <span className="text-[10px] text-white/30">First 2 matches free</span>
                <span className="text-white/12 mx-1">·</span>
                <Lock className="h-2.5 w-2.5 text-[#F5C84C]/35" />
                <span className="text-[10px] text-white/25">Neeko+ required</span>
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
        className={`
          w-full flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left
          transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/[0.08] border-white/[0.18] text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/[0.07] hover:border-white/[0.16]"}
        `}
      >
        <span className="flex-1 text-[13px] font-medium leading-none">{current?.label ?? "Sort"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
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
                className={`w-full px-4 py-2.5 text-left text-[12.5px] hover:bg-white/[0.06] transition-colors ${o.key === value ? "text-white font-semibold bg-white/[0.07]" : "text-white/60 font-medium"}`}
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
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-[10.5px] font-semibold text-white/35 uppercase tracking-wider">
      {roundLabel && <span>{roundLabel}</span>}
      <span className="text-white/15">·</span>
      <span>{totalFixtures} {totalFixtures === 1 ? "Fixture" : "Fixtures"}</span>
      <span className="text-white/15">·</span>
      {hasFullAccess ? (
        <span className="text-emerald-400/75">Full round unlocked</span>
      ) : (
        <span className="text-amber-400/65">First 2 matches free</span>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FixtureSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="h-4 w-44 rounded bg-white/[0.06] mb-2" />
        <div className="h-3 w-28 rounded bg-white/[0.04]" />
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-2 sm:hidden">
        <div className="h-14 rounded-xl bg-white/[0.04]" />
        <div className="h-14 rounded-xl bg-white/[0.04]" />
      </div>
      <div className="hidden sm:block px-4 py-3 border-b border-white/[0.04]">
        <div className="h-4 w-full rounded bg-white/[0.04]" />
      </div>
      <div className="hidden sm:block px-4 py-3">
        <div className="h-4 w-full rounded bg-white/[0.04]" />
      </div>
      <div className="px-4 py-2.5 border-t border-white/[0.04]">
        <div className="h-3 w-48 rounded bg-white/[0.04]" />
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
          content="Compare every AFL game by projected score, recent team form, stat environment and matchup context."
        />
      </Helmet>

      <div style={{ minHeight: "100vh", background: "#05070A", color: "#fff" }}>
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 pt-7 sm:pt-10 pb-16 sm:pb-20">

          {/* ── Breadcrumb ────────────────────────────────────────────── */}
          <nav className="flex items-center gap-1.5 mb-5 text-[11px] text-white/30 font-medium">
            <Link to="/stat-board" className="hover:text-white/55 transition-colors">Stat Board</Link>
            <span>/</span>
            <span className="text-white/55">Match Centre</span>
          </nav>

          {/* ── Header ───────────────────────────────────────────────── */}
          <div className="mb-6">
            <p className="text-[9.5px] font-[900] tracking-[0.44em] uppercase text-emerald-500/65 mb-2.5">
              Match Centre
            </p>
            <h1 className="text-[clamp(1.45rem,4vw,2.1rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.2] mb-2">
              AFL Match Centre
            </h1>
            <p className="text-[clamp(12.5px,2vw,14.5px)] text-white/50 leading-[1.6] max-w-[480px]">
              Compare every game by projected score, recent team form, stat environment and matchup context.
            </p>
          </div>

          {/* ── Controls ──────────────────────────────────────────────── */}
          <div className="mb-5 space-y-2.5">
            {/* Lens tabs — horizontally scrollable, no wrapping on mobile */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
              <div className="flex items-center gap-1.5 min-w-max sm:flex-wrap sm:min-w-0">
                {LENS_OPTIONS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => handleLensChange(l.key)}
                    className={`
                      px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all duration-100 leading-none whitespace-nowrap
                      ${uiLens === l.key
                        ? "bg-white/[0.10] border border-white/[0.20] text-white"
                        : "bg-white/[0.03] border border-white/[0.07] text-white/50 hover:text-white/75 hover:bg-white/[0.06]"}
                    `}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match filter + sort — full-width on mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <MatchFilterDropdown
                allFixtures={allFixtures}
                selectedMatchId={selectedMatchId}
                onSelect={setSelectedMatchId}
                hasFullAccess={hasFullAccess}
              />
              <SortDropdown value={sortMode} onChange={setSortMode} />
            </div>
          </div>

          {/* ── Round summary pill ────────────────────────────────────── */}
          {!loading && !error && (
            <div className="mb-5">
              <SummaryPill
                roundLabel={roundLabel}
                totalFixtures={allFixtures.length}
                hasFullAccess={hasFullAccess}
              />
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400/80 mb-5">
              Failed to load match data. Please refresh.
            </div>
          )}

          {/* ── Loading ──────────────────────────────────────────────── */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <FixtureSkeleton key={i} />)}
            </div>
          )}

          {/* ── Empty ────────────────────────────────────────────────── */}
          {!loading && !error && fixtures.length === 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
              <p className="text-[13px] text-white/40">No fixtures available for this round.</p>
            </div>
          )}

          {/* ── Fixture cards ─────────────────────────────────────────── */}
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

          {/* ── Upgrade banner (free users, bottom) ──────────────────── */}
          {!loading && !hasFullAccess && allFixtures.some((f) => f.isLocked) && (
            <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.04] px-5 py-4">
              <Lock className="h-4 w-4 text-[#F5C84C] shrink-0 mt-0.5 sm:mt-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#F5C84C] leading-snug">
                  Unlock full round access
                </p>
                <p className="text-[11.5px] text-white/40 mt-0.5 leading-relaxed">
                  Upgrade to Neeko+ to view all fixtures, projections, scoring environment and match trends.
                </p>
              </div>
              <button
                onClick={() => navigate("/neeko-plus")}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#F5C84C] bg-[#F5C84C]/10 border border-[#F5C84C]/25 rounded-xl px-4 py-2.5 hover:bg-[#F5C84C]/[0.18] active:scale-95 transition-all leading-none"
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
