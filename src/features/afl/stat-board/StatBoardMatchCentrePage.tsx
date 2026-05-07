import { useMemo, useState, memo, useSyncExternalStore } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Lock, ArrowRight, ExternalLink, Users, ChartBar as BarChart2, ArrowUpRight } from "lucide-react";
import { useMatchCentreData } from "./useMatchCentreData";
import type { MatchCentreFixture, MatchCentreRow, MatchCentreSortMode, TeamStatLens } from "./matchCentreTypes";
import { teamLensLabel } from "./teamTypes";

// ── Mobile detection ──────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getSnapshot() { return window.matchMedia("(max-width: 767px)").matches; }
function getServerSnapshot() { return false; }
function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ── Lens config ───────────────────────────────────────────────────────────────

type MatchCentreLens = "overview" | TeamStatLens;

const LENS_OPTIONS: { key: MatchCentreLens; label: string }[] = [
  { key: "overview",       label: "Overview" },
  { key: "score",          label: "Score" },
  { key: "goals",          label: "Goals" },
  { key: "scoring_shots",  label: "Scoring Shots" },
  { key: "disposals",      label: "Disposals" },
];

const SORT_OPTIONS: { key: MatchCentreSortMode; label: string }[] = [
  { key: "fixture_order",   label: "Fixture order" },
  { key: "projection_desc", label: "Highest projected total" },
  { key: "avg_l5_desc",     label: "Highest recent avg" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null) return "—";
  return n.toFixed(dec);
}

function abbreviateTeam(name: string): string {
  return name
    .replace(/ (Football Club|F\.?C\.?|AFC)$/i, "")
    .trim();
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

function consistencyColor(label: string | null): string {
  switch (label) {
    case "VERY HIGH": return "text-emerald-400";
    case "HIGH":      return "text-emerald-400/75";
    case "MEDIUM":    return "text-amber-400/80";
    case "LOW":       return "text-white/40";
    default:          return "text-white/30";
  }
}

function projectedMarginLabel(home: MatchCentreRow | null, away: MatchCentreRow | null): string | null {
  if (!home?.projection || !away?.projection) return null;
  const diff = home.projection - away.projection;
  if (Math.abs(diff) < 0.5) return "Even match";
  const favTeam = diff > 0 ? abbreviateTeam(home.team_name) : abbreviateTeam(away.team_name);
  return `${favTeam} +${Math.abs(diff).toFixed(1)}`;
}

function projectedTotal(home: MatchCentreRow | null, away: MatchCentreRow | null): number | null {
  if (!home?.projection || !away?.projection) return null;
  return home.projection + away.projection;
}

function overallConfidence(home: MatchCentreRow | null, away: MatchCentreRow | null): string | null {
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const h = home?.confidence_label;
  const a = away?.confidence_label;
  if (!h && !a) return null;
  if (!h) return a ?? null;
  if (!a) return h;
  return (order[h] ?? 2) <= (order[a] ?? 2) ? h : a;
}

// ── Sparkline chips ───────────────────────────────────────────────────────────

function RecentChips({ values, lens }: { values: number[] | null; lens: TeamStatLens }) {
  if (!values || values.length === 0) {
    return <span className="text-[10px] text-white/20">—</span>;
  }
  const last5 = values.slice(-5);
  return (
    <span className="flex items-center gap-0.5">
      {last5.map((v, i) => (
        <span
          key={i}
          className="inline-block text-[9px] font-semibold tabular-nums rounded px-1 py-0.5 leading-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.50)",
          }}
        >
          {lens === "score" ? Math.round(v) : v.toFixed(1)}
        </span>
      ))}
    </span>
  );
}

// ── Team row ──────────────────────────────────────────────────────────────────

const TeamRow = memo(function TeamRow({
  row,
  lens,
  isLocked,
}: {
  row: MatchCentreRow;
  lens: TeamStatLens;
  isLocked: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 border-b border-white/[0.05] last:border-0">
      {/* Team name */}
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-white/85 leading-tight truncate block">
          {abbreviateTeam(row.team_name)}
        </span>
        <span className="text-[10px] text-white/30 leading-none">
          {row.is_home ? "Home" : "Away"}
        </span>
      </div>

      {isLocked ? (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-14 rounded bg-white/[0.04] border border-white/[0.06]" />
          <div className="h-5 w-10 rounded bg-white/[0.04] border border-white/[0.06]" />
          <div className="h-5 w-12 rounded bg-white/[0.04] border border-white/[0.06]" />
        </div>
      ) : (
        <div className="flex items-center gap-3 text-right shrink-0">
          {/* Recent chips */}
          <div className="hidden sm:flex items-center gap-1">
            <RecentChips values={row.recent_values} lens={lens} />
          </div>

          {/* Projection */}
          <div className="text-right min-w-[52px]">
            <div className="text-[13px] font-bold text-white/90 tabular-nums leading-none">
              {fmt(row.projection)}
            </div>
            <div className="text-[9px] text-white/30 leading-none mt-0.5">proj</div>
          </div>

          {/* L5 avg */}
          <div className="text-right min-w-[44px] hidden sm:block">
            <div className="text-[12px] font-semibold text-white/55 tabular-nums leading-none">
              {fmt(row.recent_avg_l5)}
            </div>
            <div className="text-[9px] text-white/25 leading-none mt-0.5">avg L5</div>
          </div>

          {/* Confidence */}
          <div className="text-right min-w-[48px] hidden md:block">
            <div className={`text-[11px] font-semibold leading-none ${confidenceColor(row.confidence_label)}`}>
              {row.confidence_label ?? "—"}
            </div>
            <div className="text-[9px] text-white/25 leading-none mt-0.5">conf.</div>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Locked fixture block ──────────────────────────────────────────────────────

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
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-white/55 leading-snug">
              {home}
              <span className="mx-1.5 font-normal text-white/25 text-[11px]">vs</span>
              {away}
            </span>
            <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-widest text-[#F5C84C]/60 bg-[#F5C84C]/[0.08] border border-[#F5C84C]/20 rounded px-1.5 py-0.5 leading-none">
              <Lock className="h-2 w-2" aria-hidden />
              Locked
            </span>
          </div>
          <p className="text-[10.5px] text-white/28 mt-0.5 leading-none">
            {formatMatchDate(fixture.gameDate)}
            {fixture.venue && (
              <> · {abbreviateVenue(fixture.venue)}</>
            )}
          </p>
        </div>
      </div>

      {/* Team name ghosts */}
      <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center gap-3">
        <span className="text-[12.5px] font-semibold text-white/30 flex-1">{home}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-12 rounded bg-white/[0.04]" />
          <div className="h-4 w-10 rounded bg-white/[0.04]" />
          <div className="h-4 w-14 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="px-4 py-2.5 flex items-center gap-3">
        <span className="text-[12.5px] font-semibold text-white/30 flex-1">{away}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-12 rounded bg-white/[0.04]" />
          <div className="h-4 w-10 rounded bg-white/[0.04]" />
          <div className="h-4 w-14 rounded bg-white/[0.04]" />
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.015] flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11.5px] text-white/35 leading-snug">
          Upgrade to Neeko+ to view projections, hit rates and match trends.
        </p>
        <button
          onClick={onUpgrade}
          className="shrink-0 text-[11px] font-bold text-[#F5C84C] bg-[#F5C84C]/[0.10] border border-[#F5C84C]/25 rounded-lg px-3 py-1.5 hover:bg-[#F5C84C]/[0.16] transition-colors leading-none"
        >
          Upgrade to Neeko+
        </button>
      </div>
    </div>
  );
}

// ── Unlocked fixture block ────────────────────────────────────────────────────

function UnlockedFixture({
  fixture,
  lens,
  isFreePreview,
  hasFullAccess,
}: {
  fixture: MatchCentreFixture;
  lens: TeamStatLens;
  isFreePreview: boolean;
  hasFullAccess: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { homeRow, awayRow } = fixture;

  const total = projectedTotal(homeRow, awayRow);
  const margin = projectedMarginLabel(homeRow, awayRow);
  const conf = overallConfidence(homeRow, awayRow);

  const home = abbreviateTeam(fixture.homeTeamName);
  const away = abbreviateTeam(fixture.awayTeamName);

  return (
    <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] overflow-hidden transition-all duration-150 hover:border-white/[0.15]">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-white/[0.06]">
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
            {fixture.venue && (
              <> · {abbreviateVenue(fixture.venue)}</>
            )}
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] transition-colors text-white/40"
          aria-label={expanded ? "Collapse fixture" : "Expand fixture"}
        >
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>

      {/* Team rows */}
      {homeRow && <TeamRow row={homeRow} lens={lens} isLocked={false} />}
      {awayRow && <TeamRow row={awayRow} lens={lens} isLocked={false} />}

      {/* Summary strip */}
      <div className="px-4 py-2.5 flex items-center gap-4 flex-wrap border-t border-white/[0.05] bg-white/[0.015]">
        {total != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wide font-semibold">Proj total</span>
            <span className="text-[12px] font-bold text-white/75 tabular-nums">{fmt(total)}</span>
          </div>
        )}
        {margin && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wide font-semibold">Proj margin</span>
            <span className="text-[12px] font-semibold text-white/65">{margin}</span>
          </div>
        )}
        {conf && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wide font-semibold">Confidence</span>
            <span className={`text-[12px] font-semibold ${confidenceColor(conf)}`}>{conf}</span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.07] bg-white/[0.015]">
          <ExpandedDetails homeRow={homeRow} awayRow={awayRow} lens={lens} fixture={fixture} />
        </div>
      )}
    </div>
  );
}

// ── Expanded details ──────────────────────────────────────────────────────────

function ExpandedDetails({
  homeRow,
  awayRow,
  lens,
  fixture,
}: {
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
  lens: TeamStatLens;
  fixture: MatchCentreFixture;
}) {
  function StatCompareRow({
    label,
    homeVal,
    awayVal,
  }: {
    label: string;
    homeVal: React.ReactNode;
    awayVal: React.ReactNode;
  }) {
    return (
      <div className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0">
        <div className="w-28 text-[10.5px] font-semibold text-white/35 uppercase tracking-wide shrink-0">{label}</div>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[12px] text-white/70 tabular-nums font-semibold min-w-[52px] text-right">{homeVal}</span>
          <span className="text-white/15 text-[10px]">·</span>
          <span className="text-[12px] text-white/50 tabular-nums min-w-[52px]">{awayVal}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-0">
      {/* Column headers */}
      <div className="flex items-center pb-2 border-b border-white/[0.06] mb-1">
        <div className="w-28 shrink-0" />
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[9.5px] font-bold text-white/40 uppercase tracking-wide min-w-[52px] text-right">
            {abbreviateTeam(fixture.homeTeamName)}
          </span>
          <span className="w-[10px]" />
          <span className="text-[9.5px] font-bold text-white/25 uppercase tracking-wide min-w-[52px]">
            {abbreviateTeam(fixture.awayTeamName)}
          </span>
        </div>
      </div>

      <StatCompareRow
        label="Projection"
        homeVal={fmt(homeRow?.projection)}
        awayVal={fmt(awayRow?.projection)}
      />
      <StatCompareRow
        label="L3 avg"
        homeVal={fmt(homeRow?.recent_avg_l3)}
        awayVal={fmt(awayRow?.recent_avg_l3)}
      />
      <StatCompareRow
        label="L5 avg"
        homeVal={fmt(homeRow?.recent_avg_l5)}
        awayVal={fmt(awayRow?.recent_avg_l5)}
      />
      <StatCompareRow
        label="L8 avg"
        homeVal={fmt(homeRow?.recent_avg_l8)}
        awayVal={fmt(awayRow?.recent_avg_l8)}
      />
      <StatCompareRow
        label="Season avg"
        homeVal={fmt(homeRow?.season_avg)}
        awayVal={fmt(awayRow?.season_avg)}
      />
      <StatCompareRow
        label="Consistency"
        homeVal={
          <span className={`text-[11px] ${consistencyColor(homeRow?.consistency_label ?? null)}`}>
            {homeRow?.consistency_label ?? "—"}
          </span>
        }
        awayVal={
          <span className={`text-[11px] ${consistencyColor(awayRow?.consistency_label ?? null)}`}>
            {awayRow?.consistency_label ?? "—"}
          </span>
        }
      />
      {lens === "score" && (
        <>
          <StatCompareRow
            label="Opp conceded L5"
            homeVal={fmt(homeRow?.opponent_conceded_l5)}
            awayVal={fmt(awayRow?.opponent_conceded_l5)}
          />
          <StatCompareRow
            label="Scoring env."
            homeVal={
              <span className="text-[11px] text-white/55 truncate">
                {homeRow?.scoring_environment_label ?? "—"}
              </span>
            }
            awayVal={
              <span className="text-[11px] text-white/35 truncate">
                {awayRow?.scoring_environment_label ?? "—"}
              </span>
            }
          />
        </>
      )}

      {/* Deep links */}
      <div className="pt-3 pb-1 flex items-center gap-3 flex-wrap">
        <Link
          to={`/stat-board/players?match_id=${fixture.matchId}`}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-white/45 hover:text-white/70 transition-colors"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          Open Player Stats
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
        <span className="text-white/15">·</span>
        <Link
          to={`/stat-board/teams?match_id=${fixture.matchId}`}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-white/45 hover:text-white/70 transition-colors"
        >
          <BarChart2 className="h-3.5 w-3.5" aria-hidden />
          Open Team Stats
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
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
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left min-w-[180px]
          transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/7 hover:border-white/16 hover:text-white/95"}
        `}
      >
        <span className="flex-1 text-[13px] font-medium leading-none truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-2xl border border-white/12 bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden py-1.5">
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
                className={`
                  w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.055] transition-colors
                  ${isSelected ? "bg-white/[0.09]" : ""}
                `}
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
              <span className="text-white/12">·</span>
              <Lock className="h-2.5 w-2.5 text-[#F5C84C]/35" />
              <span className="text-[10px] text-white/25">Neeko+ required</span>
            </div>
          )}
        </div>
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
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left
          transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/7 hover:border-white/16"}
        `}
      >
        <span className="text-[13px] font-medium leading-none">{current?.label ?? "Sort"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-2xl border border-white/12 bg-[#111111] shadow-2xl shadow-black/70 py-1.5 overflow-hidden">
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
      )}
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({
  roundLabel,
  totalFixtures,
  lens,
  hasFullAccess,
}: {
  roundLabel: string | null;
  totalFixtures: number;
  lens: MatchCentreLens;
  hasFullAccess: boolean;
}) {
  const lensLabel = lens === "overview" ? "Overview" : teamLensLabel(lens);
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] text-[10.5px] font-semibold text-white/35 uppercase tracking-wider">
      {roundLabel && <span>{roundLabel}</span>}
      <span className="text-white/15">·</span>
      <span>{totalFixtures} {totalFixtures === 1 ? "Fixture" : "Fixtures"}</span>
      <span className="text-white/15">·</span>
      <span>{lensLabel}</span>
      <span className="text-white/15">·</span>
      {hasFullAccess ? (
        <span className="text-emerald-400/75">Full round unlocked</span>
      ) : (
        <span className="text-amber-400/65">First 2 matches free</span>
      )}
      <span className="text-white/15">·</span>
      <span className="text-white/25 normal-case font-medium tracking-normal">Updated before round lockout</span>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FixtureSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="h-4 w-48 rounded bg-white/[0.06] mb-2" />
        <div className="h-3 w-32 rounded bg-white/[0.04]" />
      </div>
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <div className="h-4 w-full rounded bg-white/[0.04]" />
      </div>
      <div className="px-4 py-3">
        <div className="h-4 w-full rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatBoardMatchCentrePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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

  // The hook uses TeamStatLens internally; overview is UI-only (maps to score for data)
  const [uiLens, setUiLens] = useState<MatchCentreLens>("overview");

  function handleLensChange(l: MatchCentreLens) {
    setUiLens(l);
    if (l !== "overview") {
      setLens(l as TeamStatLens);
    } else {
      setLens("score");
    }
  }

  const dataLens: TeamStatLens = lens;

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
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(28px,4vw,52px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)" }}>

          {/* ── Breadcrumb ────────────────────────────────────────────────── */}
          <nav className="flex items-center gap-1.5 mb-5 text-[11px] text-white/30 font-medium">
            <Link to="/stat-board" className="hover:text-white/55 transition-colors">Stat Board</Link>
            <span>/</span>
            <span className="text-white/55">Match Centre</span>
          </nav>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="mb-6">
            <p className="text-[9.5px] font-[900] tracking-[0.44em] uppercase text-emerald-500/65 mb-2.5">
              Match Centre
            </p>
            <h1 className="text-[clamp(1.55rem,3vw,2.1rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.2] mb-2">
              AFL Match Centre
            </h1>
            <p className="text-[clamp(13px,1vw,14.5px)] text-white/50 leading-[1.6] max-w-[500px]">
              Compare every game by projected score, recent team form, stat environment and matchup context.
            </p>
          </div>

          {/* ── Controls ─────────────────────────────────────────────────── */}
          <div className="mb-5 space-y-3">
            {/* Lens tabs */}
            <div className="flex items-center gap-1 flex-wrap">
              {LENS_OPTIONS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => handleLensChange(l.key)}
                  className={`
                    px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all duration-100 leading-none
                    ${uiLens === l.key
                      ? "bg-white/[0.10] border border-white/[0.20] text-white"
                      : "bg-white/[0.03] border border-white/[0.07] text-white/50 hover:text-white/75 hover:bg-white/[0.06]"}
                  `}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Match filter + sort */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <MatchFilterDropdown
                allFixtures={allFixtures}
                selectedMatchId={selectedMatchId}
                onSelect={setSelectedMatchId}
                hasFullAccess={hasFullAccess}
              />
              <SortDropdown value={sortMode} onChange={setSortMode} />
            </div>
          </div>

          {/* ── Summary strip ─────────────────────────────────────────────── */}
          {!loading && !error && (
            <div className="mb-5">
              <SummaryStrip
                roundLabel={roundLabel}
                totalFixtures={allFixtures.length}
                lens={uiLens}
                hasFullAccess={hasFullAccess}
              />
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400/80 mb-5">
              Failed to load match data. Please refresh.
            </div>
          )}

          {/* ── Loading ───────────────────────────────────────────────────── */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <FixtureSkeleton key={i} />)}
            </div>
          )}

          {/* ── Empty ─────────────────────────────────────────────────────── */}
          {!loading && !error && fixtures.length === 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
              <p className="text-[13px] text-white/40">No fixtures available for this round.</p>
            </div>
          )}

          {/* ── Fixture list ──────────────────────────────────────────────── */}
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
                    lens={dataLens}
                    isFreePreview={fixture.isFreePreview}
                    hasFullAccess={hasFullAccess}
                  />
                )
              )}
            </div>
          )}

          {/* ── Upgrade prompt (free users, bottom) ───────────────────────── */}
          {!loading && !hasFullAccess && allFixtures.some((f) => f.isLocked) && (
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.04] px-5 py-4">
              <Lock className="h-4 w-4 text-[#F5C84C] shrink-0" aria-hidden />
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
                className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold text-[#F5C84C] bg-[#F5C84C]/10 border border-[#F5C84C]/25 rounded-xl px-4 py-2.5 hover:bg-[#F5C84C]/18 transition-colors leading-none"
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
