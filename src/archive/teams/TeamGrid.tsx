import React, { useEffect, useMemo, useState, useRef } from "react";
import { TeamData, StatLens } from "./getTeams";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const fmt1 = (v: any): string => {
  const num = Number(v);
  return Number.isFinite(num) ? num.toFixed(1) : "—";
};

function formatRoundLabel(label: string): string {
  return label;
}

interface TeamGridProps {
  teams: TeamData[];
  lens: StatLens;
  minRound: number;
  maxRound: number;
  onTeamSelect: (team: TeamData) => void;
}

function getColorClass(score: number | null, lens: StatLens): string {
  if (score == null) {
    return "bg-transparent border-transparent text-white/25";
  }

  if (lens === "fantasy") {
    if (score >= 1800) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
    if (score >= 1650) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
    if (score >= 1500) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
    return "bg-red-500/10 border-red-400/25 text-red-300";
  }

  if (lens === "disposals") {
    if (score >= 350) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
    if (score >= 310) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
    if (score >= 275) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
    return "bg-red-500/10 border-red-400/25 text-red-300";
  }

  if (score >= 16) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
  if (score >= 13) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
  if (score >= 10) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
  return "bg-red-500/10 border-red-400/25 text-red-300";
}

function getHitRateBarColor(percentage: number, threshold: number, lens: StatLens): string {
  if (lens === "fantasy") {
    if (threshold >= 1800) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 1650) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 1500) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  } else if (lens === "disposals") {
    if (threshold >= 350) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 310) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 275) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  } else {
    if (threshold >= 16) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 13) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 10) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  }
  return percentage >= 50 ? "bg-red-400" : "bg-red-400/50";
}

export default function TeamGrid({ teams, lens, minRound, maxRound, onTeamSelect }: TeamGridProps) {
  const isMobile = useIsMobile();
  const [scrollPos, setScrollPos] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollPos(container.scrollLeft);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("scroll", handleScroll);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleScrollLeft = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  };

  const handleScrollRight = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  const canScrollLeft = scrollPos > 10;
  const canScrollRight = scrollContainerRef.current
    ? scrollPos < scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth - 10
    : true;

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => b.stats.avg - a.stats.avg);
  }, [teams]);

  const allGameColumns = useMemo(() => {
    const gameColumnsMap = new Map<string, { round_sort_key: number; display_label: string; round_number: number; match_index: number }>();

    for (const team of teams) {
      for (const game of team.games) {
        const columnKey = `${game.round_number}-${game.match_index}`;
        if (!gameColumnsMap.has(columnKey)) {
          gameColumnsMap.set(columnKey, {
            round_sort_key: game.round_sort_key,
            display_label: game.display_label,
            round_number: game.round_number,
            match_index: game.match_index,
          });
        }
      }
    }

    const columns = Array.from(gameColumnsMap.values());
    columns.sort((a, b) => a.round_sort_key - b.round_sort_key);

    return columns;
  }, [teams]);

  return (
    <div>
      <div className="relative">
        {!isMobile && canScrollLeft && (
          <button
            onClick={handleScrollLeft}
            className="absolute left-[-48px] top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/90 border border-white/20 text-white/70 hover:text-white hover:border-yellow-400/60 transition-all shadow-lg"
            style={{ opacity: canScrollLeft ? 1 : 0, pointerEvents: canScrollLeft ? "auto" : "none" }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {!isMobile && canScrollRight && (
          <button
            onClick={handleScrollRight}
            className="absolute right-[-48px] top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/90 border border-white/20 text-white/70 hover:text-white hover:border-yellow-400/60 transition-all shadow-lg"
            style={{ opacity: canScrollRight ? 1 : 0, pointerEvents: canScrollRight ? "auto" : "none" }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-xl overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto relative"
            style={{
              background: !isMobile
                ? `linear-gradient(to right, transparent 200px, rgba(0,0,0,0.4) 210px, rgba(0,0,0,0.4) calc(100% - 230px), transparent calc(100% - 220px))`
                : undefined
            }}
          >
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] text-white/55 uppercase tracking-[0.08em] font-medium">
                  <th className="sticky left-0 top-0 z-40 bg-black/95 backdrop-blur-xl px-3 py-2 text-left border-b border-r border-white/10 min-w-[200px] shadow-[2px_0_8px_rgba(0,0,0,0.3)]">
                    Team
                  </th>

                  {allGameColumns.map((col) => {
                    const columnKey = `${col.round_number}-${col.match_index}`;
                    return (
                      <th
                        key={columnKey}
                        className={`sticky top-0 z-30 bg-black/95 backdrop-blur-xl py-2 text-center border-b border-white/10 ${
                          isMobile ? 'px-1 min-w-[44px] text-[9px]' : 'px-2 min-w-[56px]'
                        }`}
                        title={col.display_label}
                      >
                        {formatRoundLabel(col.display_label)}
                      </th>
                    );
                  })}

                  {!isMobile && (
                    <th className="sticky right-0 top-0 z-40 bg-black/95 backdrop-blur-xl px-3 py-2 text-left border-b border-l border-white/10 min-w-[220px] shadow-[-2px_0_8px_rgba(0,0,0,0.3)]">
                      Summary
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {sortedTeams.map((team, idx) => (
                  <tr
                    key={team.id}
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                      idx % 2 === 0 ? "bg-white/[0.015]" : ""
                    }`}
                    onClick={() => onTeamSelect(team)}
                  >
                    <td className="sticky left-0 z-20 bg-black/85 backdrop-blur-xl px-3 py-3 border-r border-white/5 shadow-[2px_0_8px_rgba(0,0,0,0.2)]">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-0.5 h-9 rounded-full flex-shrink-0"
                          style={{ backgroundColor: team.teamColor || "#666" }}
                        />
                        <div className="min-w-0 flex-1">
                          {isMobile ? (
                            <div className="text-white text-[13px] font-bold uppercase truncate leading-tight">
                              {team.name}
                            </div>
                          ) : (
                            <div className="text-white text-[14.5px] font-semibold truncate leading-tight">
                              {team.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {allGameColumns.map((col) => {
                      const game = team.games.find(g => g.round_number === col.round_number && g.match_index === col.match_index);
                      const score = game?.score ?? null;
                      const columnKey = `${col.round_number}-${col.match_index}`;
                      return (
                        <td key={columnKey} className={isMobile ? 'px-1 py-3 text-center' : 'px-2 py-3 text-center'}>
                          <div
                            className={`inline-flex items-center justify-center rounded-md border font-bold tabular-nums ${
                              isMobile
                                ? 'min-w-[36px] px-[5px] py-[5.5px] text-[11px]'
                                : 'min-w-[42px] px-2 py-2 text-[12.5px]'
                            } ${getColorClass(score, lens)}`}
                          >
                            {score == null ? "—" : lens === "goals" ? fmt1(score) : Math.round(score)}
                          </div>
                        </td>
                      );
                    })}

                    {!isMobile && (
                      <td className="sticky right-0 z-20 bg-black/85 backdrop-blur-xl px-3 py-3 border-l border-white/5 shadow-[-2px_0_8px_rgba(0,0,0,0.2)] ledger-summary-column">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-[9px] text-white/40 uppercase tracking-wider font-medium">AVG</span>
                            <span className="text-lg font-bold text-yellow-400 tabular-nums">
                              {lens === "goals" ? fmt1(team.stats.avg) : Math.round(team.stats.avg)}
                            </span>
                            <span className="text-white/25">•</span>
                            <span className="text-[11px] text-white/55 font-medium tabular-nums">{team.stats.games}g</span>
                            <span className="text-white/25">•</span>
                            <span className="text-[10px] text-white/45 font-medium tabular-nums">Min <span className="text-white/65">{lens === "goals" ? fmt1(team.stats.min) : Math.round(team.stats.min)}</span></span>
                            <span className="text-white/25">•</span>
                            <span className="text-[10px] text-white/45 font-medium tabular-nums">Max <span className="text-white/65">{lens === "goals" ? fmt1(team.stats.max) : Math.round(team.stats.max)}</span></span>
                          </div>

                          <div className="space-y-0.5 pt-1">
                            {team.hitRates.slice(0, 3).map((hr) => (
                              <div key={hr.threshold} className="flex items-center gap-1.5">
                                <span className="text-[9px] text-white/35 w-7 tabular-nums">{hr.threshold}+</span>
                                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${getHitRateBarColor(
                                      hr.percentage,
                                      hr.threshold,
                                      lens
                                    )}`}
                                    style={{ width: `${hr.percentage}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-white/40 w-8 text-right tabular-nums">
                                  {Math.round(hr.percentage)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        </div>
      </div>

      {sortedTeams.length > 0 && (
        <div className="text-[11px] text-white/45 font-medium">
          Showing <span className="text-white/70 font-semibold">{sortedTeams.length}</span> AFL teams
        </div>
      )}
    </div>
  );
}
