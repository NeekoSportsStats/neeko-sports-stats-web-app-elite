import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Search, X, Lock, ChevronDown } from "lucide-react";
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

export default function StatBoardPlayersPage() {
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  // Fixed default threshold per lens — used for RPC and expanded detail emphasis only.
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

  useEffect(() => {
    if (matches.length === 0 || selectedMatch !== null) return;
    // Prefer the first free match (match_order <= 2) of the latest week.
    // Falls back to match_order === 1 of the latest week, then the last match overall.
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

  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setSortKey("projection"); // reset to projection so new lens data drives order
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

  useEffect(() => {
    track("Page View", { path: "/stat-board/players" });
  }, []);

  const isLocked = selectedMatch?.is_locked ?? false;
  const lensLabel = lens === "disposals" ? "Disposals" : "Goals";
  const sortButtonLabel = (() => {
    switch (sortKey) {
      case "projection":  return "Projection ↓";
      case "hit_rate":    return "Hit rate ↓";
      case "recent_avg":  return "Recent avg ↓";
      case "name":        return "Name A–Z";
      case "consistency": return "Consistency ↓";
    }
  })();

  const playerCount = players.length;

  return (
    <>
      <Helmet>
        <title>AFL Player Stat Board | Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals."
        />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-20">

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-xl font-bold tracking-tight text-white">AFL Player Stat Board</h1>
            <p className="mt-1.5 text-sm text-white/50 max-w-xl leading-relaxed">
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

          {/* ── Controls ──────────────────────────────────────────────────────── */}
          <div className="mb-5 space-y-3">

            {/* Row 1: Stat + Position */}
            <div className="flex flex-wrap items-start gap-5">

              {/* Stat */}
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Stat</p>
                <div className="flex gap-1.5 rounded-xl bg-white/5 border border-white/8 p-1">
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

              {/* Position */}
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Position</p>
                <div className="flex gap-1">
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
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
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

              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-xs font-medium text-white/60 hover:text-white/80 hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                >
                  <span className="text-white/32 text-[10px]">Sort:</span>
                  <span className="text-white/72">{sortButtonLabel}</span>
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
            <div className="mt-2 mb-6 flex items-center gap-1.5 flex-wrap text-[12px] text-white/48">
              <span className="text-white/30 text-[11px]">Viewing:</span>
              {[
                selectedMatch.match_label,
                lensLabel,
                playerCount > 0 ? `${playerCount} players` : null,
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
            <div className="space-y-10">
              <TeamBoard
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={setExpandedPlayerId}
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
                onToggleExpand={setExpandedPlayerId}
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

// ── No-players empty state ────────────────────────────────────────────────────

const POSITION_LABELS: Record<string, string> = {
  MID: "midfielder",
  DEF: "defender",
  FWD: "forward",
  RUCK: "ruck",
};

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
  const posLabel = POSITION_LABELS[positionFilter] ?? positionFilter.toLowerCase();

  let heading: string;
  let sub: string;

  if (hasPosition && hasSearch) {
    heading = `No ${posLabel} players matching "${search.trim()}"`;
    sub = `Try broadening your search or clearing the position filter.`;
  } else if (hasPosition) {
    heading = `No ${posLabel} players found for this match`;
    sub = `This match may not have any ${posLabel}s with ${statLabel} data yet.`;
  } else if (hasSearch) {
    heading = `No players matching "${search.trim()}"`;
    sub = `Check the spelling or try a shorter name.`;
  } else {
    heading = "No players found for this match";
    sub = "Data may not be available yet for the selected match.";
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
      className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden"
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

function TeamBoard({
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
  // Per-team expanded state: true = show all players, false = show top 8
  const [showAll, setShowAll] = useState(false);

  if (players.length === 0) return null;

  // When search is active, always show all matching players — no cap.
  const isCapped = !searchActive && players.length > TOP_N && !showAll;
  const visiblePlayers = isCapped ? players.slice(0, TOP_N) : players;
  const hiddenCount = players.length - TOP_N;

  const thresholdHeaderLabel = (t: number) => `${t}+`;

  const visibleCount = visiblePlayers.length;
  const totalCount = players.length;
  const countLabel = searchActive
    ? `${totalCount} ${totalCount === 1 ? "player" : "players"} found`
    : isCapped
    ? `${visibleCount} of ${totalCount} players shown`
    : `${totalCount} ${totalCount === 1 ? "player" : "players"}`;

  return (
    <div>
      {/* Team section header */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        {/* Left: team name + count */}
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-[14px] font-bold text-white tracking-tight leading-none shrink-0">
            {teamName}
          </h2>
          <span className="text-[11px] text-white/32 font-medium whitespace-nowrap leading-none">
            · {countLabel}
          </span>
        </div>

        {/* Right: opponent pill + show-all toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold text-white/35 bg-white/6 border border-white/8 rounded-full px-2.5 py-0.5 whitespace-nowrap">
            vs {opponentName}
          </span>
          {!searchActive && players.length > TOP_N && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-[10px] font-medium text-white/38 hover:text-white/65 transition-colors whitespace-nowrap"
            >
              {showAll ? "Show fewer" : `Show all ${totalCount}`}
            </button>
          )}
        </div>
      </div>

      {/* Horizontally scrollable table */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0d0d0d]">
        <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
          <thead>
            <tr className="border-b border-white/10 bg-[#0f0f0f]">
              <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                Player
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap">
                Recent
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
                  {thresholdHeaderLabel(t)} Hit
                </th>
              ))}
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap">
                Consistency
              </th>
              <th className="pr-3 pl-1 py-2.5 w-10" />
            </tr>
          </thead>
          {/* Rows carry their own border-b — no tbody divide needed */}
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

        {/* ── Show more / fewer footer ── */}
        {!searchActive && players.length > TOP_N && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-3 border-t border-white/[0.07] text-[12px] font-medium text-white/45 hover:text-white/70 hover:bg-white/[0.025] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
          >
            {showAll ? (
              <>
                <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
                Show fewer players
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                Show remaining {hiddenCount} {hiddenCount === 1 ? "player" : "players"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BoardSkeleton({ thresholdCount }: { thresholdCount: number }) {
  const colCount = 4 + thresholdCount + 2;
  return (
    <div className="space-y-10">
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
