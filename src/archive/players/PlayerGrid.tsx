import React, { useEffect, useMemo, useState, useRef } from "react";
import { PlayerData, StatLens } from "./getPlayers";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getRoundLabel, getRoundTooltip } from "./utils";
import { useIsMobile } from "@/hooks/use-mobile";

const fmt1 = (v: any): string => {
  const num = Number(v);
  return Number.isFinite(num) ? num.toFixed(1) : "—";
};

/**
 * STRICT FRONTEND GUARD FOR ROUND LABELS
 *
 * This component ONLY renders round labels from the backend round_display field.
 * NO dynamic generation of R24, R24(1), or R24(2) labels.
 *
 * The backend must provide exact labels like:
 * - "R1", "R2", ..., "R23"
 * - "R24(1)" for Round 24 Game 1
 * - "R24(2)" for Round 24 Game 2
 * - "FW1", "SF", "PF", "GF" for finals
 *
 * Column order is determined by round_sort_key from the backend.
 * Duplicate labels collapse into a single column (using display_label as unique key).
 */
function formatRoundLabel(label: string): string {
  // GUARD: Use backend label directly without transformation
  // This prevents dynamic generation of R24 variations
  return label;
}

interface PlayerGridProps {
  players: PlayerData[];
  lens: StatLens;
  minRound: number;
  maxRound: number;
  onPlayerSelect: (player: PlayerData) => void;
}

function getColorClass(score: number | null, lens: StatLens): string {
  if (score == null) {
    return "bg-transparent border-transparent text-white/25";
  }

  if (lens === "fantasy") {
    if (score >= 100) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
    if (score >= 85) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
    if (score >= 70) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
    return "bg-red-500/10 border-red-400/25 text-red-300";
  }

  if (lens === "disposals") {
    if (score >= 31) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
    if (score >= 23) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
    if (score >= 15) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
    return "bg-red-500/10 border-red-400/25 text-red-300";
  }

  if (score >= 3) return "bg-blue-500/15 border-blue-400/30 text-blue-300";
  if (score >= 2) return "bg-emerald-500/15 border-emerald-400/30 text-emerald-300";
  if (score >= 1) return "bg-yellow-500/15 border-yellow-400/30 text-yellow-300";
  return "bg-red-500/10 border-red-400/25 text-red-300";
}

function getHitRateBarColor(percentage: number, threshold: number, lens: StatLens): string {
  if (lens === "fantasy") {
    if (threshold >= 100) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 85) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 70) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  } else if (lens === "disposals") {
    if (threshold >= 31) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 23) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 15) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  } else {
    if (threshold >= 3) return percentage >= 50 ? "bg-blue-400" : "bg-blue-400/50";
    if (threshold >= 2) return percentage >= 50 ? "bg-emerald-400" : "bg-emerald-400/50";
    if (threshold >= 1) return percentage >= 50 ? "bg-yellow-400" : "bg-yellow-400/50";
  }
  return percentage >= 50 ? "bg-red-400" : "bg-red-400/50";
}

export default function PlayerGrid({ players, lens, minRound, maxRound, onPlayerSelect }: PlayerGridProps) {
  const INITIAL_DESKTOP = 20;
  const STEP_DESKTOP = 20;
  const CAP_DESKTOP = 120;
  const INITIAL_MOBILE = 10;
  const STEP_MOBILE = 10;
  const CAP_MOBILE = 40;

  const isMobile = useIsMobile();
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_DESKTOP);
  const [scrollPos, setScrollPos] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(isMobile ? INITIAL_MOBILE : INITIAL_DESKTOP);
  }, [lens, players.length, isMobile]);

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

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.stats.avg - a.stats.avg);
  }, [players]);

  const total = sortedPlayers.length;
  const visiblePlayers = useMemo(
    () => sortedPlayers.slice(0, visibleCount),
    [sortedPlayers, visibleCount]
  );

  /**
   * COLUMN GENERATION LOGIC
   *
   * Key Points:
   * 1. Composite key (round_number-match_index) is the unique identifier
   * 2. display_label is generated for UI display only
   * 3. Column order is determined by round_sort_key
   * 4. Mobile and desktop use the SAME source (no separate logic)
   *
   * Expected column order: ... R23 → R24(1) → R24(2) → FW1 → SF → PF → GF
   */
  const allGameColumns = useMemo(() => {
    const gameColumnsMap = new Map<string, { round_sort_key: number; display_label: string; round_number: number; match_index: number }>();

    for (const player of players) {
      for (const game of player.games) {
        // Use composite key: round_number-match_index
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
    // Sort by round_sort_key to ensure correct column order
    columns.sort((a, b) => a.round_sort_key - b.round_sort_key);

    return columns;
  }, [players]);

  /**
   * MOBILE & DESKTOP CONSISTENCY
   *
   * Both mobile and desktop render the SAME columns from allGameColumns.
   * No separate round lists or filtering logic.
   */
  const visibleGameColumns = useMemo(() => {
    return allGameColumns;
  }, [allGameColumns]);

  const cap = isMobile ? CAP_MOBILE : CAP_DESKTOP;
  const step = isMobile ? STEP_MOBILE : STEP_DESKTOP;
  const canShowMore = visibleCount < total && visibleCount < cap;
  const hitCap = visibleCount >= cap && total > cap;

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
                  Player
                </th>

                {visibleGameColumns.map((col) => {
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
              {visiblePlayers.map((player, idx) => (
                <tr
                  key={player.id}
                  className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                    idx % 2 === 0 ? "bg-white/[0.015]" : ""
                  }`}
                  onClick={() => onPlayerSelect(player)}
                >
                  <td className="sticky left-0 z-20 bg-black/85 backdrop-blur-xl px-3 py-3 border-r border-white/5 shadow-[2px_0_8px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-0.5 h-9 rounded-full flex-shrink-0"
                        style={{ backgroundColor: player.teamColor || "#666" }}
                      />
                      <div className="min-w-0 flex-1">
                        {isMobile ? (
                          <>
                            <div className="text-white/75 text-[11px] font-medium truncate leading-tight">
                              {player.name.split(' ')[0]}
                            </div>
                            <div className="text-white text-[13px] font-bold uppercase truncate leading-tight mt-0.5">
                              {player.name.split(' ').slice(1).join(' ')}
                            </div>
                            <div className="text-[9px] text-white/40 truncate leading-tight mt-0.5">
                              {player.team} · {player.role}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-white text-[14.5px] font-semibold truncate leading-tight">
                              {player.name}
                            </div>
                            <div className="text-[10.5px] text-white/45 truncate leading-tight mt-0.5">
                              {player.team} · {player.role}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {visibleGameColumns.map((col) => {
                    // Match game data by composite key (round_number-match_index)
                    const game = player.games.find(g => g.round_number === col.round_number && g.match_index === col.match_index);
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
                          {score == null ? "—" : score}
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
                            {lens === "goals" ? fmt1(player.stats.avg) : player.stats.avg}
                          </span>
                          <span className="text-white/25">•</span>
                          <span className="text-[11px] text-white/55 font-medium tabular-nums">{player.stats.games}g</span>
                          <span className="text-white/25">•</span>
                          <span className="text-[10px] text-white/45 font-medium tabular-nums">Min <span className="text-white/65">{player.stats.min}</span></span>
                          <span className="text-white/25">•</span>
                          <span className="text-[10px] text-white/45 font-medium tabular-nums">Max <span className="text-white/65">{player.stats.max}</span></span>
                        </div>

                        <div className="space-y-0.5 pt-1">
                          {player.hitRates.slice(0, 3).map((hr) => (
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

      {total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="text-[11px] text-white/45 font-medium">
            Showing <span className="text-white/70 font-semibold">{Math.min(visibleCount, total)}</span> of{" "}
            <span className="text-white/70 font-semibold">{total}</span> players
          </div>

          {hitCap ? (
            <div className="text-[11px] text-white/50 font-medium italic">
              Use filters to narrow results
            </div>
          ) : canShowMore ? (
            <button
              onClick={() => setVisibleCount((c) => Math.min(total, Math.min(cap, c + step)))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-yellow-400/40 bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/15 active:scale-[0.98] text-xs font-semibold transition-all touch-manipulation"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Show {step} more
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
