import { useRef, useEffect, useCallback, memo } from "react";
import { ChevronRight } from "lucide-react";
import type { ComparePlayer } from "./currentWeekTypes";
import { rateColour, cellTextColour, fmtHitsGames, fmtRate, fmtAvg } from "./currentWeekUtils";

interface Props {
  players: ComparePlayer[];
  thresholds: readonly number[];
  selectedLine: number;
  onSelectLine: (line: number) => void;
  /** External scroll container ref for synchronisation (optional). */
  externalScrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Called when user scrolls so parent can mirror to the other table. */
  onScroll?: (scrollLeft: number) => void;
  onPlayerClick?: (playerName: string) => void;
  teamLabel?: string;
}

/*
 * Column proportion constants (used when the table fits in the viewport).
 * On narrow viewports the table overflows and uses fixed pixel minimums.
 *
 * Player column: 36% of table width (min 110px)
 * L5 column:     10% of table width (min 36px)
 * Each threshold: remainder / count (min 46px)
 */
const PLAYER_PCT = 36;
const L5_PCT = 10;
const THRESHOLD_MIN_PX = 46;
const PLAYER_MIN_PX = 110;
const L5_MIN_PX = 36;
const ROW_H = 34;

export const MatchupComparisonTable = memo(function MatchupComparisonTable({
  players,
  thresholds,
  selectedLine,
  onSelectLine,
  externalScrollRef,
  onScroll,
  onPlayerClick,
  teamLabel = "team",
}: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const suppressSync = useRef(false);

  const scrollContainer = externalScrollRef ?? innerRef;

  // Center selected column when it changes (only relevant when overflowing)
  const centerSelectedColumn = useCallback(() => {
    const container = scrollContainer.current;
    if (!container) return;
    // Only scroll if the table is actually overflowing
    if (container.scrollWidth <= container.clientWidth) return;
    const idx = thresholds.indexOf(selectedLine);
    if (idx < 0) return;
    const leftOfSelected = PLAYER_MIN_PX + L5_MIN_PX + idx * THRESHOLD_MIN_PX;
    const containerWidth = container.clientWidth;
    const scrollTarget = leftOfSelected - containerWidth / 2 + THRESHOLD_MIN_PX / 2;
    container.scrollLeft = Math.max(0, scrollTarget);
  }, [selectedLine, thresholds, scrollContainer]);

  useEffect(() => {
    centerSelectedColumn();
  }, [centerSelectedColumn]);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el || !onScroll) return;
    const handler = () => {
      if (suppressSync.current) return;
      onScroll(el.scrollLeft);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [scrollContainer, onScroll]);

  const syncScrollLeft = useCallback((left: number) => {
    const el = scrollContainer.current;
    if (!el) return;
    suppressSync.current = true;
    el.scrollLeft = left;
    requestAnimationFrame(() => { suppressSync.current = false; });
  }, [scrollContainer]);

  useEffect(() => {
    if (externalScrollRef && "sync" in (externalScrollRef as unknown as { sync?: unknown })) return;
    (scrollContainer as unknown as { sync: (left: number) => void }).sync = syncScrollLeft;
  }, [syncScrollLeft, scrollContainer, externalScrollRef]);

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

  /*
   * The table uses a <table> element with table-layout:fixed and width:100%.
   * This ensures proper proportional column widths on desktop.
   * On mobile where thresholds overflow, we wrap in an overflow-x:auto div.
   *
   * Column widths:
   *   Player: max(PLAYER_MIN_PX, PLAYER_PCT%)  — via colgroup
   *   L5:     max(L5_MIN_PX, L5_PCT%)
   *   Each threshold: equal share of remaining space
   */

  return (
    <div
      ref={externalScrollRef ? undefined : innerRef}
      {...(externalScrollRef ? { ref: externalScrollRef } : {})}
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
          minWidth: PLAYER_MIN_PX + L5_MIN_PX + thresholds.length * THRESHOLD_MIN_PX,
        }}
        role="grid"
        aria-label={`${teamLabel} player comparison`}
      >
        <colgroup>
          <col style={{ width: `${PLAYER_PCT}%` }} />
          <col style={{ width: `${L5_PCT}%` }} />
          {thresholds.map((t) => (
            <col key={t} />
          ))}
        </colgroup>

        {/* Header */}
        <thead>
          <tr
            style={{
              background: "#05070A",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* Player */}
            <th
              scope="col"
              style={{
                height: ROW_H,
                paddingLeft: "var(--page-px)",
                paddingRight: 8,
                textAlign: "left",
                borderRight: "1px solid rgba(255,255,255,0.06)",
                position: "sticky",
                left: 0,
                background: "#05070A",
                zIndex: 20,
              }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
                Player
              </span>
            </th>
            {/* L5 */}
            <th
              scope="col"
              style={{
                height: ROW_H,
                textAlign: "center",
                verticalAlign: "middle",
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
      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-75 group"
      style={{ height: ROW_H }}
      aria-label={`${player.player_name}${player.position_group ? `, ${player.position_group}` : ""}`}
    >
      {/* Sticky player name */}
      <td
        style={{
          position: "sticky",
          left: 0,
          background: "#05070A",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          paddingLeft: "var(--page-px)",
          paddingRight: 6,
          verticalAlign: "middle",
          zIndex: 10,
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
                "text-[11px] font-medium leading-none truncate block",
                isClickable
                  ? "text-white/80 group-hover:text-white group-hover:underline underline-offset-2 decoration-white/20 transition-colors"
                  : "text-white/80",
              ].join(" ")}
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

      {/* L5 avg */}
      <td
        style={{ textAlign: "center", verticalAlign: "middle" }}
        aria-label={`${player.player_name} last 5 average: ${fmtAvg(player.last_5_avg)}`}
      >
        <span className="text-[10px] font-medium text-white/50">
          {fmtAvg(player.last_5_avg)}
        </span>
      </td>

      {/* Threshold cells */}
      {thresholds.map((t) => {
        const isSelected = t === selectedLine;
        const entry = hitRates[String(t)];
        const hits = entry?.hits != null ? Number(entry.hits) : null;
        const games = entry?.games != null ? Number(entry.games) : null;
        const rate = entry?.rate != null ? Number(entry.rate) : null;
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
              background: isSelected ? "rgba(255,255,255,0.035)" : undefined,
              borderLeft: isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
              borderRight: isSelected ? "1px solid rgba(255,255,255,0.08)" : undefined,
            }}
            aria-label={`${player.player_name} ${cellLabel}`}
          >
            <span
              className="text-[10px] font-semibold leading-none block"
              style={{ color: cellTextColour(rate, hasData) }}
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
