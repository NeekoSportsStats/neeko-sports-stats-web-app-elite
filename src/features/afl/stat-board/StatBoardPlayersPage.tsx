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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "projection",  label: "Projection — high to low" },
  { key: "hit_rate",    label: "Hit rate — high to low" },
  { key: "recent_avg",  label: "Recent average — high to low" },
  { key: "name",        label: "Name — A to Z" },
  { key: "consistency", label: "Consistency — best first" },
];

const CONSISTENCY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

/** Returns true if the player has no usable recent stat data */
function hasNoData(p: StatBoardPlayer): boolean {
  const values = p.last_10_values ?? [];
  return values.length === 0 && (p.projection == null || p.projection === 0) && p.last_10_avg == null;
}

function sortPlayers(players: StatBoardPlayer[], sortKey: SortKey): StatBoardPlayer[] {
  return [...players].sort((a, b) => {
    // No-data rows always last
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
  const [threshold, setThreshold] = useState<number>(20);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardMatches();

  // Threshold only affects hit-rate column display — all players for the match are always loaded
  const { players, loading: playersLoading, error: playersError } = useStatBoardPlayers({
    matchId: selectedMatch?.match_id ?? null,
    lens,
    threshold,
    positionFilter,
    search,
  });

  useEffect(() => {
    if (matches.length > 0 && selectedMatch === null) {
      const first = matches.find((m) => m.match_order === 1) ?? matches[0];
      setSelectedMatch(first);
    }
  }, [matches, selectedMatch]);

  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setThreshold(defaultThreshold(newLens));
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

  const thresholds = thresholdsForLens(lens);
  const isLocked = selectedMatch?.is_locked ?? false;
  const lensLabel = lens === "disposals" ? "Disposals" : "Goals";
  const currentSortOption = SORT_OPTIONS.find((o) => o.key === sortKey);
  // Short label for the button
  const sortButtonLabel = (() => {
    switch (sortKey) {
      case "projection":  return "Projection ↓";
      case "hit_rate":    return "Hit rate ↓";
      case "recent_avg":  return "Rec avg ↓";
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
          <div className="mb-5">
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

          {/* ── Controls ─────────────────────────────────────────────────────── */}
          <div className="mb-2 space-y-3">

            {/* Row 1: Stat + Line focus + Position */}
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

              {/* Line focus */}
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Line focus</p>
                <div className="flex gap-1">
                  {thresholds.map((t) => (
                    <button
                      key={t}
                      onClick={() => setThreshold(t)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        threshold === t
                          ? "bg-[#F5C84C]/20 text-[#F5C84C] ring-1 ring-[#F5C84C]/35"
                          : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70"
                      }`}
                    >
                      {t}+
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-white/32 leading-snug">
                  Sets the main hit-rate column. Player list stays the same.
                </p>
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
                    options={SORT_OPTIONS}
                    onSelect={(k) => { setSortKey(k); setSortOpen(false); }}
                    onClose={() => setSortOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Context row */}
          {!playersLoading && selectedMatch && (
            <div className="mt-1 mb-4 flex items-center gap-1.5 flex-wrap text-[12px] text-white/48">
              <span className="text-white/30 text-[11px]">Viewing:</span>
              {[
                selectedMatch.match_label,
                lensLabel,
                `${threshold}+ line`,
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
            <BoardSkeleton />
          ) : players.length === 0 && selectedMatch ? (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/45">
              No players found for this match and filter.
            </div>
          ) : (
            <div className="space-y-6">
              <TeamBoard
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                threshold={threshold}
                isMatchLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={setExpandedPlayerId}
              />
              <TeamBoard
                teamName={selectedMatch?.away_team_name ?? "Away"}
                opponentName={selectedMatch?.home_team_name ?? "Home"}
                players={awayPlayers}
                lens={lens}
                threshold={threshold}
                isMatchLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={setExpandedPlayerId}
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

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  current,
  options,
  onSelect,
  onClose,
}: {
  current: SortKey;
  options: typeof SORT_OPTIONS;
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

interface TeamBoardProps {
  teamName: string;
  opponentName: string;
  players: StatBoardPlayer[];
  lens: StatLens;
  threshold: number;
  isMatchLocked: boolean;
  expandedPlayerId: number | null;
  onToggleExpand: (id: number | null) => void;
}

function TeamBoard({
  teamName,
  opponentName,
  players,
  lens,
  threshold,
  isMatchLocked,
  expandedPlayerId,
  onToggleExpand,
}: TeamBoardProps) {
  if (players.length === 0) return null;

  return (
    <div>
      {/* Team header */}
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-white/90">{teamName}</h2>
        <span className="text-xs text-white/42">vs {opponentName}</span>
      </div>

      {/* Column headers — desktop only, sticky */}
      <div className="hidden md:grid md:grid-cols-[1fr_130px_60px_60px_96px_84px_32px] gap-x-3 items-center px-3 pb-1.5 text-[10px] font-semibold text-white/38 uppercase tracking-wider sticky top-0 bg-[#0a0a0a] z-10 pt-1">
        <span>Player</span>
        <span className="text-center">Recent</span>
        <span className="text-right">Rec avg</span>
        <span className="text-right">Proj</span>
        <span className="text-center">{threshold}+ hit</span>
        <span className="text-center">Consistency</span>
        <span />
      </div>

      {/* Rows */}
      <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/[0.06]">
        {players.map((player) => (
          <BoardRow
            key={player.player_id}
            player={player}
            lens={lens}
            threshold={threshold}
            isMatchLocked={isMatchLocked}
            isExpanded={expandedPlayerId === player.player_id}
            onToggleExpand={() =>
              onToggleExpand(expandedPlayerId === player.player_id ? null : player.player_id)
            }
          />
        ))}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="h-4 w-32 rounded-lg bg-white/6 mb-3 animate-pulse" />
          <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/[0.06]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 px-3 flex items-center gap-3 animate-pulse">
                <div className="h-3 w-28 rounded-lg bg-white/6" />
                <div className="flex-1 flex gap-0.5">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <div key={j} className="h-4 w-5 rounded bg-white/4" />
                  ))}
                </div>
                <div className="h-3 w-8 rounded-lg bg-white/5" />
                <div className="h-3 w-8 rounded-lg bg-white/5" />
                <div className="h-3 w-14 rounded-lg bg-white/5" />
                <div className="h-3 w-14 rounded-lg bg-white/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
