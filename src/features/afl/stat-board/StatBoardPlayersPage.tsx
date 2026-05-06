import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Helmet } from "react-helmet-async";
import { Search, X, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { track } from "@/lib/analytics";

import {
  useStatBoardMatches,
  useStatBoardPlayers,
} from "./useStatBoard";
import type {
  StatBoardMatch,
  StatBoardPlayer,
  StatLens,
  PositionFilter,
} from "./types";
import { defaultThreshold, thresholdsForLens } from "./types";
import { MatchSelector } from "./components/MatchSelector";
import { BoardRow } from "./components/BoardRow";

export type SortKey = "projection" | "hit_rate" | "recent_avg" | "name" | "consistency";

function sortOptions(lens: StatLens): { key: SortKey; label: string }[] {
  const stat = lens === "disposals" ? "Disposal" : "Goal";
  return [
    { key: "projection",  label: `${stat} projection — high to low` },
    { key: "hit_rate",    label: `${stat} hit rate — high to low` },
    { key: "recent_avg",  label: `${stat} recent avg — high to low` },
    { key: "name",        label: "Name — A to Z" },
    { key: "consistency", label: "Consistency — best first" },
  ];
}

const CONSISTENCY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

function hasNoData(p: StatBoardPlayer): boolean {
  const values = p.last_10_values ?? [];
  return values.length === 0 && (p.projection == null || p.projection === 0) && p.last_10_avg == null;
}

// Sorting uses fields already computed per-lens by the RPC:
// - projection, last_10_avg, hit_rate_last_10 all reflect the active stat lens.
function sortPlayers(players: StatBoardPlayer[], sortKey: SortKey): StatBoardPlayer[] {
  return [...players].sort((a, b) => {
    const aEmpty = hasNoData(a);
    const bEmpty = hasNoData(b);
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

    switch (sortKey) {
      case "projection":
        return (b.projection ?? 0) - (a.projection ?? 0);
      case "hit_rate":
        return (b.hit_rate_last_10 ?? 0) - (a.hit_rate_last_10 ?? 0);
      case "recent_avg":
        return (Number(b.last_10_avg) || 0) - (Number(a.last_10_avg) || 0);
      case "name":
        return a.player_name.localeCompare(b.player_name);
      case "consistency":
        return (CONSISTENCY_ORDER[a.confidence_label ?? "LOW"] ?? 2) -
               (CONSISTENCY_ORDER[b.confidence_label ?? "LOW"] ?? 2);
      default:
        return 0;
    }
  });
}

function sortButtonLabel(sortKey: SortKey): string {
  switch (sortKey) {
    case "projection":  return "Projection ↓";
    case "hit_rate":    return "Hit rate ↓";
    case "recent_avg":  return "Recent avg ↓";
    case "name":        return "Name A–Z";
    case "consistency": return "Consistency ↓";
  }
}

export default function StatBoardPlayersPage() {
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  const threshold = defaultThreshold(lens);
  const thresholds = thresholdsForLens(lens);

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardMatches();

  const { players, loading: playersLoading, error: playersError } = useStatBoardPlayers({
    matchId: selectedMatch?.match_id ?? null,
    lens,
    threshold,
    positionFilter,
    search,
  });

  // Auto-select default match
  useEffect(() => {
    if (matches.length === 0 || selectedMatch !== null) return;
    const maxWeek = Math.max(...matches.map((m) => m.week));
    const latestRound = matches.filter((m) => m.week === maxWeek);
    const defaultMatch =
      latestRound.find((m) => m.is_free_match && m.match_order === 1) ??
      latestRound.find((m) => m.is_free_match) ??
      latestRound.find((m) => m.match_order === 1) ??
      latestRound[0] ??
      matches[matches.length - 1];
    setSelectedMatch(defaultMatch);
  }, [matches, selectedMatch]);

  // Sticky controls: show when controls div scrolls above viewport
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setSortKey("projection");
    setExpandedPlayerId(null);
    track("Stat Board Lens Change", { lens: newLens });
  }

  function handleMatchChange(match: StatBoardMatch) {
    setSelectedMatch(match);
    setExpandedPlayerId(null);
    track("Stat Board Match Change", { match_id: match.match_id, match_label: match.match_label });
  }

  const { homePlayers, awayPlayers } = useMemo(() => {
    if (!selectedMatch) return { homePlayers: [], awayPlayers: [] };
    const home: StatBoardPlayer[] = [];
    const away: StatBoardPlayer[] = [];
    for (const p of players) {
      if (p.team_id === selectedMatch.home_team_id) home.push(p);
      else away.push(p);
    }
    return {
      homePlayers: sortPlayers(home, sortKey),
      awayPlayers: sortPlayers(away, sortKey),
    };
  }, [players, selectedMatch, sortKey]);

  // Stable callback — prevents TeamBoard memo from busting on every render
  const handleToggleExpand = useCallback((id: number | null) => {
    setExpandedPlayerId(id);
  }, []);

  useEffect(() => {
    track("Page View", { path: "/stat-board/players" });
  }, []);

  const isLocked = selectedMatch?.is_locked ?? false;

  return (
    <>
      <Helmet>
        <title>AFL Player Stat Board | Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals."
        />
      </Helmet>

      {/* Sticky controls bar — appears when inline controls scroll out of view */}
      {stickyVisible && (
        <StickyControlsBar
          matches={matches}
          selectedMatch={selectedMatch}
          matchesLoading={matchesLoading}
          lens={lens}
          positionFilter={positionFilter}
          search={search}
          sortKey={sortKey}
          sortOpen={sortOpen}
          onMatchChange={handleMatchChange}
          onLensChange={handleLensChange}
          onPositionChange={setPositionFilter}
          onSearchChange={setSearch}
          onSortChange={setSortKey}
          onSortOpenChange={setSortOpen}
        />
      )}

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-20">

          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-white">AFL Player Stat Board</h1>
            <p className="mt-1 text-sm text-white/50 max-w-xl leading-relaxed">
              Pick a match, choose a stat, and compare every player's recent trends, hit rates and projections.
            </p>
          </div>

          {/* Match selector */}
          {matchesError ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load matches. Please try refreshing.
            </div>
          ) : (
            <MatchSelector
              matches={matches}
              selected={selectedMatch}
              loading={matchesLoading}
              onChange={handleMatchChange}
            />
          )}

          {/* ── Inline controls (observed for sticky trigger) ─────────────────── */}
          <div ref={controlsRef} className="mb-4 space-y-3">

            {/* Row 1: Stat + Position */}
            <div className="flex flex-wrap items-start gap-4">

              {/* Stat toggle */}
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Stat</p>
                <div className="flex gap-1 rounded-xl bg-white/5 border border-white/8 p-1">
                  {(["disposals", "goals"] as StatLens[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleLensChange(l)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        lens === l
                          ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {l === "disposals" ? "Disposals" : "Goals"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position filter */}
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Position</p>
                <div className="flex gap-1 flex-wrap">
                  {POSITION_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setPositionFilter(key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        positionFilter === key
                          ? "bg-white/15 text-white ring-1 ring-white/25"
                          : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Search + Sort */}
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search player..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/8 pl-8 pr-8 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/22 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-xs font-medium text-white/60 hover:text-white/80 hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 whitespace-nowrap"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                >
                  <span className="text-white/32 text-[10px]">Sort:</span>
                  <span className="text-white/72">{sortButtonLabel(sortKey)}</span>
                  <ChevronDown className={`h-3 w-3 text-white/30 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
                </button>

                {sortOpen && (
                  <SortDropdown
                    current={sortKey}
                    options={sortOptions(lens)}
                    onSelect={(k) => { setSortKey(k); setSortOpen(false); }}
                    onClose={() => setSortOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Context row */}
          {!playersLoading && selectedMatch && (
            <div className="mb-5 flex items-center gap-1.5 flex-wrap text-[12px] text-white/48">
              <span className="text-white/30 text-[11px]">Viewing:</span>
              {[
                selectedMatch.match_label,
                lens === "disposals" ? "Disposals" : "Goals",
                players.length > 0 ? `${players.length} players` : null,
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-white/20">·</span>}
                    <span>{part}</span>
                  </span>
                ))}
            </div>
          )}

          {/* Locked banner */}
          {isLocked && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#F5C84C]">Unlock full round</p>
                <p className="text-xs text-white/45 mt-0.5">
                  Upgrade to Neeko+ to see projections and hit rates for all matches.
                </p>
              </div>
            </div>
          )}

          {/* Players error */}
          {playersError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load players. Please try again.
            </div>
          )}

          {/* Player board */}
          {playersLoading ? (
            <BoardSkeleton thresholdCount={thresholds.length} />
          ) : players.length === 0 && selectedMatch ? (
            <NoPlayersState
              positionFilter={positionFilter}
              search={search}
              lens={lens}
              onResetPosition={() => setPositionFilter("ALL")}
              onResetSearch={() => setSearch("")}
              onResetAll={() => { setPositionFilter("ALL"); setSearch(""); }}
            />
          ) : (
            <div className="space-y-8">
              <TeamBoard
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={handleToggleExpand}
                searchActive={search.trim().length > 0}
              />
              <TeamBoard
                teamName={selectedMatch?.away_team_name ?? "Away"}
                opponentName={selectedMatch?.home_team_name ?? "Home"}
                players={awayPlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={handleToggleExpand}
                searchActive={search.trim().length > 0}
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

// ── Sticky controls bar ───────────────────────────────────────────────────────

interface StickyControlsBarProps {
  matches: StatBoardMatch[];
  selectedMatch: StatBoardMatch | null;
  matchesLoading: boolean;
  lens: StatLens;
  positionFilter: PositionFilter;
  search: string;
  sortKey: SortKey;
  sortOpen: boolean;
  onMatchChange: (m: StatBoardMatch) => void;
  onLensChange: (l: StatLens) => void;
  onPositionChange: (p: PositionFilter) => void;
  onSearchChange: (s: string) => void;
  onSortChange: (k: SortKey) => void;
  onSortOpenChange: (v: boolean) => void;
}

function StickyControlsBar({
  matches,
  selectedMatch,
  matchesLoading,
  lens,
  positionFilter,
  search,
  sortKey,
  sortOpen,
  onMatchChange,
  onLensChange,
  onPositionChange,
  onSearchChange,
  onSortChange,
  onSortOpenChange,
}: StickyControlsBarProps) {
  return (
    <div
      className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-md"
      style={{ animation: "stickySlideDown 150ms cubic-bezier(0.2,0,0,1) both" }}
    >
      <style>{`
        @keyframes stickySlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="mx-auto max-w-5xl px-4 py-2.5 flex flex-wrap items-center gap-2">

        {/* Match selector (compact) */}
        <div className="shrink-0">
          <MatchSelector
            matches={matches}
            selected={selectedMatch}
            loading={matchesLoading}
            onChange={onMatchChange}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Stat toggle */}
          <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5">
            {(["disposals", "goals"] as StatLens[]).map((l) => (
              <button
                key={l}
                onClick={() => onLensChange(l)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  lens === l
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                    : "text-white/45 hover:text-white/75"
                }`}
              >
                {l === "disposals" ? "Disp" : "Goals"}
              </button>
            ))}
          </div>

          {/* Position filter */}
          <div className="flex gap-0.5">
            {POSITION_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onPositionChange(key)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                  positionFilter === key
                    ? "bg-white/15 text-white ring-1 ring-white/25"
                    : "bg-white/5 text-white/38 hover:bg-white/10 hover:text-white/65"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/22 pointer-events-none" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-32 sm:w-40 rounded-lg bg-white/5 border border-white/8 pl-7 pr-6 py-1.5 text-[11px] text-white placeholder:text-white/22 focus:outline-none focus:border-white/22 transition-colors"
            />
            {search && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/22 hover:text-white/50"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => onSortOpenChange(!sortOpen)}
              className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/55 hover:text-white/80 hover:bg-white/8 transition-colors whitespace-nowrap"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              {sortButtonLabel(sortKey)}
              <ChevronDown className={`h-3 w-3 text-white/28 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>
            {sortOpen && (
              <SortDropdown
                current={sortKey}
                options={sortOptions(lens)}
                onSelect={(k) => { onSortChange(k); onSortOpenChange(false); }}
                onClose={() => onSortOpenChange(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── No-players empty state ────────────────────────────────────────────────────

function NoPlayersState({
  positionFilter,
  search,
  lens,
  onResetPosition,
  onResetSearch,
  onResetAll,
}: {
  positionFilter: PositionFilter;
  search: string;
  lens: StatLens;
  onResetPosition: () => void;
  onResetSearch: () => void;
  onResetAll: () => void;
}) {
  const hasPosition = positionFilter !== "ALL";
  const hasSearch = search.trim().length > 0;
  const statLabel = lens === "disposals" ? "disposal" : "goal";

  const posLabel: Record<PositionFilter, string> = {
    ALL:  "player",
    MID:  "midfielder",
    DEF:  "defender",
    FWD:  "forward",
    RUCK: "ruck",
  };
  const pos = posLabel[positionFilter];

  let heading: string;
  let sub: string;

  if (hasPosition && positionFilter === "RUCK" && !hasSearch) {
    heading = "No ruck players found for this match";
    sub = "Ruck players may not have enough data for this match yet.";
  } else if (hasPosition && hasSearch) {
    heading = `No ${pos} players matching "${search.trim()}"`;
    sub = "Try broadening your search or clearing the position filter.";
  } else if (hasPosition) {
    heading = `No ${pos} players found for this match`;
    sub = `This match may not have any ${pos}s with ${statLabel} data yet.`;
  } else if (hasSearch) {
    heading = `No players matched your search`;
    sub = `No results for "${search.trim()}". Check the spelling or try a shorter name.`;
  } else {
    heading = "No players found for this match";
    sub = "Data may not be available yet for this match.";
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-white/75 mb-1.5">{heading}</p>
      <p className="text-[13px] text-white/38 mb-6 max-w-xs mx-auto leading-relaxed">{sub}</p>

      {(hasPosition || hasSearch) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {hasPosition && (
            <button
              onClick={onResetPosition}
              className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/85 transition-colors"
            >
              Reset position
            </button>
          )}
          {hasSearch && (
            <button
              onClick={onResetSearch}
              className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/85 transition-colors"
            >
              Clear search
            </button>
          )}
          {hasPosition && hasSearch && (
            <button
              onClick={onResetAll}
              className="rounded-lg border border-white/18 bg-white/8 px-3.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/14 hover:text-white transition-colors"
            >
              Reset all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  current,
  options,
  onSelect,
  onClose,
}: {
  current: SortKey;
  options: { key: SortKey; label: string }[];
  onSelect: (k: SortKey) => void;
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
      className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden"
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

// ── Team board ────────────────────────────────────────────────────────────────

const TOP_N = 8;

interface TeamBoardProps {
  teamName: string;
  opponentName: string;
  players: StatBoardPlayer[];
  lens: StatLens;
  thresholds: readonly number[];
  defaultThreshold: number;
  isMatchLocked: boolean;
  expandedPlayerId: number | null;
  onToggleExpand: (id: number | null) => void;
  searchActive: boolean;
}

const TeamBoard = memo(function TeamBoard({
  teamName,
  opponentName,
  players,
  lens,
  thresholds,
  defaultThreshold,
  isMatchLocked,
  expandedPlayerId,
  onToggleExpand,
  searchActive,
}: TeamBoardProps) {
  const [showAll, setShowAll] = useState(false);

  // Reset "show all" whenever the player list identity changes (new match/filter)
  const prevPlayersRef = useRef(players);
  if (prevPlayersRef.current !== players) {
    prevPlayersRef.current = players;
    if (showAll) setShowAll(false);
  }

  if (players.length === 0) return null;

  const isHome: boolean | null = players[0]?.is_home ?? null;

  const needsCap = !searchActive && players.length > TOP_N;
  const isCapped = needsCap && !showAll;
  const visiblePlayers = useMemo(
    () => (isCapped ? players.slice(0, TOP_N) : players),
    [players, isCapped]
  );
  const totalCount = players.length;
  const hiddenCount = totalCount - TOP_N;

  const headerCount = searchActive
    ? `${totalCount} ${totalCount === 1 ? "player" : "players"} found`
    : isCapped
    ? `${TOP_N} of ${totalCount} shown`
    : `${totalCount} ${totalCount === 1 ? "player" : "players"}`;

  return (
    <div>
      {/* ── Team section header — team name, count, pills only ── */}
      <div className="mb-3 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[14px] font-bold text-white tracking-tight leading-none shrink-0">
              {teamName}
            </h2>
            <span className="text-[11px] text-white/32 font-medium whitespace-nowrap leading-none">
              · {headerCount}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-white/38 bg-white/6 border border-white/8 rounded-full px-2.5 py-0.5 whitespace-nowrap">
              vs {opponentName}
            </span>
            {isHome === true && (
              <span className="text-[10px] font-semibold text-emerald-500/70 bg-emerald-500/8 border border-emerald-500/15 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                Home
              </span>
            )}
            {isHome === false && (
              <span className="text-[10px] font-semibold text-white/32 bg-white/5 border border-white/8 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                Away
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Horizontally scrollable table ── */}
      <div className="overflow-x-auto rounded-t-2xl border border-white/10 bg-[#0d0d0d]">
        <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
          <thead>
            <tr className="border-b border-white/10 bg-[#0f0f0f]">
              <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                Player
              </th>
              <th className="px-2 py-2.5 text-center whitespace-nowrap">
                {/* Recent header with BYE/DNP legend */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Recent</span>
                  <div className="flex items-center gap-2" aria-label="Legend">
                    <span className="flex items-center gap-0.5 text-[8px] text-white/22">
                      <span className="inline-block w-5 h-3.5 rounded-sm bg-white/4 border border-white/8 text-center leading-[14px] font-bold text-[7px]">BYE</span>
                      <span>= bye</span>
                    </span>
                    <span className="flex items-center gap-0.5 text-[8px] text-white/22">
                      <span className="inline-block w-5 h-3.5 rounded-sm bg-white/4 border border-dashed border-white/12 text-center leading-[14px] font-bold text-[7px]">DNP</span>
                      <span>= did not play</span>
                    </span>
                  </div>
                </div>
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right whitespace-nowrap">
                Recent Avg
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right whitespace-nowrap">
                Proj
              </th>
              {thresholds.map((t) => (
                <th
                  key={t}
                  className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap"
                >
                  {t}+ Hit
                </th>
              ))}
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap">
                Consistency
              </th>
              <th className="pr-3 pl-1 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player) => (
              <BoardRow
                key={player.player_id}
                player={player}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={defaultThreshold}
                isMatchLocked={isMatchLocked}
                isExpanded={expandedPlayerId === player.player_id}
                onToggleExpand={() =>
                  onToggleExpand(expandedPlayerId === player.player_id ? null : player.player_id)
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bottom expand/collapse control — only when cap applies ── */}
      {needsCap && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`
            w-full flex items-center justify-center gap-2
            rounded-b-2xl border-x border-b border-white/10
            bg-[#0d0d0d] hover:bg-white/[0.04]
            px-4 py-2.5
            text-[11px] font-medium text-white/40 hover:text-white/65
            transition-colors
          `}
          aria-expanded={showAll}
          aria-label={showAll ? "Show fewer players" : `Show all ${totalCount} players`}
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Show fewer players
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Show {hiddenCount} more {hiddenCount === 1 ? "player" : "players"}
            </>
          )}
        </button>
      )}

      {/* When no cap, round bottom of table normally */}
      {!needsCap && (
        <div className="h-px" />
      )}
    </div>
  );
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BoardSkeleton({ thresholdCount }: { thresholdCount: number }) {
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
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.06] last:border-b-0">
                    <td className="pl-4 pr-2 py-3">
                      <div className="h-3 w-28 rounded bg-white/6 animate-pulse mb-1" />
                      <div className="h-2 w-16 rounded bg-white/4 animate-pulse" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div key={j} className="h-5 w-4 rounded bg-white/4 animate-pulse" />
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
