import { useRef, useEffect, useCallback, memo } from "react";
import { ChevronRight } from "lucide-react";
import type { ComparePlayer } from "./currentWeekTypes";
import { rateColour, cellTextColour, fmtHitsGames, fmtRate, fmtAvg } from "./currentWeekUtils";

interface Props {
  players: ComparePlayer[];
  thresholds: readonly number[];
  selectedLine: number;
  onSelectLine: (line: number) => void;
  /** External scroll container ref for synchronisation. Must be a unique ref per table. */
  externalScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Called when user scrolls so parent can mirror to the other table. */
  onScroll?: (scrollLeft: number) => void;
  /** Called after the selected-line centering settles, with the final scrollLeft. */
  onCentered?: (scrollLeft: number) => void;
  onPlayerClick?: (playerName: string) => void;
  teamLabel?: string;
  /** id applied to the scroll container for aria-controls references */
  scrollContainerId?: string;
}

/*
 * Layout constants.
 *
 * Player column: sticky at left=0, ~200px desktop / min 120px
 * L5 column:     sticky at left=PLAYER_W, ~68px desktop / min 44px
 * Each threshold cell: 72px desktop minimum
 */
const PLAYER_W  = 200;  // px, sticky Player column
const L5_W      = 68;   // px, sticky L5 column
const THRESH_W  = 72;   // px, each threshold column
const ROW_H     = 34;
const HDR_BG    = "#05070A";
const CELL_BG   = "#05070A";

/** Compute horizontal scroll offset so the selected column is centred. */
function computeCentreOffset(
  containerWidth: number,
  playerW: number,
  l5W: number,
  threshW: number,
  idx: number,
  totalThresholds: number,
): number {
  const stickyWidth = playerW + l5W;
  const scrollableWidth = containerWidth - stickyWidth;
  const cellLeft = idx * threshW;
  const target = cellLeft - scrollableWidth / 2 + threshW / 2;
  const maxScroll = totalThresholds * threshW - scrollableWidth;
  return Math.max(0, Math.min(target, Math.max(0, maxScroll)));
}

export const MatchupComparisonTable = memo(function MatchupComparisonTable({
  players,
  thresholds,
  selectedLine,
  onSelectLine,
  externalScrollRef,
  onScroll,
  onCentered,
  onPlayerClick,
  teamLabel = "team",
  scrollContainerId,
}: Props) {
  const suppressSync = useRef(false);
  const leftFadeRef  = useRef<HTMLDivElement | null>(null);
  const rightFadeRef = useRef<HTMLDivElement | null>(null);

  /** Update fade overlays via direct DOM mutation to avoid re-renders. */
  const updateFades = useCallback(() => {
    const el = externalScrollRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd   = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    if (leftFadeRef.current)  leftFadeRef.current.style.opacity  = atStart ? "0" : "1";
    if (rightFadeRef.current) rightFadeRef.current.style.opacity = atEnd   ? "0" : "1";
  }, [externalScrollRef]);

  // Centre the selected column in the scroll container
  const centerSelectedColumn = useCallback(() => {
    const container = externalScrollRef.current;
    if (!container) return;
    const totalScrollWidth = PLAYER_W + L5_W + thresholds.length * THRESH_W;
    if (totalScrollWidth <= container.clientWidth) {
      return;
    }
    const idx = thresholds.indexOf(selectedLine);
    if (idx < 0) return;
    const target = computeCentreOffset(
      container.clientWidth,
      PLAYER_W,
      L5_W,
      THRESH_W,
      idx,
      thresholds.length,
    );
    // Suppress outgoing scroll events so we don't create a sync loop
    suppressSync.current = true;
    container.scrollLeft = target;
    requestAnimationFrame(() => {
      suppressSync.current = false;
      updateFades();
      onCentered?.(container.scrollLeft);
    });
  }, [selectedLine, thresholds, externalScrollRef, updateFades, onCentered]);

  // Re-centre when selected line changes
  useEffect(() => {
    centerSelectedColumn();
  }, [centerSelectedColumn]);

  // Refresh fades when threshold set changes (overflow may change)
  useEffect(() => {
    updateFades();
  }, [thresholds, updateFades]);

  // Forward scroll events to parent for cross-table sync
  useEffect(() => {
    const el = externalScrollRef.current;
    if (!el) return;
    const handler = () => {
      updateFades();
      if (suppressSync.current) return;
      onScroll?.(el.scrollLeft);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [externalScrollRef, onScroll, updateFades]);

  if (!players.length) {
    return (
      <div
        className="text-center py-5 text-[11px] text-white/25"
        style={{ paddingInline: "var(--page-px)" }}
        role="status"
        aria-label={`No players found for ${teamLabel}`}
      >
        No players found
      </div>
    );
  }

  const totalMinWidth = PLAYER_W + L5_W + thresholds.length * THRESH_W;

  return (
    <div className="relative">
      {/* Left overflow fade — visible after scrolling away from start */}
      <div
        ref={leftFadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 bottom-0 z-30 transition-opacity duration-150"
        style={{
          width: 48,
          opacity: 0,
          background: `linear-gradient(to right, ${CELL_BG} 0%, transparent 100%)`,
        }}
      />

      <div
        id={scrollContainerId}
        ref={externalScrollRef}
        data-testid="table-scroll-container"
        className="overflow-x-auto no-scrollbar"
        style={{ WebkitOverflowScrolling: "touch" }}
        role="region"
        aria-label={`${teamLabel} player comparison table`}
      >
        <table
          data-testid="comparison-table"
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "collapse",
            minWidth: totalMinWidth,
          }}
          role="grid"
          aria-label={`${teamLabel} player comparison`}
        >
          <colgroup>
            <col style={{ width: PLAYER_W }} />
            <col style={{ width: L5_W }} />
            {thresholds.map((t) => (
              <col key={t} style={{ width: THRESH_W }} />
            ))}
          </colgroup>

          {/* Sticky header row */}
          <thead>
            <tr
              style={{
                background: HDR_BG,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* Sticky: Player */}
              <th
                scope="col"
                style={{
                  height: ROW_H,
                  paddingLeft: "var(--page-px)",
                  paddingRight: 8,
                  textAlign: "left",
                  verticalAlign: "middle",
                  position: "sticky",
                  left: 0,
                  zIndex: 22,
                  background: HDR_BG,
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
                  Player
                </span>
              </th>

              {/* Sticky: L5 */}
              <th
                scope="col"
                style={{
                  height: ROW_H,
                  textAlign: "center",
                  verticalAlign: "middle",
                  position: "sticky",
                  left: PLAYER_W,
                  zIndex: 21,
                  background: HDR_BG,
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
                  L5
                </span>
              </th>

              {/* Threshold headers */}
              {thresholds.map((t) => {
                const isSelected = t === selectedLine;
                return (
                  <th
                    key={t}
                    scope="col"
                    style={{ height: ROW_H, padding: 0 }}
                  >
                    <button
                      onClick={() => onSelectLine(t)}
                      className={[
                        "w-full h-full flex items-center justify-center transition-colors duration-100",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                        isSelected
                          ? "text-white bg-white/[0.07]"
                          : "text-white/30 hover:text-white/60 hover:bg-white/[0.03]",
                      ].join(" ")}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        borderBottom: isSelected
                          ? "2px solid rgba(255,255,255,0.35)"
                          : "2px solid transparent",
                        minHeight: ROW_H,
                      }}
                      aria-label={`Select line ${t}+`}
                      aria-pressed={isSelected}
                    >
                      {t}+
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {players.map((cp) => (
              <TableRow
                key={cp.player.player_id}
                cp={cp}
                thresholds={thresholds}
                selectedLine={selectedLine}
                onPlayerClick={onPlayerClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Right overflow fade — hidden when at the rightmost position */}
      <div
        ref={rightFadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 bottom-0 z-30 transition-opacity duration-150"
        style={{
          width: 48,
          opacity: 1,
          background: `linear-gradient(to left, ${CELL_BG} 0%, transparent 100%)`,
        }}
      />
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
  onPlayerClick?: (playerName: string) => void;
}) {
  const { player } = cp;
  const hitRates = player.season_threshold_hit_rates ?? player.all_threshold_hit_rates ?? {};
  const isClickable = !!onPlayerClick;

  return (
    <tr
      className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors duration-75 group"
      style={{ height: ROW_H }}
      aria-label={`${player.player_name}${player.position_group ? `, ${player.position_group}` : ""}`}
    >
      {/* Sticky: Player name */}
      <td
        style={{
          position: "sticky",
          left: 0,
          zIndex: 11,
          background: CELL_BG,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          paddingLeft: "var(--page-px)",
          paddingRight: 6,
          verticalAlign: "middle",
        }}
      >
        <button
          onClick={() => onPlayerClick?.(player.player_name)}
          disabled={!isClickable}
          className={[
            "text-left w-full truncate flex items-center gap-1",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
            isClickable ? "cursor-pointer" : "cursor-default",
          ].join(" ")}
          title={player.player_name}
          aria-label={`Open ${player.player_name} player page`}
        >
          <div className="flex-1 min-w-0">
            <span
              className={[
                "text-[11.5px] font-medium leading-none truncate block",
                isClickable
                  ? "text-white/85 group-hover:text-white group-hover:underline underline-offset-2 decoration-white/20 transition-colors"
                  : "text-white/85",
              ].join(" ")}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {player.player_name}
            </span>
            {player.position_group && (
              <span className="block text-[9px] text-white/30 leading-none mt-0.5">
                {player.position_group}
              </span>
            )}
          </div>
          {isClickable && (
            <ChevronRight
              size={10}
              className="text-white/20 group-hover:text-white/50 flex-shrink-0 transition-colors"
              aria-hidden="true"
            />
          )}
        </button>
      </td>

      {/* Sticky: L5 avg */}
      <td
        style={{
          position: "sticky",
          left: PLAYER_W,
          zIndex: 10,
          background: CELL_BG,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
          verticalAlign: "middle",
        }}
        aria-label={`${player.player_name} last 5 average: ${fmtAvg(player.last_5_avg)}`}
      >
        <span
          className="text-[11px] font-medium text-white/55"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmtAvg(player.last_5_avg)}
        </span>
      </td>

      {/* Threshold cells */}
      {thresholds.map((t) => {
        const isSelected = t === selectedLine;
        const entry = hitRates[String(t)];
        const hits  = entry?.hits  != null ? Number(entry.hits)  : null;
        const games = entry?.games != null ? Number(entry.games) : null;
        const rate  = entry?.rate  != null ? Number(entry.rate)  : null;
        const hasData = hits !== null && games !== null && games > 0;
        const cellLabel = hasData
          ? `${t}+: ${fmtHitsGames(hits, games, hasData)}, ${fmtRate(rate)}`
          : `${t}+: no data`;

        return (
          <td
            key={t}
            style={{
              textAlign: "center",
              verticalAlign: "middle",
              background: isSelected ? "rgba(255,255,255,0.03)" : undefined,
              borderLeft:  isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
              borderRight: isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
            }}
            aria-label={`${player.player_name} ${cellLabel}`}
          >
            <span
              className="text-[10.5px] font-semibold leading-none block"
              style={{
                color: cellTextColour(rate, hasData),
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtHitsGames(hits, games, hasData)}
            </span>
            {hasData && rate !== null && (
              <span
                className="text-[8px] font-medium leading-none block"
                style={{ color: rateColour(rate).replace("0.75", "0.9") }}
                aria-hidden="true"
              >
                {fmtRate(rate)}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
});

// Export constants for use in centering tests
export { PLAYER_W, L5_W, THRESH_W, computeCentreOffset };
