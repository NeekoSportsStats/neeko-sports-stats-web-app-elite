import React, { useEffect, useMemo, useState } from "react";
import { Grid3X3, Calendar, Info, Lock, Sparkles } from "lucide-react";
import TeamGrid from "./TeamGrid";
import TeamOverlay from "./TeamOverlay";
import { getTeams, TeamData, StatLens } from "./getTeams";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { FREE_TOTAL_TEAMS } from "@/config/freemiumConfig";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Season = "2025" | "2026";

export default function AFLTeamsPage() {
  const { isPremium } = useAuth();
  const [lens, setLens] = useState<StatLens>("fantasy");
  const [season, setSeason] = useState<Season>("2025");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allTeams, setAllTeams] = useState<TeamData[]>([]);
  const [minRound, setMinRound] = useState<number>(0);
  const [maxRound, setMaxRound] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      const seasonNum = parseInt(season);
      console.log(`📊 Fetching teams for season ${seasonNum}, lens: ${lens}`);
      const response = await getTeams(lens, seasonNum);
      console.log(`✓ Loaded ${response.teams.length} teams`);
      console.log(`✓ Round range: ${response.minRound} to ${response.maxRound}`);
      setAllTeams(response.teams);
      setMinRound(response.minRound);
      setMaxRound(response.maxRound);
      setLoading(false);
    };
    fetchTeams();
  }, [lens, season]);

  const visibleTeams = useMemo(() => {
    if (isPremium) return allTeams;
    return allTeams.slice(0, FREE_TOTAL_TEAMS);
  }, [allTeams, isPremium]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return allTeams.find((t) => t.id === selectedId) || null;
  }, [selectedId, allTeams]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10">
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
                      <p className="text-white/70">View every team's season at a glance. Scroll horizontally to explore rounds and finals.</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <h1 className="mt-3 md:mt-4 text-4xl md:text-5xl font-extrabold text-white">
                Full Season Team Ledger
              </h1>
              <p className="mt-1.5 md:mt-2 text-white/55 max-w-2xl">
                Track every team's form, scoring power and consistency across the entire season.
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

        <div
          className={cn(
            "rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl",
            "px-4 py-2 md:px-5 md:py-3"
          )}
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 lg:justify-end">
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

        <div className="mt-3 md:mt-4">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-400/30 mb-6 animate-pulse">
                <Grid3X3 className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Loading Team Data</h3>
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
          ) : allTeams.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-12 text-center">
              <h3 className="text-2xl font-bold text-white mb-3">No Teams Found</h3>
              <p className="text-white/55 max-w-md mx-auto">
                No data available for this season.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              <TeamGrid
                teams={visibleTeams}
                lens={lens}
                minRound={minRound}
                maxRound={maxRound}
                onTeamSelect={(t) => setSelectedId(t.id)}
              />
              {!isPremium && allTeams.length > FREE_TOTAL_TEAMS && (
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
                      {allTeams.length - FREE_TOTAL_TEAMS} more team{allTeams.length - FREE_TOTAL_TEAMS !== 1 ? "s" : ""} locked
                    </p>
                    <p className="text-sm text-white/50 mt-1 max-w-sm">
                      Upgrade to Neeko+ to unlock all 18 AFL teams.
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
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <TeamOverlay
          team={selected}
          lens={lens}
          onLensChange={(l) => setLens(l)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
