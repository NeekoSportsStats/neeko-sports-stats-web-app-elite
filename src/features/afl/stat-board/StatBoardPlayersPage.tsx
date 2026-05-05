import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Search, X, Lock } from "lucide-react";
import { track } from "@/lib/analytics";

import {
  useStatBoardMatches,
  useStatBoardPlayers,
  useStatBoardPlayerHistory,
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

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

export default function StatBoardPlayersPage() {
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [threshold, setThreshold] = useState<number>(20);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardMatches();

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
    const byProjection = (a: StatBoardPlayer, b: StatBoardPlayer) =>
      (b.projection ?? 0) - (a.projection ?? 0);
    return {
      homePlayers: home.sort(byProjection),
      awayPlayers: away.sort(byProjection),
    };
  }, [players, selectedMatch]);

  useEffect(() => {
    track("Page View", { path: "/stat-board/players" });
  }, []);

  const thresholds = thresholdsForLens(lens);
  const isLocked = selectedMatch?.is_locked ?? false;
  const lineName = lens === "disposals" ? "Disposal line" : "Goal line";

  const contextParts = [
    selectedMatch?.match_label,
    lens === "disposals" ? "Disposals" : "Goals",
    `${threshold}+ line`,
    players.length > 0 ? `${players.length} players` : null,
  ].filter(Boolean);

  return (
    <>
      <Helmet>
        <title>AFL Stat Board | Player Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="View AFL player stat trends, hit rates and projections by match. Filter by disposals and goals."
        />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-20">

          {/* Header */}
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-white">AFL Stat Board</h1>
            <p className="mt-0.5 text-sm text-white/40">
              Pick a match, choose a stat, view hit rates and projections.
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

          {/* Controls row */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {/* Lens toggle */}
            <div className="flex gap-1.5 rounded-xl bg-white/5 border border-white/8 p-1">
              {(["disposals", "goals"] as StatLens[]).map((l) => (
                <button
                  key={l}
                  onClick={() => handleLensChange(l)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    lens === l
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "text-white/50 hover:text-white/75"
                  }`}
                >
                  {l === "disposals" ? "Disposals" : "Goals"}
                </button>
              ))}
            </div>

            {/* Divider */}
            <span className="h-4 w-px bg-white/10" />

            {/* Line label */}
            <span className="text-xs text-white/35 font-medium">{lineName}:</span>

            {/* Threshold buttons */}
            <div className="flex gap-1">
              {thresholds.map((t) => (
                <button
                  key={t}
                  onClick={() => setThreshold(t)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    threshold === t
                      ? "bg-[#F5C84C]/20 text-[#F5C84C] ring-1 ring-[#F5C84C]/35"
                      : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/65"
                  }`}
                >
                  {t}+
                </button>
              ))}
            </div>

            {/* Divider */}
            <span className="h-4 w-px bg-white/10" />

            {/* Position filter */}
            <div className="flex gap-1">
              {POSITION_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPositionFilter(key)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    positionFilter === key
                      ? "bg-white/15 text-white ring-1 ring-white/25"
                      : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/65"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Search player..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/8 pl-8 pr-8 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Context row */}
          {contextParts.length > 0 && !playersLoading && (
            <div className="mb-4 flex items-center gap-1.5 text-[11px] text-white/30">
              {contextParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-white/15">·</span>}
                  <span>{part}</span>
                </span>
              ))}
            </div>
          )}

          {/* Locked match banner */}
          {isLocked && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#F5C84C]">Unlock full round</p>
                <p className="text-xs text-white/40 mt-0.5">
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
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/40">
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
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/40">
              No matches available yet.
            </div>
          )}
        </div>
      </div>
    </>
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
      <div className="mb-1.5 flex items-baseline gap-2">
        <h2 className="text-xs font-bold text-white/75 uppercase tracking-wider">{teamName}</h2>
        <span className="text-[11px] text-white/30">vs {opponentName}</span>
      </div>

      {/* Column headers — desktop */}
      <div className="hidden md:grid md:grid-cols-[1fr_120px_56px_56px_88px_72px_32px] gap-x-3 items-center px-3 pb-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
        <span>Player</span>
        <span className="text-center">Last 10</span>
        <span className="text-right">L10 Avg</span>
        <span className="text-right">Proj</span>
        <span className="text-center">{threshold}+ hit</span>
        <span className="text-center">Form</span>
        <span />
      </div>

      {/* Rows */}
      <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/[0.05]">
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
    <div className="rounded-2xl border border-white/8 overflow-hidden divide-y divide-white/[0.05]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 px-3 flex items-center gap-3 animate-pulse">
          <div className="h-3 w-32 rounded-lg bg-white/5" />
          <div className="flex-1 h-2 rounded-lg bg-white/4" />
          <div className="h-3 w-10 rounded-lg bg-white/5" />
          <div className="h-3 w-10 rounded-lg bg-white/5" />
        </div>
      ))}
    </div>
  );
}
