import { useRef, useEffect, useCallback, memo } from "react";
import type { ComparePlayer } from "./currentWeekTypes";
import { rateColour, cellTextColour, fmtHitsGames, fmtRate, fmtAvg } from "./currentWeekUtils";

interface Props {
  players: ComparePlayer[];
  thresholds: readonly number[];
  selectedLine: number;
  onSelectLine: (line: number) => void;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onPlayerClick?: (playerId: number) => void;
}

const STICKY_COL_WIDTH = 118;
const L5_COL_WIDTH = 38;
const CELL_WIDTH = 52;
const ROW_H = 32;

export const MatchupComparisonTable = memo(function MatchupComparisonTable({
  players,
  thresholds,
  selectedLine,
  onSelectLine,
  scrollRef,
  onPlayerClick,
}: Props) {
  const innerScrollRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const activeScrollRef = scrollRef ?? innerScrollRef;

  // Center selected column on mount / when it changes
  useEffect(() => {
    const container = activeScrollRef.current;
    if (!container) return;
    const idx = thresholds.indexOf(selectedLine);
    if (idx < 0) return;
    const leftOfSelected = STICKY_COL_WIDTH + L5_COL_WIDTH + idx * CELL_WIDTH;
    const containerWidth = container.clientWidth;
    const scrollTarget = leftOfSelected - containerWidth / 2 + CELL_WIDTH / 2;
    container.scrollLeft = Math.max(0, scrollTarget);
  }, [selectedLine, thresholds, activeScrollRef]);

  if (!players.length) {
    return (
      <div
        className="text-center py-6 text-[11px] text-white/25"
        style={{ paddingInline: "clamp(12px,3vw,20px)" }}
      >
        No players found
      </div>
    );
  }

  return (
    <div
      ref={activeScrollRef}
      className="overflow-x-auto no-scrollbar"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div style={{ minWidth: STICKY_COL_WIDTH + L5_COL_WIDTH + thresholds.length * CELL_WIDTH }}>
        {/* Header row */}
        <div
          className="flex sticky top-0 z-10"
          style={{ background: "#05070A", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          {/* Player name header */}
          <div
            className="sticky left-0 z-20 flex items-center"
            style={{
              width: STICKY_COL_WIDTH,
              minWidth: STICKY_COL_WIDTH,
              height: ROW_H,
              paddingLeft: "clamp(12px,3vw,20px)",
              background: "#05070A",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
              Player
            </span>
          </div>
          {/* L5 header */}
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: L5_COL_WIDTH, height: ROW_H }}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
              L5
            </span>
          </div>
          {/* Threshold headers */}
          {thresholds.map((t) => {
            const isSelected = t === selectedLine;
            return (
              <button
                key={t}
                onClick={() => onSelectLine(t)}
                className={[
                  "flex-shrink-0 flex items-center justify-center transition-colors duration-100",
                  isSelected
                    ? "text-white bg-white/[0.07]"
                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]",
                ].join(" ")}
                style={{
                  width: CELL_WIDTH,
                  height: ROW_H,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  borderBottom: isSelected ? "2px solid rgba(255,255,255,0.35)" : "2px solid transparent",
                }}
                aria-label={`Select line ${t}+`}
              >
                {t}+
              </button>
            );
          })}
        </div>

        {/* Data rows */}
        <div ref={tableBodyRef}>
          {players.map((cp) => (
            <TableRow
              key={cp.player.player_id}
              cp={cp}
              thresholds={thresholds}
              selectedLine={selectedLine}
              onPlayerClick={onPlayerClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

const TableRow = memo(function TableRow({
  cp,
  thresholds,
  selectedLine,
  onPlayerClick,
}: {
  cp: ComparePlayer;
  thresholds: readonly number[];
  selectedLine: number;
  onPlayerClick?: (playerId: number) => void;
}) {
  const { player } = cp;
  const hitRates = player.season_threshold_hit_rates ?? player.all_threshold_hit_rates ?? {};

  return (
    <div
      className="flex border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-75"
      style={{ height: ROW_H }}
    >
      {/* Sticky player name */}
      <div
        className="sticky left-0 z-10 flex items-center"
        style={{
          width: STICKY_COL_WIDTH,
          minWidth: STICKY_COL_WIDTH,
          background: "#05070A",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          paddingLeft: "clamp(12px,3vw,20px)",
          paddingRight: 6,
        }}
      >
        <button
          onClick={() => onPlayerClick?.(player.player_id)}
          className="text-left w-full truncate"
          title={player.player_name}
        >
          <span className="text-[11px] font-medium text-white/80 truncate leading-none hover:text-white transition-colors">
            {player.player_name}
          </span>
          {player.position_group && (
            <span className="block text-[9px] text-white/30 leading-none mt-0.5">
              {player.position_group}
            </span>
          )}
        </button>
      </div>

      {/* L5 avg */}
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: L5_COL_WIDTH }}
      >
        <span className="text-[10px] font-medium text-white/50">
          {fmtAvg(player.last_5_avg)}
        </span>
      </div>

      {/* Threshold cells */}
      {thresholds.map((t) => {
        const isSelected = t === selectedLine;
        const entry = hitRates[String(t)];
        const hits = entry?.hits != null ? Number(entry.hits) : null;
        const games = entry?.games != null ? Number(entry.games) : null;
        const rate = entry?.rate != null ? Number(entry.rate) : null;
        const hasData = hits !== null && games !== null && games > 0;

        return (
          <div
            key={t}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-[1px]"
            style={{
              width: CELL_WIDTH,
              background: isSelected ? "rgba(255,255,255,0.035)" : undefined,
              borderLeft: isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
              borderRight: isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
            }}
          >
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: cellTextColour(rate, hasData) }}
            >
              {fmtHitsGames(hits, games, hasData)}
            </span>
            {hasData && rate !== null && (
              <span
                className="text-[8px] font-medium leading-none"
                style={{ color: rateColour(rate).replace("0.75", "0.9") }}
              >
                {fmtRate(rate)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
