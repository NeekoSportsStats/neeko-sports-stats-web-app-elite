import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Search, ChevronDown, ChevronUp, Lock, TrendingUp, X } from "lucide-react";
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
import { PlayerCard } from "./components/PlayerCard";

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

export default function StatBoardPlayersPage() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [threshold, setThreshold] = useState<number>(20);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardMatches();

  const { players, loading: playersLoading, error: playersError } = useStatBoardPlayers({
    matchId: selectedMatch?.match_id ?? null,
    lens,
    threshold,
    positionFilter,
    search,
  });

  // ── Auto-select first match once matches load ─────────────────────────────
  useEffect(() => {
    if (matches.length > 0 && selectedMatch === null) {
      const first = matches.find((m) => m.match_order === 1) ?? matches[0];
      setSelectedMatch(first);
    }
  }, [matches, selectedMatch]);

  // ── Lens change: reset threshold ─────────────────────────────────────────
  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setThreshold(defaultThreshold(newLens));
    track("Stat Board Lens Change", { lens: newLens });
  }

  // ── Match change ──────────────────────────────────────────────────────────
  function handleMatchChange(match: StatBoardMatch) {
    setSelectedMatch(match);
    setExpandedPlayerId(null);
    track("Stat Board Match Change", { match_id: match.match_id, match_label: match.match_label });
  }

  // ── Split players into home / away groups ─────────────────────────────────
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

  // ── Page analytics ────────────────────────────────────────────────────────
  useEffect(() => {
    track("Page View", { path: "/stat-board/players" });
  }, []);

  const thresholds = thresholdsForLens(lens);
  const isLocked = selectedMatch?.is_locked ?? false;

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
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-20">

          {/* ── Header ── */}
          <div className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight text-white">AFL Stat Board</h1>
            <p className="mt-1 text-sm text-white/50">
              Pick a match, choose a stat, and see player hit rates, projections and trends.
            </p>
          </div>

          {/* ── Match Selector ── */}
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

          {/* ── Stat lens toggle ── */}
          <div className="mb-3 flex gap-2">
            {(["disposals", "goals"] as StatLens[]).map((l) => (
              <button
                key={l}
                onClick={() => handleLensChange(l)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  lens === l
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {l === "disposals" ? "Disposals" : "Goals"}
              </button>
            ))}
          </div>

          {/* ── Threshold selector ── */}
          <div className="mb-3 flex flex-wrap gap-2">
            {thresholds.map((t) => (
              <button
                key={t}
                onClick={() => setThreshold(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  threshold === t
                    ? "bg-[#F5C84C]/20 text-[#F5C84C] ring-1 ring-[#F5C84C]/40"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {t}+
              </button>
            ))}
          </div>

          {/* ── Position filter ── */}
          <div className="mb-3 flex flex-wrap gap-2">
            {POSITION_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPositionFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  positionFilter === key
                    ? "bg-white/15 text-white ring-1 ring-white/30"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Search ── */}
          <div className="mb-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="text"
              placeholder="Search player..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── Locked match banner ── */}
          {isLocked && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#F5C84C]">Unlock full round</p>
                <p className="text-xs text-white/40 mt-0.5">
                  Upgrade to Neeko+ to see projections and hit rates for all matches.
                </p>
              </div>
            </div>
          )}

          {/* ── Players error ── */}
          {playersError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load players. Please try again.
            </div>
          )}

          {/* ── Player list ── */}
          {playersLoading ? (
            <PlayersSkeleton />
          ) : players.length === 0 && !playersLoading && selectedMatch ? (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/40">
              No players found for this match and filter.
            </div>
          ) : (
            <>
              <TeamSection
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                threshold={threshold}
                isLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={setExpandedPlayerId}
              />
              {homePlayers.length > 0 && awayPlayers.length > 0 && (
                <div className="my-4 border-t border-white/8" />
              )}
              <TeamSection
                teamName={selectedMatch?.away_team_name ?? "Away"}
                opponentName={selectedMatch?.home_team_name ?? "Home"}
                players={awayPlayers}
                lens={lens}
                threshold={threshold}
                isLocked={isLocked}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={setExpandedPlayerId}
              />
            </>
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

// ── Team section ──────────────────────────────────────────────────────────────

interface TeamSectionProps {
  teamName: string;
  opponentName: string;
  players: StatBoardPlayer[];
  lens: StatLens;
  threshold: number;
  isLocked: boolean;
  expandedPlayerId: number | null;
  onToggleExpand: (id: number | null) => void;
}

function TeamSection({
  teamName,
  opponentName,
  players,
  lens,
  threshold,
  isLocked,
  expandedPlayerId,
  onToggleExpand,
}: TeamSectionProps) {
  if (players.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-white/80">{teamName}</h2>
        <span className="text-xs text-white/30">vs {opponentName}</span>
      </div>
      <div className="space-y-2">
        {players.map((player) => (
          <PlayerCard
            key={player.player_id}
            player={player}
            lens={lens}
            threshold={threshold}
            isLocked={isLocked}
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

function PlayersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white/4 border border-white/8 h-24 animate-pulse"
        />
      ))}
    </div>
  );
}
