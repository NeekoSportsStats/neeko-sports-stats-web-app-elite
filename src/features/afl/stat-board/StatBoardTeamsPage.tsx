import { useState, useEffect, useMemo, useCallback, memo, useSyncExternalStore } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Lock } from "lucide-react";
import { track } from "@/lib/analytics";

import {
  useStatBoardTeamMatches,
  useStatBoardTeamRows,
} from "./useStatBoardTeams";
import type {
  StatBoardTeamMatch,
  StatBoardTeamRow,
  TeamStatLens,
} from "./teamTypes";
import { teamThresholdsForLens, teamLensLabel } from "./teamTypes";
import { TeamMatchSelector } from "./components/TeamMatchSelector";
import { TeamBoardRow, MobileTeamCard } from "./components/TeamBoardRow";

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

// ── Sort ──────────────────────────────────────────────────────────────────────

type TeamSortKey = "projection" | "hit_rate" | "recent_avg" | "name" | "consistency";

const CONSISTENCY_ORDER: Record<string, number> = {
  "VERY HIGH": 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4,
};

function sortRows(rows: StatBoardTeamRow[], sortKey: TeamSortKey, topThreshold: number): StatBoardTeamRow[] {
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case "projection":
        return (Number(b.projection) || 0) - (Number(a.projection) || 0);
      case "hit_rate": {
        const aRate = a.all_threshold_hit_rates?.[String(topThreshold)]?.rate ?? 0;
        const bRate = b.all_threshold_hit_rates?.[String(topThreshold)]?.rate ?? 0;
        return bRate - aRate;
      }
      case "recent_avg":
        return (Number(b.recent_avg_l5) || 0) - (Number(a.recent_avg_l5) || 0);
      case "name":
        return a.team_name.localeCompare(b.team_name);
      case "consistency":
        return (CONSISTENCY_ORDER[a.consistency_label ?? "UNKNOWN"] ?? 4) -
               (CONSISTENCY_ORDER[b.consistency_label ?? "UNKNOWN"] ?? 4);
      default:
        return 0;
    }
  });
}

function sortButtonLabel(key: TeamSortKey): string {
  switch (key) {
    case "projection":  return "Projection ↓";
    case "hit_rate":    return "Hit rate ↓";
    case "recent_avg":  return "Recent avg ↓";
    case "name":        return "Name A–Z";
    case "consistency": return "Consistency ↓";
  }
}

// ── Lens config ───────────────────────────────────────────────────────────────

const LENSES: TeamStatLens[] = ["score", "goals", "scoring_shots", "disposals"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatBoardTeamsPage() {
  const [selectedMatch, setSelectedMatch] = useState<StatBoardTeamMatch | null>(null);
  const [lens, setLens] = useState<TeamStatLens>("score");
  const [sortKey, setSortKey] = useState<TeamSortKey>("projection");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const navigate = useNavigate();

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardTeamMatches();

  const { rows, loading: rowsLoading, error: rowsError } = useStatBoardTeamRows({
    matchId: selectedMatch?.match_id ?? null,
    lens,
  });

  // Auto-select first available match
  useEffect(() => {
    if (matches.length === 0 || selectedMatch !== null) return;
    const maxWeek = Math.max(...matches.map((m) => m.week));
    const latestRound = matches.filter((m) => m.week === maxWeek);
    const defaultMatch =
      latestRound.find((m) => m.is_free_match && m.match_order === 1) ??
      latestRound.find((m) => m.is_free_match) ??
      latestRound[0] ??
      matches[0];
    setSelectedMatch(defaultMatch);
  }, [matches, selectedMatch]);

  function handleLensChange(newLens: TeamStatLens) {
    setLens(newLens);
    setSortKey("projection");
    setExpandedTeamId(null);
    track("Stat Board Team Lens Change", { lens: newLens });
  }

  function handleMatchChange(match: StatBoardTeamMatch) {
    setSelectedMatch(match);
    setExpandedTeamId(null);
    track("Stat Board Team Match Change", { match_id: match.match_id, match_label: match.match_label });
  }

  const handleToggleExpand = useCallback((key: string | null) => {
    setExpandedTeamId(key);
  }, []);

  useEffect(() => {
    track("Page View", { path: "/stat-board/teams" });
  }, []);

  const thresholds = teamThresholdsForLens(lens);
  const topThreshold = thresholds[0];
  const isLocked = selectedMatch?.is_locked ?? false;

  // Split into home / away sides of the selected match
  const { homeRows, awayRows } = useMemo(() => {
    if (!selectedMatch) return { homeRows: [], awayRows: [] };
    const home: StatBoardTeamRow[] = [];
    const away: StatBoardTeamRow[] = [];
    for (const r of rows) {
      if (r.team_id === selectedMatch.home_team_id) home.push(r);
      else away.push(r);
    }
    return {
      homeRows: sortRows(home, sortKey, topThreshold),
      awayRows: sortRows(away, sortKey, topThreshold),
    };
  }, [rows, selectedMatch, sortKey, topThreshold]);

  return (
    <>
      <Helmet>
        <title>AFL Team Stat Board | Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="Compare every AFL team's recent scoring trends, hit rates and projections by match."
        />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden" style={{ maxWidth: "100vw" }}>
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:pt-6 pb-20 min-w-0 overflow-x-hidden">

          {/* Breadcrumb */}
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-white/30">
            <Link to="/stat-board" className="hover:text-white/55 transition-colors">Stat Board</Link>
            <span>/</span>
            <span className="text-white/50">Team Stats</span>
          </div>

          {/* Page header */}
          <div className="mb-4 sm:mb-5">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">AFL Team Stat Board</h1>
            <p className="mt-1 text-sm text-white/50 max-w-xl leading-relaxed hidden sm:block">
              Pick a match, choose a stat lens, and compare each team's recent trends, hit rates and projections.
            </p>
          </div>

          {/* Match selector */}
          {matchesError ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load matches. Please try refreshing.
            </div>
          ) : (
            <TeamMatchSelector
              matches={matches}
              selected={selectedMatch}
              loading={matchesLoading}
              onChange={handleMatchChange}
            />
          )}

          {/* Controls: lens toggle + sort */}
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            {/* Lens toggle */}
            <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5 shrink-0 flex-wrap">
              {LENSES.map((l) => (
                <button
                  key={l}
                  onClick={() => handleLensChange(l)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    lens === l
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {teamLensLabel(l)}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative shrink-0 ml-auto">
              <button
                onClick={() => setSortOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/8 px-2.5 py-1.5 text-[12px] font-medium text-white/60 hover:text-white/80 hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 whitespace-nowrap"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
              >
                <span className="text-white/32 text-[11px] hidden sm:inline">Sort:</span>
                <span className="text-white/72">{sortButtonLabel(sortKey)}</span>
                <ChevronDown className={`h-3 w-3 text-white/30 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
              </button>
              {sortOpen && (
                <SortDropdown
                  current={sortKey}
                  onSelect={(k) => { setSortKey(k); setSortOpen(false); }}
                  onClose={() => setSortOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Locked banner */}
          {isLocked && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3.5">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C] mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#F5C84C] leading-snug">Neeko+ match</p>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                  Free users can explore the first two matches. Neeko+ unlocks every match, projection, hit rate and game log.
                </p>
                <button
                  onClick={() => navigate("/neeko-plus")}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C]/15 border border-[#F5C84C]/30 px-3.5 py-1.5 text-[11px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/25 transition-colors"
                >
                  Unlock Neeko+
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {rowsError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load team data. Please try again.
            </div>
          )}

          {/* Board */}
          {rowsLoading ? (
            <TeamBoardSkeleton thresholdCount={thresholds.length} />
          ) : rows.length === 0 && selectedMatch ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-10 text-center">
              <p className="text-[15px] font-semibold text-white/75 mb-1.5">No team data found</p>
              <p className="text-[13px] text-white/38 max-w-xs mx-auto leading-relaxed">
                Data may not be available for this match yet.
              </p>
            </div>
          ) : (
            <div className="space-y-5 sm:space-y-8">
              <MatchSection
                match={selectedMatch}
                homeRows={homeRows}
                awayRows={awayRows}
                lens={lens}
                thresholds={thresholds}
                isMatchLocked={isLocked}
                expandedTeamId={expandedTeamId}
                onToggleExpand={handleToggleExpand}
              />
            </div>
          )}

          {!matchesLoading && matches.length === 0 && !matchesError && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/45">
              No matches available yet.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Match section ─────────────────────────────────────────────────────────────

interface MatchSectionProps {
  match: StatBoardTeamMatch | null;
  homeRows: StatBoardTeamRow[];
  awayRows: StatBoardTeamRow[];
  lens: TeamStatLens;
  thresholds: readonly number[];
  isMatchLocked: boolean;
  expandedTeamId: string | null;
  onToggleExpand: (key: string | null) => void;
}

const MatchSection = memo(function MatchSection({
  match,
  homeRows,
  awayRows,
  lens,
  thresholds,
  isMatchLocked,
  expandedTeamId,
  onToggleExpand,
}: MatchSectionProps) {
  const isMobile = useIsMobile();
  const allRows = [...homeRows, ...awayRows];
  if (allRows.length === 0 || !match) return null;

  const teamHeader = (label: string, opponentLabel: string, isHome: boolean) => (
    <div className="mb-2 flex items-center gap-2 flex-wrap">
      <h2 className="text-[14px] font-bold text-white tracking-tight leading-none shrink-0">{label}</h2>
      <div className="flex items-center gap-1.5">
        {isHome ? (
          <span className="text-[9px] font-bold text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/15 rounded-full px-1.5 py-0.5 leading-none">
            Home
          </span>
        ) : (
          <span className="text-[9px] font-bold text-white/35 bg-white/5 border border-white/10 rounded-full px-1.5 py-0.5 leading-none">
            Away
          </span>
        )}
        <span className="text-[10px] text-white/28 leading-none">vs {opponentLabel}</span>
      </div>
    </div>
  );

  const renderTeam = (rows: StatBoardTeamRow[], isHome: boolean) => {
    if (rows.length === 0) return null;
    const teamName = isHome ? match.home_team_name : match.away_team_name;
    const oppName  = isHome ? match.away_team_name : match.home_team_name;

    if (isMobile) {
      return (
        <div className="w-full min-w-0">
          {teamHeader(teamName, oppName, isHome)}
          <div className="flex flex-col gap-2 w-full min-w-0">
            {rows.map((row) => {
              const key = `${row.match_id}-${row.team_id}`;
              return (
                <MobileTeamCard
                  key={key}
                  row={row}
                  lens={lens}
                  thresholds={thresholds}
                  isMatchLocked={isMatchLocked}
                  isExpanded={expandedTeamId === key}
                  onToggleExpand={() => onToggleExpand(expandedTeamId === key ? null : key)}
                />
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div>
        {teamHeader(teamName, oppName, isHome)}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d0d]">
          <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
            <thead>
              <tr className="border-b border-white/10 bg-[#0f0f0f]">
                <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider whitespace-nowrap w-[180px]">Team</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap">L5 Form</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-right whitespace-nowrap">L5 Avg</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-[#F5C84C]/55 uppercase tracking-wider text-right whitespace-nowrap">Proj</th>
                {thresholds.map((t) => (
                  <th
                    key={t}
                    className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap"
                  >
                    {t}+
                  </th>
                ))}
                <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap">Consistency</th>
                <th className="pr-3 pl-1 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.match_id}-${row.team_id}`;
                return (
                  <TeamBoardRow
                    key={key}
                    row={row}
                    lens={lens}
                    thresholds={thresholds}
                    isMatchLocked={isMatchLocked}
                    isExpanded={expandedTeamId === key}
                    onToggleExpand={() => onToggleExpand(expandedTeamId === key ? null : key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="h-px" />
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      {renderTeam(homeRows, true)}
      {renderTeam(awayRows, false)}
    </div>
  );
});

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  current,
  onSelect,
  onClose,
}: {
  current: TeamSortKey;
  onSelect: (k: TeamSortKey) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-sort-dropdown]")) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const options: { key: TeamSortKey; label: string }[] = [
    { key: "projection",  label: "Projection — high to low" },
    { key: "hit_rate",    label: "Hit rate — high to low" },
    { key: "recent_avg",  label: "Recent avg — high to low" },
    { key: "name",        label: "Name — A to Z" },
    { key: "consistency", label: "Consistency — best first" },
  ];

  return (
    <div
      data-sort-dropdown
      role="listbox"
      aria-label="Sort options"
      className="absolute right-0 top-full z-50 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          role="option"
          aria-selected={current === opt.key}
          onClick={() => onSelect(opt.key)}
          className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${
            current === opt.key
              ? "bg-white/10 text-white font-semibold"
              : "text-white/60 hover:bg-white/6 hover:text-white/90"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function TeamBoardSkeleton({ thresholdCount }: { thresholdCount: number }) {
  const colCount = 4 + thresholdCount + 2;
  return (
    <div className="space-y-8">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="h-4 w-32 rounded-lg bg-white/6 mb-3 animate-pulse" />
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0d0d0d]">
            <table className="w-full border-collapse" style={{ minWidth: "640px" }}>
              <thead>
                <tr className="border-b border-white/10 bg-[#0f0f0f]">
                  {Array.from({ length: colCount }).map((_, i) => (
                    <th key={i} className="px-3 py-2.5">
                      <div className="h-2.5 w-10 rounded bg-white/8 animate-pulse" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((i) => (
                  <tr key={i} className="border-b border-white/[0.06] last:border-b-0">
                    <td className="pl-4 pr-2 py-3">
                      <div className="h-3 w-28 rounded bg-white/6 animate-pulse mb-1" />
                      <div className="h-2 w-20 rounded bg-white/4 animate-pulse" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-[3px] items-end justify-center">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div
                            key={j}
                            style={{ height: 12 + j * 3 }}
                            className="w-[14px] rounded-sm bg-white/4 animate-pulse"
                          />
                        ))}
                      </div>
                    </td>
                    {Array.from({ length: colCount - 2 }).map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <div className="h-3 w-10 rounded bg-white/5 animate-pulse mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

