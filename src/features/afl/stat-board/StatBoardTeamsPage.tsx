import React, { useState, useEffect, useMemo, useCallback, memo, useSyncExternalStore } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Lock, Check } from "lucide-react";
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
import { teamThresholdsForLens, teamLensLabel, teamLensUnit } from "./teamTypes";
import { TeamBoardRow, MobileTeamCard, LockedFixtureBlock } from "./components/TeamBoardRow";

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

type TeamSortKey = "fixture" | "projection" | "hit_rate" | "recent_avg" | "consistency";

const CONSISTENCY_ORDER: Record<string, number> = {
  "VERY HIGH": 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4,
};

function sortRowsForFixture(
  rows: StatBoardTeamRow[],
  sortKey: TeamSortKey,
  topThreshold: number,
): StatBoardTeamRow[] {
  if (sortKey === "fixture") return rows; // preserve RPC order (fixture order)
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
      case "consistency":
        return (CONSISTENCY_ORDER[a.consistency_label ?? "UNKNOWN"] ?? 4) -
               (CONSISTENCY_ORDER[b.consistency_label ?? "UNKNOWN"] ?? 4);
      default:
        return 0;
    }
  });
}

const SORT_OPTIONS: { key: TeamSortKey; label: string }[] = [
  { key: "fixture",     label: "Fixture order" },
  { key: "projection",  label: "Projection — high to low" },
  { key: "hit_rate",    label: "Hit rate — high to low" },
  { key: "recent_avg",  label: "Recent avg — high to low" },
  { key: "consistency", label: "Consistency — best first" },
];

// ── Lens config ───────────────────────────────────────────────────────────────

const LENSES: TeamStatLens[] = ["score", "goals", "scoring_shots", "disposals"];

// ── Fixture grouping ──────────────────────────────────────────────────────────

interface FixtureGroup {
  matchId: number;
  matchOrder: number;
  matchLabel: string;
  gameDate: string;
  venue: string;
  isLocked: boolean;
  isFree: boolean;
  homeRow: StatBoardTeamRow | null;
  awayRow: StatBoardTeamRow | null;
}

function groupRowsByFixture(rows: StatBoardTeamRow[]): FixtureGroup[] {
  const map = new Map<number, FixtureGroup>();
  for (const row of rows) {
    const existing = map.get(row.match_id);
    if (!existing) {
      map.set(row.match_id, {
        matchId:    row.match_id,
        matchOrder: row.match_order,
        matchLabel: row.match_label,
        gameDate:   row.game_date,
        venue:      row.venue,
        isLocked:   row.is_locked,
        isFree:     row.is_free_match,
        homeRow:    row.is_home ? row : null,
        awayRow:    row.is_home ? null : row,
      });
    } else {
      if (row.is_home) existing.homeRow = row;
      else existing.awayRow = row;
    }
  }
  // Sort by match_order (fixture order)
  return Array.from(map.values()).sort((a, b) => a.matchOrder - b.matchOrder);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatBoardTeamsPage() {
  // null = all matches for the round; number = specific match filter
  const [matchFilter, setMatchFilter] = useState<number | null>(null);
  const [lens, setLens] = useState<TeamStatLens>("score");
  const [sortKey, setSortKey] = useState<TeamSortKey>("fixture");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedTeamKey, setExpandedTeamKey] = useState<string | null>(null);
  const navigate = useNavigate();

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardTeamMatches();

  // Always fetch — null matchFilter = full round
  const { rows, loading: rowsLoading, error: rowsError } = useStatBoardTeamRows({
    matchId: matchFilter,
    lens,
  });

  function handleLensChange(newLens: TeamStatLens) {
    setLens(newLens);
    setExpandedTeamKey(null);
    track("Stat Board Team Lens Change", { lens: newLens });
  }

  function handleMatchFilter(id: number | null) {
    setMatchFilter(id);
    setExpandedTeamKey(null);
    track("Stat Board Team Match Filter", { match_id: id });
  }

  const handleToggleExpand = useCallback((key: string | null) => {
    setExpandedTeamKey(key);
  }, []);

  useEffect(() => {
    track("Page View", { path: "/stat-board/teams" });
  }, []);

  const thresholds  = teamThresholdsForLens(lens);
  const topThreshold = thresholds[0];

  const roundLabel = matches[0]?.round_label ?? "";
  const totalTeams = rows.length;
  const selectedMatchObj = matchFilter !== null
    ? matches.find((m) => m.match_id === matchFilter) ?? null
    : null;

  // Group rows into fixtures, then apply sort within each fixture
  const fixtures: FixtureGroup[] = useMemo(() => {
    const groups = groupRowsByFixture(rows);
    if (sortKey === "fixture") return groups;
    // For non-fixture sorts, still keep fixture groupings but sort rows inside
    return groups.map((g) => {
      const both = [g.homeRow, g.awayRow].filter(Boolean) as StatBoardTeamRow[];
      const sorted = sortRowsForFixture(both, sortKey, topThreshold);
      return { ...g, homeRow: sorted[0] ?? null, awayRow: sorted[1] ?? null };
    });
  }, [rows, sortKey, topThreshold]);

  const hasMatchFilter = matchFilter !== null;
  const isMatchLocked = selectedMatchObj?.is_locked ?? false;

  return (
    <>
      <Helmet>
        <title>AFL Team Stat Board | Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="View every AFL team's scoring trends, hit rates and projections for the round. Full round team board with stat lens filtering."
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
              View every team's scoring trends, hit rates and projections for the round.
            </p>
          </div>

          {/* Controls row */}
          <div className="mb-3 flex items-start gap-2 flex-wrap">
            {/* Match filter dropdown */}
            {matchesError ? (
              <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">
                Could not load matches
              </div>
            ) : (
              <MatchFilterDropdown
                matches={matches}
                selected={matchFilter}
                loading={matchesLoading}
                onChange={handleMatchFilter}
              />
            )}

            {/* Lens tabs */}
            <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5 flex-wrap">
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

            {/* Sort */}
            <div className="relative ml-auto shrink-0">
              <button
                onClick={() => setSortOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/8 px-2.5 py-1.5 text-[12px] font-medium text-white/60 hover:text-white/80 hover:bg-white/8 transition-colors focus:outline-none whitespace-nowrap"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
              >
                <span className="text-white/30 text-[11px] hidden sm:inline">Sort:</span>
                <span className="text-white/72">{SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "—"}</span>
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

          {/* Summary strip */}
          {!rowsLoading && rows.length > 0 && (
            <BoardSummaryStrip
              roundLabel={roundLabel}
              fixtureCount={hasMatchFilter ? 1 : fixtures.length}
              lens={lens}
              teamCount={totalTeams}
              hasMatchFilter={hasMatchFilter}
              onClearFilter={() => handleMatchFilter(null)}
            />
          )}

          {/* Locked match banner (only when a specific locked match is filtered) */}
          {hasMatchFilter && isMatchLocked && (
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
            <TeamBoardSkeleton thresholdCount={thresholds.length} fixtureCount={hasMatchFilter ? 1 : 4} />
          ) : fixtures.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-10 text-center">
              <p className="text-[15px] font-semibold text-white/75 mb-1.5">No team data found</p>
              <p className="text-[13px] text-white/38 max-w-xs mx-auto leading-relaxed">
                Data may not be available for this round yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              {fixtures.map((fixture) => (
                <FixtureSection
                  key={fixture.matchId}
                  fixture={fixture}
                  lens={lens}
                  thresholds={thresholds}
                  expandedTeamKey={expandedTeamKey}
                  onToggleExpand={handleToggleExpand}
                  onUnlockClick={() => navigate("/neeko-plus")}
                />
              ))}
            </div>
          )}

          {/* Freemium footer note when showing all fixtures */}
          {!rowsLoading && !hasMatchFilter && fixtures.length > 0 && (
            <div className="mt-8 flex items-center gap-3 text-[11px] text-white/28 px-1">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
                Free match
              </span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-2.5 w-2.5 text-[#F5C84C]/45" />
                Neeko+ required
              </span>
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

// ── Board summary strip ───────────────────────────────────────────────────────

interface BoardSummaryStripProps {
  roundLabel: string;
  fixtureCount: number;
  lens: TeamStatLens;
  teamCount: number;
  hasMatchFilter: boolean;
  onClearFilter: () => void;
}

function BoardSummaryStrip({
  roundLabel,
  fixtureCount,
  lens,
  teamCount,
  hasMatchFilter,
  onClearFilter,
}: BoardSummaryStripProps) {
  const roundDisplay = !roundLabel
    ? null
    : roundLabel === "OR"
    ? "Opening Round"
    : `Round ${roundLabel.replace("R", "")}`;

  const items: React.ReactNode[] = [];

  if (roundDisplay) {
    items.push(
      <span key="round" className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[10px] text-white/28 uppercase tracking-wide font-medium">Round</span>
        <span className="text-[11px] font-semibold text-white/72">{roundDisplay.replace("Round ", "")}</span>
      </span>
    );
  }

  if (!hasMatchFilter) {
    items.push(
      <span key="fixtures" className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[10px] text-white/28 uppercase tracking-wide font-medium">Fixtures</span>
        <span className="text-[11px] font-semibold text-white/72">{fixtureCount}</span>
      </span>
    );
  }

  items.push(
    <span key="lens" className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[10px] text-white/28 uppercase tracking-wide font-medium">Lens</span>
      <span className="text-[11px] font-semibold text-white/72">{teamLensLabel(lens)}</span>
    </span>
  );

  if (!hasMatchFilter) {
    items.push(
      <span key="teams" className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[10px] text-white/28 uppercase tracking-wide font-medium">Teams</span>
        <span className="text-[11px] font-semibold text-white/72">{teamCount}</span>
      </span>
    );

    items.push(
      <span key="free" className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" aria-hidden />
        <span className="text-[11px] font-semibold text-emerald-500/80">First 2 matches free</span>
      </span>
    );
  }

  if (hasMatchFilter) {
    items.push(
      <button
        key="clear"
        onClick={onClearFilter}
        className="flex items-center gap-1 text-[10px] font-semibold text-white/35 bg-white/6 border border-white/10 rounded px-1.5 py-0.5 hover:text-white/60 hover:bg-white/10 transition-colors leading-none whitespace-nowrap"
      >
        Clear filter
      </button>
    );
  }

  items.push(
    <span key="updated" className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 shrink-0 animate-[pulse_3s_ease-in-out_infinite]" aria-hidden />
      <span className="text-[11px] text-white/35">Updated before round lockout</span>
    </span>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <span className="h-3 w-px bg-white/10 shrink-0 hidden sm:block" aria-hidden />
          )}
          {item}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Fixture section ───────────────────────────────────────────────────────────

interface FixtureSectionProps {
  fixture: FixtureGroup;
  lens: TeamStatLens;
  thresholds: readonly number[];
  expandedTeamKey: string | null;
  onToggleExpand: (key: string | null) => void;
  onUnlockClick: () => void;
}

const FixtureSection = memo(function FixtureSection({
  fixture,
  lens,
  thresholds,
  expandedTeamKey,
  onToggleExpand,
  onUnlockClick,
}: FixtureSectionProps) {
  const isMobile = useIsMobile();
  const unit = teamLensUnit(lens);
  const { homeRow, awayRow, isLocked, isFree, matchLabel, gameDate, venue } = fixture;

  // Format date
  const dateStr = gameDate
    ? new Date(gameDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    : null;

  const venueShort = venue
    ? venue.replace(/ Stadium$/i, "").replace(/ Ground$/i, "").replace(/ Oval$/i, "").replace(/ Park$/i, "").trim()
    : null;

  const teams = parseMatchLabel(matchLabel);

  const rows = [homeRow, awayRow].filter(Boolean) as StatBoardTeamRow[];
  if (rows.length === 0) return null;

  return (
    <div>
      {/* Fixture header */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {isFree ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/65" aria-hidden />
          ) : isLocked ? (
            <Lock className="h-3 w-3 shrink-0 text-[#F5C84C]/50" aria-label="Neeko+ required" />
          ) : null}
          <h2 className="text-[13.5px] font-bold text-white tracking-tight leading-none truncate">
            {teams ? `${teams.home} vs ${teams.away}` : matchLabel}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {dateStr && (
            <span className="text-[10px] text-white/30">{dateStr}</span>
          )}
          {venueShort && (
            <span className="text-[10px] text-white/22 hidden sm:inline">
              <span className="text-white/12 mx-1">·</span>{venueShort}
            </span>
          )}
          {isLocked && (
            <button
              onClick={onUnlockClick}
              className="text-[9.5px] font-bold text-[#F5C84C]/70 bg-[#F5C84C]/8 border border-[#F5C84C]/18 rounded px-1.5 py-0.5 hover:bg-[#F5C84C]/14 transition-colors leading-none whitespace-nowrap"
            >
              Unlock
            </button>
          )}
        </div>
        <div className="flex-1 h-px bg-white/[0.06] ml-1 hidden sm:block" />
      </div>

      {/* Team rows — locked fixtures render as a single unified block */}
      {isLocked ? (
        isMobile ? (
          <LockedFixtureBlock
            homeRow={homeRow}
            awayRow={awayRow}
            lens={lens}
            thresholds={thresholds}
            onUnlockClick={onUnlockClick}
            isMobile={true}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#F5C84C]/15 bg-[#0d0d0d]">
            <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
              <thead>
                <tr className="border-b border-white/10 bg-[#0f0f0f]">
                  <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider whitespace-nowrap w-[180px]">Team</th>
                  <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider whitespace-nowrap">Recent</th>
                  <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-right whitespace-nowrap">Avg</th>
                  <th className="px-2 py-2.5 text-[10px] font-semibold text-[#F5C84C]/55 uppercase tracking-wider text-right whitespace-nowrap">Proj</th>
                  {thresholds.map((t) => (
                    <th key={t} className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap">
                      {t}+ <span className="font-normal opacity-60">{unit}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap">Consistency</th>
                  <th className="pr-3 pl-1 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                <LockedFixtureBlock
                  homeRow={homeRow}
                  awayRow={awayRow}
                  lens={lens}
                  thresholds={thresholds}
                  onUnlockClick={onUnlockClick}
                  isMobile={false}
                />
              </tbody>
            </table>
          </div>
        )
      ) : isMobile ? (
        <div className="flex flex-col gap-2 w-full min-w-0">
          {rows.map((row) => {
            const key = `${row.match_id}-${row.team_id}`;
            return (
              <MobileTeamCard
                key={key}
                row={row}
                lens={lens}
                thresholds={thresholds}
                isMatchLocked={false}
                isExpanded={expandedTeamKey === key}
                onToggleExpand={() => onToggleExpand(expandedTeamKey === key ? null : key)}
                onUnlockClick={onUnlockClick}
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d0d]">
          <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
            <thead>
              <tr className="border-b border-white/10 bg-[#0f0f0f]">
                <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider whitespace-nowrap w-[180px]">Team</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider whitespace-nowrap">Recent</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-right whitespace-nowrap">Avg</th>
                <th className="px-2 py-2.5 text-[10px] font-semibold text-[#F5C84C]/55 uppercase tracking-wider text-right whitespace-nowrap">Proj</th>
                {thresholds.map((t) => (
                  <th key={t} className="px-2 py-2.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider text-center whitespace-nowrap">
                    {t}+ <span className="font-normal opacity-60">{unit}</span>
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
                    isMatchLocked={false}
                    isExpanded={expandedTeamKey === key}
                    onToggleExpand={() => onToggleExpand(expandedTeamKey === key ? null : key)}
                    onUnlockClick={onUnlockClick}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

// ── Match filter dropdown ─────────────────────────────────────────────────────

interface MatchFilterDropdownProps {
  matches: StatBoardTeamMatch[];
  selected: number | null;
  loading: boolean;
  onChange: (id: number | null) => void;
}

function MatchFilterDropdown({ matches, selected, loading, onChange }: MatchFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = { current: null as HTMLDivElement | null };
  const triggerRef = { current: null as HTMLButtonElement | null };
  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function handleOpen() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 320);
    }
    setOpen((v) => !v);
  }

  if (loading) {
    return <div className="h-9 w-44 rounded-xl bg-white/5 border border-white/8 animate-pulse" />;
  }
  if (matches.length === 0) return null;

  const selectedMatch = selected !== null ? matches.find((m) => m.match_id === selected) ?? null : null;
  const triggerText = selectedMatch
    ? formatMatchShort(selectedMatch.match_label)
    : "All matches";

  const roundLabel = matches[0]?.round_label ?? "";
  const roundFull = roundLabel === "OR" ? "Opening Round" : `Round ${roundLabel.replace("R", "")}`;

  return (
    <div
      ref={(el) => { containerRef.current = el; }}
      className="relative shrink-0"
    >
      <button
        ref={(el) => { triggerRef.current = el; }}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 whitespace-nowrap
          ${open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/7 hover:border-white/16 hover:text-white/95"
          }`}
      >
        {selectedMatch?.is_locked ? (
          <Lock className="h-3 w-3 text-[#F5C84C]/55 shrink-0" />
        ) : selectedMatch?.is_free_match ? (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 shrink-0" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" />
        )}
        <span className="text-[12.5px] font-semibold leading-none">{triggerText}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ml-1 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Filter by match"
          style={{
            animation: "mfDropIn 120ms cubic-bezier(0.2,0,0,1) forwards",
            ...(dropUp
              ? { bottom: "calc(100% + 6px)", top: "auto" }
              : { top: "calc(100% + 6px)", bottom: "auto" }),
          }}
          className="absolute left-0 z-50 w-[280px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden"
        >
          <style>{`
            @keyframes mfDropIn {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* "All matches" option */}
          <button
            role="option"
            aria-selected={selected === null}
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors duration-75 border-b border-white/[0.06]
              ${selected === null ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"}`}
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              {selected === null ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-white/20" />
              )}
            </span>
            <div>
              <p className="text-[12.5px] font-semibold text-white/90 leading-tight">All matches</p>
              <p className="text-[10px] text-white/30 mt-0.5">{roundFull} · {matches.length} fixtures</p>
            </div>
          </button>

          {/* Individual matches */}
          <div className="px-3.5 pt-2.5 pb-1 flex items-center gap-2">
            <span className="text-[9.5px] font-bold text-white/25 uppercase tracking-widest shrink-0">
              {roundFull}
            </span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <div className="overflow-y-auto overscroll-contain pb-1.5" style={{ maxHeight: "min(320px, calc(100vh - 200px))" }}>
            {matches.map((m) => {
              const isSel = selected === m.match_id;
              const teams = parseMatchLabel(m.match_label);
              const dateStr = m.game_date
                ? new Date(m.game_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
                : null;
              return (
                <button
                  key={m.match_id}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => { onChange(m.match_id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-75
                    ${isSel
                      ? "bg-white/[0.09]"
                      : m.is_locked
                      ? "hover:bg-white/[0.035] opacity-80 hover:opacity-100"
                      : "hover:bg-white/[0.055]"
                    }`}
                >
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">
                    {isSel ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : m.is_locked ? (
                      <Lock className="h-3 w-3 text-[#F5C84C]/45" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-emerald-500/55" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12.5px] font-semibold leading-tight truncate ${isSel ? "text-white" : m.is_locked ? "text-white/50" : "text-white/80"}`}>
                      {teams ? `${teams.home} vs ${teams.away}` : m.match_label}
                    </p>
                    {dateStr && (
                      <p className="text-[10px] text-white/28 mt-0.5 leading-none">{dateStr}</p>
                    )}
                  </div>
                  {m.is_free_match && !isSel && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-emerald-500/70 bg-emerald-500/8 rounded px-1.5 py-0.5 leading-none">
                      Free
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-3.5 py-2 border-t border-white/[0.07] bg-white/[0.015] flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" />
              <span className="text-[10px] text-white/28">Free</span>
            </span>
            <span className="text-white/12">·</span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-2.5 w-2.5 text-[#F5C84C]/40 shrink-0" />
              <span className="text-[10px] text-white/28">Neeko+ required</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

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

  return (
    <div
      data-sort-dropdown
      role="listbox"
      aria-label="Sort options"
      className="absolute right-0 top-full z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden"
    >
      {SORT_OPTIONS.map((opt) => (
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

function TeamBoardSkeleton({ thresholdCount, fixtureCount }: { thresholdCount: number; fixtureCount: number }) {
  const colCount = 4 + thresholdCount + 2;
  return (
    <div className="space-y-8">
      {Array.from({ length: fixtureCount }).map((_, g) => (
        <div key={g}>
          {/* Fixture header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3.5 w-48 rounded-md bg-white/6 animate-pulse" />
            <div className="h-px flex-1 bg-white/[0.05]" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d0d]">
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
                      <div className="h-2 w-16 rounded bg-white/4 animate-pulse" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-[3px] items-end justify-center">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div key={j} style={{ height: 12 + j * 3 }} className="w-[14px] rounded-sm bg-white/4 animate-pulse" />
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMatchLabel(label: string): { home: string; away: string } | null {
  const m = label.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (!m) return null;
  const abbrev = (name: string) => name.replace(/ (Football Club|F\.?C\.?|AFC)$/i, "").trim();
  return { home: abbrev(m[1].trim()), away: abbrev(m[2].trim()) };
}

function formatMatchShort(label: string): string {
  const teams = parseMatchLabel(label);
  if (!teams) return label;
  return `${teams.home} vs ${teams.away}`;
}
