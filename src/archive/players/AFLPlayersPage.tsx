import React, { useEffect, useMemo, useState } from "react";
import { Search, Grid3X3, Calendar, Info, Lock, Sparkles } from "lucide-react";
import PlayerGrid from "./PlayerGrid";
import PlayerOverlay from "./PlayerOverlay";
import { getAvailableTeams, getPlayers, PlayerData, StatLens } from "./getPlayers";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  FREE_TOTAL_PLAYERS,
  FREE_PLAYERS_PER_TEAM,
} from "@/config/freemiumConfig";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Season = "2025" | "2026";

export default function AFLPlayersPage() {
  const { isPremium } = useAuth();
  const [lens, setLens] = useState<StatLens>("fantasy");
  const [season, setSeason] = useState<Season>("2025");
  const [team, setTeam] = useState<string>("All Teams");
  const [query, setQuery] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teams, setTeams] = useState<string[]>(["All Teams"]);
  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([]);
  const [minRound, setMinRound] = useState<number>(0);
  const [maxRound, setMaxRound] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    getAvailableTeams().then(setTeams);
  }, []);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      const seasonNum = parseInt(season);
      const response = await getPlayers(lens, seasonNum);
      setAllPlayers(response.players);
      setMinRound(response.minRound);
      setMaxRound(response.maxRound);
      setLoading(false);
    };
    fetchPlayers();
  }, [lens, season]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlayers.filter((p) => {
      const teamOk = team === "All Teams" ? true : p.team === team;
      if (!teamOk) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
      );
    });
  }, [allPlayers, team, query]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => b.stats.avg - a.stats.avg),
    [filtered]
  );

  const visiblePlayers = useMemo(() => {
    if (isPremium) return sortedFiltered;

    if (team !== "All Teams") {
      return sortedFiltered.slice(0, FREE_PLAYERS_PER_TEAM);
    }

    return sortedFiltered.slice(0, FREE_TOTAL_PLAYERS);
  }, [sortedFiltered, isPremium, team]);

  const lockedCount = useMemo(() => {
    if (isPremium) return 0;
    return Math.max(0, sortedFiltered.length - visiblePlayers.length);
  }, [isPremium, sortedFiltered, visiblePlayers]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return allPlayers.find((p) => p.id === selectedId) || null;
  }, [selectedId, allPlayers]);

  const isTeamFiltered = team !== "All Teams";

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10">
        {/* HERO */}
        <div className="mb-3 md:mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-yellow-400/30 bg-yellow-500/10 text-yellow-200 md:cursor-default cursor-pointer">
                      <Grid3X3 className="h-4 w-4" />
                      <span className="text-[11px] uppercase tracking-[0.22em] font-semibold">
                        Master Grid
                      </span>
                      <Info className="h-3 w-3 md:hidden" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="md:hidden max-w-xs bg-black/95 border-white/20 text-white/90 text-xs">
                    <div className="space-y-1">
                      <p className="font-semibold">Master Grid</p>
                      <p className="text-white/70">View every player's season at a glance. Scroll horizontally to explore rounds and finals.</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <h1 className="mt-3 md:mt-4 text-4xl md:text-5xl font-extrabold text-white">
                Full Season Player Ledger
              </h1>
              <p className="mt-1.5 md:mt-2 text-white/55 max-w-2xl">
                Track every player's form, ceiling and consistency across the entire season.
              </p>
            </div>

            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded-lg border border-white/10 bg-black/30 text-white/40 hover:text-yellow-400 hover:border-yellow-400/40 transition-colors">
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs bg-black/95 border-white/20 text-white/90 text-xs">
                  <p>Sorted by highest season average. Includes finals rounds. Results may differ from AFL / Champion Data.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* FILTER BAR */}
        <div
          className={cn(
            "rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl",
            "px-4 py-2 md:px-5 md:py-3"
          )}
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
            <div className="flex gap-3 flex-col sm:flex-row sm:items-center flex-1">
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="h-11 rounded-xl bg-black/50 border border-white/10 text-white/80 px-3 outline-none focus:border-yellow-400/50"
              >
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* Search — locked for free users */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35 z-10" />
                <input
                  value={query}
                  onChange={(e) => isPremium && setQuery(e.target.value)}
                  placeholder={isPremium ? "Search player, team or role" : "Search requires Neeko+"}
                  disabled={!isPremium}
                  className={cn(
                    "w-full h-11 pl-10 pr-3 rounded-xl bg-black/50 border text-white/80 placeholder:text-white/30 outline-none transition-colors",
                    isPremium
                      ? "border-white/10 focus:border-yellow-400/50 cursor-text"
                      : "border-white/5 text-white/30 cursor-not-allowed select-none"
                  )}
                />
                {!isPremium && (
                  <div
                    className="absolute inset-0 flex items-center justify-end pr-3 rounded-xl cursor-pointer"
                    onClick={() => { window.location.href = "/neeko-plus"; }}
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#F5C84C]/60 font-semibold">
                      <Lock className="h-3 w-3" />
                      Neeko+
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Season pills */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-white/40" />
              {(["2025", "2026"] as Season[]).map((s) => {
                const active = season === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSeason(s)}
                    className={cn(
                      "px-3 h-9 rounded-full border text-sm font-semibold transition-all",
                      active
                        ? "bg-white/10 text-white border-white/20"
                        : "bg-black/40 border-white/10 text-white/50 hover:border-white/20"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Lens pills */}
            <div className="flex items-center gap-2 justify-between sm:justify-start">
              {(["fantasy", "disposals", "goals"] as StatLens[]).map((l) => {
                const active = lens === l;
                return (
                  <button
                    key={l}
                    onClick={() => setLens(l)}
                    className={cn(
                      "rounded-full border text-sm font-semibold transition-all",
                      "px-3.5 h-9 md:px-4 md:h-10",
                      active
                        ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.60)]"
                        : "bg-black/40 border-white/15 text-white/70 hover:border-yellow-400/50"
                    )}
                  >
                    {l === "fantasy" ? "Fantasy" : l === "disposals" ? "Disposals" : "Goals"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* GRID OR STATES */}
        <div className="mt-3 md:mt-4">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-400/30 mb-6 animate-pulse">
                <Grid3X3 className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Loading Player Data</h3>
              <p className="text-white/55 max-w-md mx-auto">
                Fetching stats from database...
              </p>
            </div>
          ) : season === "2026" ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-400/30 mb-6">
                <Calendar className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">2026 season data will be available after Round 1</h3>
            </div>
          ) : sortedFiltered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-12 text-center">
              <h3 className="text-2xl font-bold text-white mb-3">No Players Found</h3>
              <p className="text-white/55 max-w-md mx-auto">
                Try adjusting your filters.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              <PlayerGrid
                players={visiblePlayers}
                lens={lens}
                minRound={minRound}
                maxRound={maxRound}
                onPlayerSelect={(p) => setSelectedId(p.id)}
              />

              {/* LOCKED ROWS — team-filtered blur panel */}
              {!isPremium && isTeamFiltered && lockedCount > 0 && (
                <div className="rounded-b-2xl border border-t-0 border-white/10 overflow-hidden">
                  {/* Ghost blurred rows */}
                  {Array.from({ length: Math.min(lockedCount, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="border-b border-white/5 px-4 py-3 blur-sm opacity-30 pointer-events-none select-none"
                      aria-hidden
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-0.5 h-9 rounded-full bg-white/20 flex-shrink-0" />
                        <div className="space-y-1.5 flex-1">
                          <div className="h-3.5 w-32 rounded bg-white/10" />
                          <div className="h-2.5 w-20 rounded bg-white/6" />
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <div key={j} className="w-10 h-8 rounded-md bg-white/8" />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* CTA overlay */}
                  <div
                    className="px-8 py-8 flex flex-col items-center gap-4 text-center"
                    style={{ background: "linear-gradient(180deg, rgba(7,7,7,0.6) 0%, rgba(7,7,7,0.96) 100%)" }}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.3)" }}
                    >
                      <Lock className="h-5 w-5 text-[#F5C84C]" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-white">
                        {lockedCount} more player{lockedCount !== 1 ? "s" : ""} locked
                      </p>
                      <p className="text-sm text-white/50 mt-1 max-w-sm">
                        Upgrade to Neeko+ to see the full team roster.
                      </p>
                    </div>
                    <a
                      href="/neeko-plus"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-yellow-400 text-black font-semibold text-sm hover:bg-yellow-300 transition-all shadow-[0_0_20px_rgba(250,204,21,0.4)]"
                    >
                      <Sparkles className="h-4 w-4" />
                      Upgrade to Neeko+
                    </a>
                  </div>
                </div>
              )}

              {/* BOTTOM CTA — all-teams view for free users */}
              {!isPremium && !isTeamFiltered && (
                <div
                  className="rounded-b-2xl px-8 py-10 flex flex-col items-center gap-4 text-center border border-t-0 border-white/10"
                  style={{ background: "linear-gradient(180deg, rgba(7,7,7,0.7) 0%, rgba(7,7,7,0.97) 100%)" }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.3)" }}
                  >
                    <Lock className="h-5 w-5 text-[#F5C84C]" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">
                      Unlock all 780+ players
                    </p>
                    <p className="text-sm text-white/50 mt-1 max-w-sm">
                      Upgrade to Neeko+ to access the full player ledger, search, and team breakdowns.
                    </p>
                  </div>
                  <a
                    href="/neeko-plus"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-yellow-400 text-black font-bold text-base hover:bg-yellow-300 transition-all shadow-[0_0_20px_rgba(250,204,21,0.4)]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade to Neeko+
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY */}
      {selected && (
        <PlayerOverlay
          player={selected}
          lens={lens}
          onLensChange={(l) => setLens(l)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
